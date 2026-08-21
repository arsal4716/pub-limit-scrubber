const path = require("path");
const ScrubJob = require("../models/ScrubJob");
const Publisher = require("../models/Publisher");
const { analyzeFile, writeOutputFile } = require("./csvService");
const { processPhonesSplit, leadsPerMinuteRate } = require("./buyerApiClient");
const { checkPhonesForDnc } = require("./internalDncClient");
const { getPublisherBuyerLimits } = require("./buyerLimitService");
const { getOrCreateGlobalConfig } = require("./limitService");
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

// Single, sequential, in-process worker. Only one job runs at a time, which
// automatically respects the buyer API's global rate limit (each job already
// throttles itself internally) without needing a separate cross-job limiter.
const queue = [];
let isRunning = false;

function pendingPhoneCountAhead() {
  // Best-effort estimate for wait-time messaging; queued jobs haven't been
  // analyzed yet so we don't know their unique phone counts up front.
  return queue.length;
}

function enqueueJob(jobId) {
  queue.push(jobId);
  runLoop();
}

async function runLoop() {
  if (isRunning) return;
  isRunning = true;

  while (queue.length > 0) {
    const jobId = queue.shift();
    try {
      await runJob(jobId);
    } catch (err) {
      // Full detail goes to the server log for debugging; publishers only
      // ever see a generic message - internal errors (DB, network, etc.)
      // should never leak raw driver/library text to end users.
      console.error(`[scrubQueue] job ${jobId} failed:`, err);
      await ScrubJob.findByIdAndUpdate(jobId, {
        status: "failed",
        errorMessage: "An unexpected error occurred while processing this file. Please try again or contact an admin.",
      });
    }
  }

  isRunning = false;
}

async function runJob(jobId) {
  const job = await ScrubJob.findById(jobId);
  if (!job) return;
  if (job.status === "completed") return;

  const [publisher, globalConfig] = await Promise.all([
    Publisher.findById(job.publisherId),
    getOrCreateGlobalConfig(),
  ]);
  const buyerLimits = getPublisherBuyerLimits(publisher ? publisher.dailyLimit : 0);
  const rateLimitEnabled = globalConfig.rateLimitEnabled;
  const ratePerMinute = globalConfig.rateLimitPerMinute;

  job.status = "analyzing";
  job.startedAt = job.startedAt || new Date();
  await job.save();

  const delimiter = await detectDelimiter(job.inputPath);
  const analysis = await analyzeFile(job.inputPath, delimiter);

  job.totalRows = analysis.totalRows;
  job.invalidPhoneCount = analysis.invalidPhoneCount;
  job.duplicateInFileCount = analysis.duplicateInFileCount;
  job.uniquePhoneCount = analysis.uniquePhonesOrdered.length;

  // Every unique phone first goes through our own internal DNC/duplicate
  // check - not rate-limited, run as fast as the service allows. Anything
  // it flags as a duplicate is marked DNC right here and never reaches
  // either buyer; only the rest proceed to the buyer split below.
  const dncResults = await checkPhonesForDnc(analysis.uniquePhonesOrdered);
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
  const rate = leadsPerMinuteRate(rateLimitEnabled, ratePerMinute);
  job.estimatedSeconds = rate ? Math.ceil((job.allowedCount / rate) * 60) : 0;
  job.status = "processing";
  await job.save();

  if (phonesToProcess.length > 0) {
    // LM and HC process their own half of the list concurrently, so
    // progress callbacks can arrive from both at once - chain job.save()
    // calls so they never overlap (concurrent saves on the same in-memory
    // document would race on its version key).
    let saveChain = Promise.resolve();

    await processPhonesSplit(
      phonesToProcess,
      analysis.phoneStates,
      job.publisherId,
      buyerLimits,
      rateLimitEnabled,
      ratePerMinute,
      (phone, result) => {
        phoneResults.set(phone, result);
        applyResultToJob(job, result);
      },
      (processedSoFar) => {
        job.processedCount = processedSoFar;
        saveChain = saveChain.then(() => job.save());
        return saveChain;
      }
    );
  }

  const outputPath = path.join(path.dirname(job.inputPath), "output.csv");
  await writeOutputFile(job.inputPath, outputPath, { phoneResults, delimiter });

  job.outputPath = outputPath;
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
    status: { $in: ["queued", "analyzing", "processing"] },
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

module.exports = { enqueueJob, recoverInterruptedJobs, pendingPhoneCountAhead };
