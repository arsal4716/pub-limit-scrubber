const fs = require("fs");
const path = require("path");
const Publisher = require("../models/Publisher");
const ScrubJob = require("../models/ScrubJob");
const { getOrCreateGlobalConfig, updateGlobalDailyLimit } = require("../services/limitService");
const {
  getCapacityInfo,
  getBuyerAdminSnapshot,
  updateBuyerDailyLimit,
  validateGlobalLimitChange,
  validatePublisherActivation,
  getPublisherUsageSnapshot,
} = require("../services/buyerLimitService");
const { todayKey } = require("../utils/dateKey");
const { BUYER_KEYS, BUYER_LABELS } = require("../constants/buyers");

async function getConfig(req, res) {
  const [globalConfig, capacity] = await Promise.all([getOrCreateGlobalConfig(), getCapacityInfo()]);
  res.json({
    totalDailyLimit: globalConfig.totalDailyLimit,
    activePublisherCount: capacity.activePublisherCount,
    perPublisherCapacity: capacity.perPublisherCapacity,
    maxSupportablePublishers: capacity.maxSupportablePublishers,
    dateKey: todayKey(),
  });
}

async function updateConfig(req, res) {
  const { totalDailyLimit } = req.body;
  if (!Number.isFinite(totalDailyLimit) || totalDailyLimit < 0) {
    return res.status(400).json({ error: "totalDailyLimit must be a non-negative number" });
  }

  await validateGlobalLimitChange(totalDailyLimit);
  const config = await updateGlobalDailyLimit(totalDailyLimit);
  res.json({ totalDailyLimit: config.totalDailyLimit });
}

async function getBuyerConfig(req, res) {
  const snapshot = await getBuyerAdminSnapshot(todayKey());
  res.json({
    ...snapshot,
    buyers: snapshot.buyers.map((b) => ({ ...b, label: BUYER_LABELS[b.key] })),
  });
}

async function updateBuyerConfig(req, res) {
  const { key, dailyLimit } = req.body;
  if (!BUYER_KEYS.includes(key)) {
    return res.status(400).json({ error: `key must be one of: ${BUYER_KEYS.join(", ")}` });
  }
  if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
    return res.status(400).json({ error: "dailyLimit must be a non-negative number" });
  }

  const config = await updateBuyerDailyLimit(key, dailyLimit);
  res.json({ key: config.key, dailyLimit: config.dailyLimit, label: BUYER_LABELS[config.key] });
}

async function listPublishers(req, res) {
  const publishers = await Publisher.find().sort({ name: 1 });
  const dateKey = todayKey();

  const withUsage = await Promise.all(
    publishers.map(async (p) => {
      const snapshot = await getPublisherUsageSnapshot(p._id, dateKey);
      return {
        id: p._id,
        name: p.name,
        dailyLimit: snapshot.dailyLimit, // derived: sum of both buyers' per-publisher allotments
        active: p.active,
        usedToday: snapshot.usedToday,
        remainingToday: snapshot.remainingToday,
        buyers: snapshot.buyers,
        createdAt: p.createdAt,
      };
    })
  );

  res.json({ publishers: withUsage, dateKey });
}

async function createPublisher(req, res) {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const existing = await Publisher.findOne({ slug: Publisher.toSlug(name) });
  if (existing) {
    return res.status(409).json({ error: "A publisher with this name already exists" });
  }

  // New publishers default to active - validate that one more active
  // publisher still fits under the global capacity ceiling.
  const activeCount = await Publisher.countDocuments({ active: true });
  await validatePublisherActivation(activeCount + 1);

  const publisher = await Publisher.create({ name: name.trim() });
  res.status(201).json({ id: publisher._id, name: publisher.name, active: publisher.active });
}

async function updatePublisher(req, res) {
  const { id } = req.params;
  const { active, name } = req.body;

  const publisher = await Publisher.findById(id);
  if (!publisher) return res.status(404).json({ error: "Publisher not found" });

  if (active !== undefined && !!active && !publisher.active) {
    const activeCount = await Publisher.countDocuments({ active: true });
    await validatePublisherActivation(activeCount + 1);
  }

  if (active !== undefined) publisher.active = !!active;
  if (name !== undefined && name.trim()) publisher.name = name.trim();

  await publisher.save();
  res.json({ id: publisher._id, name: publisher.name, active: publisher.active });
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
  getBuyerConfig,
  updateBuyerConfig,
  listPublishers,
  createPublisher,
  updatePublisher,
  listJobs,
  deleteJob,
};
