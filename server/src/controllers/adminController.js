const fs = require("fs");
const path = require("path");
const Publisher = require("../models/Publisher");
const ScrubJob = require("../models/ScrubJob");
const GlobalConfig = require("../models/GlobalConfig");
const {
  getOrCreateGlobalConfig,
  getGlobalUsageSnapshot,
  getUsageSnapshot,
  validatePublisherLimit,
} = require("../services/limitService");
const { todayKey } = require("../utils/dateKey");

async function getConfig(req, res) {
  const snapshot = await getGlobalUsageSnapshot(todayKey());
  res.json({
    totalDailyLimit: snapshot.totalDailyLimit,
    usedToday: snapshot.globalUsed,
    remainingToday: snapshot.globalRemaining,
    dateKey: snapshot.dateKey,
  });
}

async function updateConfig(req, res) {
  const { totalDailyLimit } = req.body;
  if (!Number.isFinite(totalDailyLimit) || totalDailyLimit < 0) {
    return res.status(400).json({ error: "totalDailyLimit must be a non-negative number" });
  }

  const publishers = await Publisher.find({ active: true });
  const sumOfLimits = publishers.reduce((sum, p) => sum + p.dailyLimit, 0);
  if (sumOfLimits > totalDailyLimit) {
    return res.status(400).json({
      error: `Cannot set total limit below the sum of active publisher limits (${sumOfLimits})`,
    });
  }

  const config = await GlobalConfig.findOneAndUpdate(
    { key: "global" },
    { totalDailyLimit },
    { upsert: true, new: true }
  );

  res.json({ totalDailyLimit: config.totalDailyLimit });
}

async function listPublishers(req, res) {
  const publishers = await Publisher.find().sort({ name: 1 });
  const dateKey = todayKey();

  const withUsage = await Promise.all(
    publishers.map(async (p) => {
      const snapshot = await getUsageSnapshot(p._id, dateKey);
      return {
        id: p._id,
        name: p.name,
        dailyLimit: p.dailyLimit,
        active: p.active,
        usedToday: snapshot.publisherUsed,
        remainingToday: snapshot.publisherRemaining,
        createdAt: p.createdAt,
      };
    })
  );

  res.json({ publishers: withUsage, dateKey });
}

async function createPublisher(req, res) {
  const { name, dailyLimit } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
    return res.status(400).json({ error: "dailyLimit must be a non-negative number" });
  }

  const config = await getOrCreateGlobalConfig();
  await validatePublisherLimit({
    publisherIdBeingEdited: null,
    newLimit: dailyLimit,
    totalDailyLimit: config.totalDailyLimit,
  });

  const existing = await Publisher.findOne({ slug: Publisher.toSlug(name) });
  if (existing) {
    return res.status(409).json({ error: "A publisher with this name already exists" });
  }

  const publisher = await Publisher.create({ name: name.trim(), dailyLimit });
  res.status(201).json({ id: publisher._id, name: publisher.name, dailyLimit: publisher.dailyLimit });
}

async function updatePublisher(req, res) {
  const { id } = req.params;
  const { dailyLimit, active, name } = req.body;

  const publisher = await Publisher.findById(id);
  if (!publisher) return res.status(404).json({ error: "Publisher not found" });

  if (dailyLimit !== undefined) {
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
      return res.status(400).json({ error: "dailyLimit must be a non-negative number" });
    }
    const config = await getOrCreateGlobalConfig();
    await validatePublisherLimit({
      publisherIdBeingEdited: id,
      newLimit: dailyLimit,
      totalDailyLimit: config.totalDailyLimit,
    });
    publisher.dailyLimit = dailyLimit;
  }

  if (active !== undefined) publisher.active = !!active;
  if (name !== undefined && name.trim()) publisher.name = name.trim();

  await publisher.save();
  res.json({ id: publisher._id, name: publisher.name, dailyLimit: publisher.dailyLimit, active: publisher.active });
}

async function listJobs(req, res) {
  const { publisherId, dateKey, status, page = 1, limit = 25 } = req.query;

  const filter = {};
  if (publisherId) filter.publisherId = publisherId;
  if (dateKey) filter.dateKey = dateKey;
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

  const [jobs, total] = await Promise.all([
    ScrubJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize),
    ScrubJob.countDocuments(filter),
  ]);

  res.json({ jobs, total, page: pageNum, pageSize });
}

async function deleteJob(req, res) {
  const job = await ScrubJob.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (["queued", "analyzing", "processing"].includes(job.status)) {
    return res.status(409).json({
      error: "Cannot delete a job that is still queued or in progress",
    });
  }

  // The input/output files for a job always live together in one directory
  // (see middleware/upload.js) - remove it, then the job record.
  const jobDir = path.dirname(job.inputPath);
  await fs.promises.rm(jobDir, { recursive: true, force: true });
  await ScrubJob.deleteOne({ _id: job._id });

  res.json({ success: true });
}

module.exports = {
  getConfig,
  updateConfig,
  listPublishers,
  createPublisher,
  updatePublisher,
  listJobs,
  deleteJob,
};
