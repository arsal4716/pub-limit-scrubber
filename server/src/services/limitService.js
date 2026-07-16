const GlobalConfig = require("../models/GlobalConfig");
const DailyUsage = require("../models/DailyUsage");
const Publisher = require("../models/Publisher");
const env = require("../config/env");
const { todayKey } = require("../utils/dateKey");

const MAX_RESERVE_ATTEMPTS = 5;

async function getOrCreateGlobalConfig() {
  let config = await GlobalConfig.findOne({ key: "global" });
  if (!config) {
    config = await GlobalConfig.create({
      key: "global",
      totalDailyLimit: env.defaultTotalDailyLimit,
    });
  }
  return config;
}

async function getOrCreateUsageDoc(dateKey, scope, publisherId) {
  return DailyUsage.findOneAndUpdate(
    { dateKey, scope, publisherId: publisherId || null },
    { $setOnInsert: { usedCount: 0 } },
    { upsert: true, new: true }
  );
}

async function getGlobalUsageSnapshot(dateKey = todayKey()) {
  const [globalConfig, globalUsage] = await Promise.all([
    getOrCreateGlobalConfig(),
    getOrCreateUsageDoc(dateKey, "global", null),
  ]);

  return {
    dateKey,
    totalDailyLimit: globalConfig.totalDailyLimit,
    globalUsed: globalUsage.usedCount,
    globalRemaining: Math.max(0, globalConfig.totalDailyLimit - globalUsage.usedCount),
  };
}

async function getUsageSnapshot(publisherId, dateKey = todayKey()) {
  const [globalConfig, publisher, globalUsage, publisherUsage] = await Promise.all([
    getOrCreateGlobalConfig(),
    Publisher.findById(publisherId),
    getOrCreateUsageDoc(dateKey, "global", null),
    getOrCreateUsageDoc(dateKey, "publisher", publisherId),
  ]);

  return {
    dateKey,
    totalDailyLimit: globalConfig.totalDailyLimit,
    globalUsed: globalUsage.usedCount,
    globalRemaining: Math.max(0, globalConfig.totalDailyLimit - globalUsage.usedCount),
    publisherDailyLimit: publisher ? publisher.dailyLimit : 0,
    publisherUsed: publisherUsage.usedCount,
    publisherRemaining: publisher
      ? Math.max(0, publisher.dailyLimit - publisherUsage.usedCount)
      : 0,
  };
}

// Atomically reserves up to `requestedCount` leads against both the global
// daily cap and the publisher's own daily cap for today (in the reset
// timezone). Uses optimistic-concurrency retries on plain document updates
// (no multi-document transaction needed) so two simultaneous uploads can't
// jointly oversell either quota. Returns the number actually reserved,
// which may be less than requested (or 0) if quota is exhausted.
async function reserveQuota(publisherId, requestedCount) {
  if (requestedCount <= 0) return 0;

  const dateKey = todayKey();

  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
    const [globalConfig, publisher] = await Promise.all([
      getOrCreateGlobalConfig(),
      Publisher.findById(publisherId),
    ]);
    if (!publisher) throw new Error("Publisher not found");

    const [globalUsage, publisherUsage] = await Promise.all([
      getOrCreateUsageDoc(dateKey, "global", null),
      getOrCreateUsageDoc(dateKey, "publisher", publisherId),
    ]);

    const globalRemaining = Math.max(0, globalConfig.totalDailyLimit - globalUsage.usedCount);
    const publisherRemaining = Math.max(0, publisher.dailyLimit - publisherUsage.usedCount);
    const allowed = Math.min(requestedCount, globalRemaining, publisherRemaining);

    if (allowed <= 0) return 0;

    const globalUpdated = await DailyUsage.findOneAndUpdate(
      {
        dateKey,
        scope: "global",
        publisherId: null,
        usedCount: { $lte: globalConfig.totalDailyLimit - allowed },
      },
      { $inc: { usedCount: allowed } }
    );
    if (!globalUpdated) continue; // lost the race - re-read and retry

    const publisherUpdated = await DailyUsage.findOneAndUpdate(
      {
        dateKey,
        scope: "publisher",
        publisherId,
        usedCount: { $lte: publisher.dailyLimit - allowed },
      },
      { $inc: { usedCount: allowed } }
    );
    if (!publisherUpdated) {
      // Roll back the global reservation and retry with fresh numbers.
      await DailyUsage.updateOne(
        { dateKey, scope: "global", publisherId: null },
        { $inc: { usedCount: -allowed } }
      );
      continue;
    }

    return allowed;
  }

  // Contention never resolved after several attempts - fail safe with 0
  // rather than risk overselling either quota.
  return 0;
}

// Releases a previously reserved-but-unused portion of quota, e.g. if a job
// fails before any API calls were made. Best-effort; never throws.
async function releaseQuota(publisherId, amount, dateKey = todayKey()) {
  if (amount <= 0) return;
  try {
    await Promise.all([
      DailyUsage.updateOne(
        { dateKey, scope: "global", publisherId: null },
        { $inc: { usedCount: -amount } }
      ),
      DailyUsage.updateOne(
        { dateKey, scope: "publisher", publisherId },
        { $inc: { usedCount: -amount } }
      ),
    ]);
  } catch (err) {
    console.error("[limitService] failed to release quota:", err.message);
  }
}

async function validatePublisherLimit({ publisherIdBeingEdited, newLimit, totalDailyLimit }) {
  const publishers = await Publisher.find({ active: true });
  const sumOthers = publishers
    .filter((p) => String(p._id) !== String(publisherIdBeingEdited))
    .reduce((sum, p) => sum + p.dailyLimit, 0);

  if (sumOthers + newLimit > totalDailyLimit) {
    const err = new Error(
      `Sum of active publisher limits (${sumOthers + newLimit}) would exceed the total daily limit (${totalDailyLimit})`
    );
    err.status = 400;
    throw err;
  }
}

module.exports = {
  getOrCreateGlobalConfig,
  getGlobalUsageSnapshot,
  getUsageSnapshot,
  reserveQuota,
  releaseQuota,
  validatePublisherLimit,
};
