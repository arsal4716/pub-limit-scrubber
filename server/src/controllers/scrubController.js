const fs = require("fs");
const path = require("path");
const Publisher = require("../models/Publisher");
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
  const { publisherName } = req.body;

  if (!publisherName || !publisherName.trim()) {
    cleanupUpload(req);
    return res.status(400).json({ error: "publisherName is required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "A CSV file is required" });
  }

  const slug = Publisher.toSlug(publisherName);
  const publisher = await Publisher.findOne({ slug, active: true });

  if (!publisher) {
    cleanupUpload(req);
    return res.status(404).json({
      error: `Publisher "${publisherName}" is not recognized. Ask an admin to add it first.`,
    });
  }

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

function cleanupUpload(req) {
  if (req.jobDir) {
    fs.rm(req.jobDir, { recursive: true, force: true }, () => {});
  }
}

async function getStatus(req, res) {
  const job = await ScrubJob.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(jobToStatusDto(job));
}

async function downloadOutput(req, res) {
  const job = await ScrubJob.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
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
  const { publisherName } = req.query;
  if (!publisherName) {
    return res.status(400).json({ error: "publisherName query param is required" });
  }

  const slug = Publisher.toSlug(publisherName);
  const publisher = await Publisher.findOne({ slug });
  if (!publisher) return res.json({ jobs: [] });

  const jobs = await ScrubJob.find({ publisherId: publisher._id })
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
