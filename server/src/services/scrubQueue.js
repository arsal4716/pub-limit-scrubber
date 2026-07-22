const path = require("path");
const ScrubJob = require("../models/ScrubJob");
const { analyzeFile, writeOutputFile } = require("./csvService");
const { processPhones, leadsPerMinuteRate } = require("./buyerApiClient");
const { reserveQuota } = require("./limitService");
const { detectDelimiter } = require("../utils/csvDelimiter");

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
      console.error(`[scrubQueue] job ${jobId} failed:`, err);
      await ScrubJob.findByIdAndUpdate(jobId, {
        status: "failed",
        errorMessage: err.message,
      });
    }
  }

  isRunning = false;
}

async function runJob(jobId) {
  const job = await ScrubJob.findById(jobId);
  if (!job) return;
  if (job.status === "completed") return;

  job.status = "analyzing";
  job.startedAt = job.startedAt || new Date();
  await job.save();

  const delimiter = await detectDelimiter(job.inputPath);
  const analysis = await analyzeFile(job.inputPath, delimiter);

  job.totalRows = analysis.totalRows;
  job.invalidPhoneCount = analysis.invalidPhoneCount;
  job.duplicateInFileCount = analysis.duplicateInFileCount;
  job.uniquePhoneCount = analysis.uniquePhonesOrdered.length;

  let allowedCount = job.allowedCount;
  if (!job.quotaReserved) {
    allowedCount = await reserveQuota(job.publisherId, analysis.uniquePhonesOrdered.length);
    job.allowedCount = allowedCount;
    job.quotaReserved = true;
  }
  job.skippedOverLimitCount = analysis.uniquePhonesOrdered.length - allowedCount;
  job.estimatedSeconds = Math.ceil((allowedCount / leadsPerMinuteRate()) * 60);
  job.status = "processing";
  await job.save();

  const phonesToProcess = analysis.uniquePhonesOrdered.slice(0, allowedCount);
  const phonesToProcessSet = new Set(phonesToProcess);
  const phoneResults = new Map();

  if (phonesToProcess.length > 0) {
    await processPhones(
      phonesToProcess,
      (phone, result) => {
        phoneResults.set(phone, result);
        if (result.duplicate === "Yes") job.blockedCount += 1;
        else if (result.duplicate === "Error") job.apiErrorCount += 1;
        else job.acceptedCount += 1;
      },
      async (processedSoFar) => {
        job.processedCount = processedSoFar;
        await job.save();
      }
    );
  }

  const outputPath = path.join(path.dirname(job.inputPath), "output.csv");
  await writeOutputFile(job.inputPath, outputPath, { phoneResults, phonesToProcessSet, delimiter });

  job.outputPath = outputPath;
  job.status = "completed";
  job.completedAt = new Date();
  await job.save();
}

// On boot, resume any jobs left mid-flight by a previous process crash.
// Buyer API checks are read-only/idempotent, so re-running analysis and
// (already-reserved) quota is safe; `quotaReserved` prevents double-reserving.
async function recoverInterruptedJobs() {
  const stuck = await ScrubJob.find({
    status: { $in: ["queued", "analyzing", "processing"] },
  });

  for (const job of stuck) {
    // Reset progress counters - processPhones() will rebuild them from
    // scratch on this run, so any partial counts from before the crash
    // must not be added on top.
    job.processedCount = 0;
    job.acceptedCount = 0;
    job.blockedCount = 0;
    job.apiErrorCount = 0;
    job.status = "queued";
    await job.save();
    enqueueJob(String(job._id));
  }

  if (stuck.length > 0) {
    console.log(`[scrubQueue] recovered ${stuck.length} interrupted job(s)`);
  }
}

module.exports = { enqueueJob, recoverInterruptedJobs, pendingPhoneCountAhead };
