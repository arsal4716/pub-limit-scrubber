const fs = require("fs");
const path = require("path");
const Publisher = require("../models/Publisher");
const ScrubJob = require("../models/ScrubJob");
const { getOrCreateGlobalConfig, updateGlobalDailyLimit, updateRateLimitSettings } = require("../services/limitService");
const {
  validateGlobalLimitChange,
  validatePublisherLimitChange,
  getPublisherUsageSnapshot,
  getGlobalCapacitySnapshot,
} = require("../services/buyerLimitService");
const { hashPassword } = require("../services/publisherAuthService");
const { todayKey } = require("../utils/dateKey");

const MIN_PASSWORD_LENGTH = 8;

async function getConfig(req, res) {
  const [snapshot, globalConfig] = await Promise.all([
    getGlobalCapacitySnapshot(),
    getOrCreateGlobalConfig(),
  ]);
  res.json({
    totalDailyLimit: snapshot.totalDailyLimit,
    usedToday: snapshot.committed, // sum of active publishers' own daily limits
    remainingToday: snapshot.remaining,
    activePublisherCount: snapshot.activePublisherCount,
    rateLimitEnabled: globalConfig.rateLimitEnabled,
    rateLimitPerMinute: globalConfig.rateLimitPerMinute,
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

async function updateRateLimit(req, res) {
  const { enabled, ratePerMinute } = req.body;

  if (enabled === undefined && ratePerMinute === undefined) {
    return res.status(400).json({ error: "enabled and/or ratePerMinute is required" });
  }
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  if (ratePerMinute !== undefined && (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0)) {
    return res.status(400).json({ error: "ratePerMinute must be a positive number" });
  }

  const config = await updateRateLimitSettings({ enabled, ratePerMinute });
  res.json({ rateLimitEnabled: config.rateLimitEnabled, rateLimitPerMinute: config.rateLimitPerMinute });
}

async function listPublishers(req, res) {
  // passwordHash is select:false by default - opt back in here just to
  // derive the `canLogin` boolean below; the raw hash itself is never
  // included in the response.
  const publishers = await Publisher.find().select("+passwordHash").sort({ name: 1 });
  const dateKey = todayKey();

  const withUsage = await Promise.all(
    publishers.map(async (p) => {
      const snapshot = await getPublisherUsageSnapshot(p._id, dateKey);
      return {
        id: p._id,
        name: p.name,
        email: p.email || null,
        dailyLimit: p.dailyLimit,
        active: p.active,
        signupStatus: p.signupStatus,
        allowedIps: p.allowedIps || [],
        canLogin: !!p.passwordHash,
        usedToday: snapshot.usedToday,
        remainingToday: snapshot.remainingToday,
        buyers: snapshot.buyers, // per-buyer half-limit + usage, informational
        createdAt: p.createdAt,
      };
    })
  );

  res.json({ publishers: withUsage, dateKey });
}

async function createPublisher(req, res) {
  const { name, dailyLimit, email, password } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
    return res.status(400).json({ error: "dailyLimit must be a non-negative number" });
  }
  if (password !== undefined && password !== "" && password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const existing = await Publisher.findOne({ slug: Publisher.toSlug(name) });
  if (existing) {
    return res.status(409).json({ error: "A publisher with this name already exists" });
  }

  const emailNormalized = email && email.trim() ? email.trim().toLowerCase() : null;
  if (emailNormalized) {
    const emailTaken = await Publisher.findOne({ email: emailNormalized });
    if (emailTaken) {
      return res.status(409).json({ error: "A publisher with this email already exists" });
    }
  }

  await validatePublisherLimitChange({
    publisherIdBeingEdited: null,
    currentLimit: null,
    newLimit: dailyLimit,
  });

  const publisher = new Publisher({ name: name.trim(), dailyLimit });
  if (emailNormalized) publisher.email = emailNormalized;
  // Admin-provisioned publishers are trusted immediately - no separate
  // approval step, unlike a public self-service signup. If no password is
  // set here, the publisher simply can't log in yet until an admin sets
  // one later or the publisher "claims" this name through the signup form.
  if (password) publisher.passwordHash = await hashPassword(password);
  await publisher.save();

  res.status(201).json({ id: publisher._id, name: publisher.name, dailyLimit: publisher.dailyLimit });
}

async function updatePublisher(req, res) {
  const { id } = req.params;
  const { dailyLimit, active, name, email, password, allowedIps, signupStatus } = req.body;

  const publisher = await Publisher.findById(id);
  if (!publisher) return res.status(404).json({ error: "Publisher not found" });

  if (dailyLimit !== undefined) {
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
      return res.status(400).json({ error: "dailyLimit must be a non-negative number" });
    }
    await validatePublisherLimitChange({
      publisherIdBeingEdited: id,
      currentLimit: publisher.dailyLimit,
      newLimit: dailyLimit,
    });
    publisher.dailyLimit = dailyLimit;
  }

  if (active !== undefined) publisher.active = !!active;
  if (name !== undefined && name.trim()) publisher.name = name.trim();

  if (email !== undefined) {
    const emailNormalized = email && email.trim() ? email.trim().toLowerCase() : null;
    if (emailNormalized) {
      const emailTaken = await Publisher.findOne({ email: emailNormalized, _id: { $ne: id } });
      if (emailTaken) {
        return res.status(409).json({ error: "A publisher with this email already exists" });
      }
    }
    publisher.email = emailNormalized || undefined;
  }

  if (password !== undefined && password !== "") {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    publisher.passwordHash = await hashPassword(password);
  }

  if (allowedIps !== undefined) {
    if (!Array.isArray(allowedIps) || !allowedIps.every((ip) => typeof ip === "string")) {
      return res.status(400).json({ error: "allowedIps must be an array of IP address strings" });
    }
    publisher.allowedIps = allowedIps.map((ip) => ip.trim()).filter(Boolean);
  }

  if (signupStatus !== undefined) {
    if (!["pending", "approved", "rejected"].includes(signupStatus)) {
      return res.status(400).json({ error: "Invalid signupStatus" });
    }
    publisher.signupStatus = signupStatus;
  }

  await publisher.save();
  res.json({
    id: publisher._id,
    name: publisher.name,
    email: publisher.email || null,
    dailyLimit: publisher.dailyLimit,
    active: publisher.active,
    signupStatus: publisher.signupStatus,
    allowedIps: publisher.allowedIps,
  });
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
  updateRateLimit,
  listPublishers,
  createPublisher,
  updatePublisher,
  listJobs,
  deleteJob,
};
