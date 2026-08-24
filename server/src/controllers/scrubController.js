const fs = require("fs");
const path = require("path");
const ScrubJob = require("../models/ScrubJob");
const { enqueueJob, pendingPhoneCountAhead } = require("../services/scrubQueue");
const { leadsPerMinuteRate } = require("../services/buyerApiClient");
const { todayKey } = require("../utils/dateKey");
const { PHONE_HEADER_CANDIDATES, STATE_HEADER_CANDIDATES } = require("../services/phoneUtils");

function jobToStatusDto(job) {
  return {
    id: job._id,
    publisherName: job.publisherName,
    originalFilename: job.originalFilename,
    status: job.status,
    errorMessage: job.errorMessage,
    totalRows: job.totalRows,
    invalidPhoneCount: job.invalidPhoneCount,
    duplicateInFileCount: job.duplicateInFileCount,
    uniquePhoneCount: job.uniquePhoneCount,
    internalDncCount: job.internalDncCount,
    allowedCount: job.allowedCount,
    skippedOverLimitCount: job.skippedOverLimitCount,
    processedCount: job.processedCount,
    acceptedCount: job.acceptedCount,
    blockedCount: job.blockedCount,
    apiErrorCount: job.apiErrorCount,
    buyerStats: job.buyerStats, // anonymized buyer1/buyer2 breakdown only
    estimatedSeconds: job.estimatedSeconds,
    rateLimitEnabled: job.rateLimitEnabled,
    rateLimitPerMinute: job.rateLimitPerMinute,
    leadsPerMinuteRate: leadsPerMinuteRate(job.rateLimitEnabled, job.rateLimitPerMinute),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    downloadReady: job.status === "completed" && !!job.outputPath,
  };
}

async function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "A CSV file is required" });
  }

  // req.publisher comes from the requirePublisher auth middleware - never
  // trust a publisher name/id from the request body for this, otherwise
  // any logged-in publisher could upload (and later download) files under
  // another publisher's name just by knowing it.
  const publisher = req.publisher;

  const job = await ScrubJob.create({
    publisherId: publisher._id,
    publisherName: publisher.name,
    originalFilename: req.file.originalname,
    inputPath: req.file.path,
    dateKey: todayKey(),
    status: "queued",
  });

  enqueueJob(String(job._id));

  res.status(201).json({
    jobId: job._id,
    queuePosition: pendingPhoneCountAhead(),
  });
}

// A job that exists but belongs to someone else is reported as "not
// found" rather than "forbidden" - that way a publisher (or a guessed
// job ID) can't even confirm another publisher's job exists.
function isOwnJob(req, job) {
  return req.isAdmin || String(job.publisherId) === String(req.publisher._id);
}

async function getStatus(req, res) {
  const job = await ScrubJob.findById(req.params.jobId);
  if (!job || !isOwnJob(req, job)) return res.status(404).json({ error: "Job not found" });
  res.json(jobToStatusDto(job));
}

async function downloadOutput(req, res) {
  const job = await ScrubJob.findById(req.params.jobId);
  if (!job || !isOwnJob(req, job)) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "completed" || !job.outputPath) {
    return res.status(409).json({ error: "File is not ready yet" });
  }
  if (!fs.existsSync(job.outputPath)) {
    return res.status(410).json({ error: "Output file no longer exists" });
  }

  const downloadName = `scrubbed-${path.basename(job.originalFilename, ".csv")}-${job._id}.csv`;
  res.download(job.outputPath, downloadName);
}

function getUploadRequirements(req, res) {
  res.json({
    acceptedPhoneHeaders: PHONE_HEADER_CANDIDATES,
    acceptedStateHeaders: STATE_HEADER_CANDIDATES,
    acceptedDelimiters: [",", ";"],
  });
}

async function listJobsForPublisher(req, res) {
  // req.publisher (from requirePublisher) - never take this from a query
  // param, otherwise any logged-in publisher could list another
  // publisher's jobs just by passing their name.
  const jobs = await ScrubJob.find({ publisherId: req.publisher._id })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({ jobs: jobs.map(jobToStatusDto) });
}

module.exports = {
  uploadFile,
  getStatus,
  downloadOutput,
  listJobsForPublisher,
  getUploadRequirements,
};
