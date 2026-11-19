const path = require("path");
const ScrubJob = require("../models/ScrubJob");
const Publisher = require("../models/Publisher");
const { analyzeFile, writeOutputFile } = require("./csvService");
const { processPhonesSplit, leadsPerMinuteRate } = require("./buyerApiClient");
const { checkPhonesForDnc } = require("./internalDncClient");
const { getPublisherBuyerLimits } = require("./buyerLimitService");
const { getOrCreateGlobalConfig, enabledBuyersFrom } = require("./limitService");
const env = require("../config/env");
const LeadCheck = require("../models/LeadCheck");
const { detectDelimiter } = require("../utils/csvDelimiter");

function applyBuyerStat(stat, status) {
  if (status === "Blocked") stat.blockedCount += 1;
  else if (status === "Available") stat.availableCount += 1;
  else if (status === "Error") stat.errorCount += 1;
  else if (status === "Not Checked") stat.notCheckedCount += 1;
}

// Rolls a single phone's result (from whichever one buyer it was routed
// to) into the job's running overall and per-buyer (anonymized
// buyer1/buyer2) counters.
function applyResultToJob(job, result) {
  if (result.status === "Blocked") job.blockedCount += 1;
  else if (result.status === "Error") job.apiErrorCount += 1;
  else if (result.status === "Available") job.acceptedCount += 1;
  else if (result.status === "Not Checked") job.skippedOverLimitCount += 1;

  applyBuyerStat(job.buyerStats[result.slot], result.status);
}

// In-process worker pool: up to env.maxConcurrentJobs jobs run at once
// (extra jobs wait in `queue`). While jobs are calling the buyer APIs they
// share the admin rate limit - see ratePerJob.
const queue = [];
const running = new Set();
// jobId -> publisherId, only while that job is in its buyer-calling phase
// (analysis / DNC checking don't use buyer capacity).
const scrubbing = new Map();

function pendingPhoneCountAhead() {
  // Best-effort estimate for wait-time messaging; queued jobs haven't been
  // analyzed yet so we don't know their unique phone counts up front.
  return queue.length;
}

// Per-buyer rate for one job: the admin target is split equally between
// the publishers scrubbing right now, and a publisher's own jobs split that
// publisher's slice (2 publishers -> 2500/min each of 5000; 3 -> ~1667).
// Never exposes who else is scrubbing - only the resulting number.
function ratePerJob(jobId, baseRate) {
  const publisherId = scrubbing.get(jobId);
  if (!publisherId) return baseRate;
  const publishers = new Set(scrubbing.values()).size;
  let ownJobs = 0;
  for (const p of scrubbing.values()) if (p === publisherId) ownJobs += 1;
  return Math.max(1, baseRate / publishers / ownJobs);
}

// For status pages: this job's current per-buyer rate and whether the
// capacity is being shared with another publisher (a flag, never a name).
function getJobRateInfo(jobId, baseRate) {
  const publisherId = scrubbing.get(String(jobId));
  const sharedWithOthers = publisherId ? new Set(scrubbing.values()).size > 1 : false;
  return { ratePerBuyer: ratePerJob(String(jobId), baseRate), sharedWithOthers };
}

function enqueueJob(jobId) {
  queue.push(jobId);
  pump();
}

function pump() {
  while (running.size < env.maxConcurrentJobs && queue.length > 0) {
    const jobId = queue.shift();
    running.add(jobId);
    execute(jobId).finally(() => {
      running.delete(jobId);
      scrubbing.delete(jobId);
      pump();
    });
  }
}

async function execute(jobId) {
  try {
    await runJob(jobId);
  } catch (err) {
    // Full detail goes to the server log for debugging; publishers only
    // ever see a generic message - internal errors (DB, network, etc.)
    // should never leak raw driver/library text to end users.
    console.error(`[scrubQueue] job ${jobId} failed:`, err);
    await ScrubJob.findByIdAndUpdate(jobId, {
      status: "failed",
      errorMessage: err.userFacing
        ? err.message
        : "An unexpected error occurred while processing this file. Please try again or contact an admin.",
    }).catch((e) => console.error("[scrubQueue] could not mark job failed:", e));
  }
}

const FILE_STATUS = {
  Blocked: "blocked",
  Available: "available",
  DNC: "dnc",
  Error: "error",
  "Not Checked": "not_checked",
};

// Saves every checked lead from a finished job to lead_checks (replacing
// rows from an earlier attempt at the same job, e.g. after a restart).
async function saveLeadChecks(job, publisherName, phoneResults, phoneStates) {
  await LeadCheck.deleteMany({ jobId: job._id });
  const CHUNK = 5000;
  let batch = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await LeadCheck.insertMany(batch, { ordered: false });
    batch = [];
  };
  for (const [phone, result] of phoneResults) {
    const status = FILE_STATUS[result.status];
    if (!status) continue;
    batch.push({
      phone,
      state: phoneStates.get(phone) || null,
      publisherId: job.publisherId,
      publisherName,
      status,
      isDuplicate: status === "blocked" || status === "dnc",
      reason: result.message || null,
      buyerSlot: result.slot || null,
      source: "file",
      jobId: job._id,
    });
    if (batch.length >= CHUNK) await flush();
  }
  await flush();
}

async function runJob(jobId) {
  const job = await ScrubJob.findById(jobId);
  if (!job) return;
  if (job.status === "completed") return;

  const [publisher, globalConfig] = await Promise.all([
    Publisher.findById(job.publisherId),
    getOrCreateGlobalConfig(),
  ]);
  const enabledBuyers = enabledBuyersFrom(globalConfig);
  if (!enabledBuyers.LM && !enabledBuyers.HC) {
    const err = new Error("No buyer API is enabled right now. Please contact an admin.");
    err.userFacing = true;
    throw err;
  }
  const buyerLimits = getPublisherBuyerLimits(publisher ? publisher.dailyLimit : 0, enabledBuyers);
  const rateLimitEnabled = globalConfig.rateLimitEnabled;
  const ratePerMinute = globalConfig.rateLimitPerMinute;

  job.status = "analyzing";
  job.startedAt = job.startedAt || new Date();
  await job.save();

  const delimiter = await detectDelimiter(job.inputPath);
  let analyzeSaveChain = Promise.resolve();
  const analysis = await analyzeFile(job.inputPath, delimiter, (p) => {
    job.totalRows = p.totalRows;
    job.uniquePhoneCount = p.uniqueCount;
    job.duplicateInFileCount = p.duplicateInFileCount;
    job.invalidPhoneCount = p.invalidPhoneCount;
    job.blankPhoneCount = p.blankPhoneCount;
    analyzeSaveChain = analyzeSaveChain.then(() => job.save()).catch(() => {});
  });
  await analyzeSaveChain;

  job.totalRows = analysis.totalRows;
  job.invalidPhoneCount = analysis.invalidPhoneCount;
  job.blankPhoneCount = analysis.blankPhoneCount;
  job.duplicateInFileCount = analysis.duplicateInFileCount;
  job.uniquePhoneCount = analysis.uniquePhonesOrdered.length;

  // Every unique phone first goes through our own internal DNC/duplicate
  // check - not rate-limited, run as fast as the service allows. Anything
  // it flags as a duplicate is marked DNC right here and never reaches
  // either buyer; only the rest proceed to the buyer split below.
  job.status = "checking";
  await job.save();
  let dncSaveChain = Promise.resolve();
  const dncResults = await checkPhonesForDnc(analysis.uniquePhonesOrdered, undefined, (checked, duplicates) => {
    job.dncCheckedCount = checked;
    job.internalDncCount = duplicates;
    dncSaveChain = dncSaveChain.then(() => job.save()).catch(() => {});
    return dncSaveChain;
  });
  await dncSaveChain;
  const phoneResults = new Map();
  const phonesToProcess = [];

  for (const phone of analysis.uniquePhonesOrdered) {
    const dnc = dncResults.get(phone);
    if (dnc && dnc.isDuplicate) {
      phoneResults.set(phone, { slot: "", buyerKey: "", status: "DNC", message: "Duplicate - internal DNC list" });
    } else {
      phonesToProcess.push(phone);
    }
  }

  // Each buyer's own per-publisher daily allotment naturally caps how many
  // of the remaining (non-DNC) phones actually get checked; anything over
  // that comes back "Not Checked" per phone (tallied into
  // skippedOverLimitCount as results arrive) rather than being sliced off
  // upfront.
  job.internalDncCount = analysis.uniquePhonesOrdered.length - phonesToProcess.length;
  job.allowedCount = phonesToProcess.length;
  job.skippedOverLimitCount = 0;
  job.rateLimitEnabled = rateLimitEnabled;
  job.rateLimitPerMinute = ratePerMinute;
  job.activeBuyerCount = (enabledBuyers.LM ? 1 : 0) + (enabledBuyers.HC ? 1 : 0);
  const rate = leadsPerMinuteRate(rateLimitEnabled, ratePerMinute, job.activeBuyerCount);
  job.estimatedSeconds = rate ? Math.ceil((job.allowedCount / rate) * 60) : 0;
  job.status = "processing";
  await job.save();

  if (phonesToProcess.length > 0) {
    // LM and HC process their own half of the list concurrently, so
    // progress callbacks can arrive from both at once - chain job.save()
    // calls so they never overlap (concurrent saves on the same in-memory
    // document would race on its version key).
    let saveChain = Promise.resolve();

    // From here until the buyer calls finish, this job counts toward the
    // rate-sharing split with other publishers' running jobs.
    const jobKey = String(job._id);
    scrubbing.set(jobKey, String(job.publisherId));
    await processPhonesSplit(
      phonesToProcess,
      analysis.phoneStates,
      job.publisherId,
      buyerLimits,
      rateLimitEnabled,
      () => ratePerJob(jobKey, ratePerMinute),
      (phone, result) => {
        phoneResults.set(phone, result);
        applyResultToJob(job, result);
      },
      (processedSoFar) => {
        job.processedCount = processedSoFar;
        saveChain = saveChain.then(() => job.save());
        return saveChain;
      },
      enabledBuyers,
      (paused) => {
        job.paused = paused;
        saveChain = saveChain.then(() => job.save());
        return saveChain;
      }
    );
  }

  scrubbing.delete(String(job._id));

  const outputPath = path.join(path.dirname(job.inputPath), "output.csv");
  await writeOutputFile(job.inputPath, outputPath, { phoneResults, delimiter, phoneColumn: analysis.phoneColumn });

  await saveLeadChecks(job, publisher ? publisher.name : job.publisherName, phoneResults, analysis.phoneStates);

  job.outputPath = outputPath;
  job.paused = false;
  job.status = "completed";
  job.completedAt = new Date();
  await job.save();
}

// On boot, resume any jobs left mid-flight by a previous process crash.
// Buyer API checks are read-only/idempotent, so re-running analysis is
// safe, though any buyer calls already made before the crash are re-sent
// (and re-counted against that publisher's daily allotment) - an accepted
// tradeoff for not needing to persist partial per-phone results.
async function recoverInterruptedJobs() {
  const stuck = await ScrubJob.find({
    status: { $in: ["queued", "analyzing", "checking", "processing"] },
  });

  for (const job of stuck) {
    // Reset progress counters - processPhonesSplit() will rebuild them from
    // scratch on this run, so any partial counts from before the crash
    // must not be added on top.
    job.processedCount = 0;
    job.acceptedCount = 0;
    job.blockedCount = 0;
    job.apiErrorCount = 0;
    job.skippedOverLimitCount = 0;
    job.internalDncCount = 0;
    job.dncCheckedCount = 0;
    job.buyerStats = {
      buyer1: { blockedCount: 0, availableCount: 0, errorCount: 0, notCheckedCount: 0 },
      buyer2: { blockedCount: 0, availableCount: 0, errorCount: 0, notCheckedCount: 0 },
    };
    job.status = "queued";
    await job.save();
    enqueueJob(String(job._id));
  }

  if (stuck.length > 0) {
    console.log(`[scrubQueue] recovered ${stuck.length} interrupted job(s)`);
  }
}

module.exports = { getJobRateInfo, enqueueJob, recoverInterruptedJobs, pendingPhoneCountAhead };
