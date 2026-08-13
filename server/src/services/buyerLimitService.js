const BuyerConfig = require("../models/BuyerConfig");
const BuyerUsage = require("../models/BuyerUsage");
const Publisher = require("../models/Publisher");
const { getOrCreateGlobalConfig } = require("./limitService");
const { todayKey } = require("../utils/dateKey");
const { BUYER_KEYS } = require("../constants/buyers");

const MAX_RESERVE_ATTEMPTS = 5;

// Seed value used only the first time a buyer's config doc is created.
// From then on the limit lives entirely in the DB and is only ever
// changed via the admin API/UI - there is no env var for this.
const DEFAULT_DAILY_LIMIT = { LM: 100000, HC: 100000 };

async function getOrCreateBuyerConfig(buyerKey) {
  let config = await BuyerConfig.findOne({ key: buyerKey });
  if (!config) {
    config = await BuyerConfig.create({
      key: buyerKey,
      dailyLimit: DEFAULT_DAILY_LIMIT[buyerKey],
    });
  }
  return config;
}

async function getOrCreateBuyerUsageDoc(dateKey, buyerKey, publisherId) {
  return BuyerUsage.findOneAndUpdate(
    { dateKey, buyerKey, publisherId },
    { $setOnInsert: { usedCount: 0 } },
    { upsert: true, new: true }
  );
}

// Each publisher gets their OWN daily allotment from each buyer - a
// buyer's dailyLimit is a shared template applied per publisher, not a
// pool shared across every publisher. Atomically reserves one call for
// `publisherId` against `buyerKey`'s daily cap today. Returns true (and
// increments the counter) if under the limit, false if this publisher has
// already used up its allotment from this buyer for the day.
async function reserveBuyerCall(buyerKey, publisherId, dateKey = todayKey()) {
  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
    const config = await getOrCreateBuyerConfig(buyerKey);
    await getOrCreateBuyerUsageDoc(dateKey, buyerKey, publisherId);

    const updated = await BuyerUsage.findOneAndUpdate(
      { dateKey, buyerKey, publisherId, usedCount: { $lt: config.dailyLimit } },
      { $inc: { usedCount: 1 } }
    );
    if (updated) return true;

    const usage = await BuyerUsage.findOne({ dateKey, buyerKey, publisherId });
    if (!usage || usage.usedCount >= config.dailyLimit) return false;
    // Otherwise another request just changed the limit/usage - retry.
  }
  return false;
}

// A publisher's total daily capacity is the sum of what each buyer grants
// every publisher (uniform across publishers - there's no per-publisher
// override in this version).
async function getPerPublisherCapacity() {
  const [lm, hc] = await Promise.all([getOrCreateBuyerConfig("LM"), getOrCreateBuyerConfig("HC")]);
  return { lmDailyLimit: lm.dailyLimit, hcDailyLimit: hc.dailyLimit, total: lm.dailyLimit + hc.dailyLimit };
}

// How many ACTIVE publishers the current buyer limits can support without
// exceeding the global daily lead cap - the capacity-planning ceiling
// admins use when deciding buyer limits vs. how many publishers to onboard.
async function getCapacityInfo() {
  const [{ lmDailyLimit, hcDailyLimit, total }, globalConfig, activePublisherCount] = await Promise.all([
    getPerPublisherCapacity(),
    getOrCreateGlobalConfig(),
    Publisher.countDocuments({ active: true }),
  ]);
  const maxSupportablePublishers = total > 0 ? Math.floor(globalConfig.totalDailyLimit / total) : Infinity;
  return {
    lmDailyLimit,
    hcDailyLimit,
    perPublisherCapacity: total,
    totalDailyLimit: globalConfig.totalDailyLimit,
    activePublisherCount,
    maxSupportablePublishers,
  };
}

function assertCapacity({ activePublisherCount, perPublisherCapacity, totalDailyLimit }) {
  const required = activePublisherCount * perPublisherCapacity;
  if (required > totalDailyLimit) {
    const err = new Error(
      `${activePublisherCount} active publisher(s) x ${perPublisherCapacity.toLocaleString()} ` +
        `leads/day capacity each = ${required.toLocaleString()}, which exceeds the global daily limit ` +
        `(${totalDailyLimit.toLocaleString()})`
    );
    err.status = 400;
    throw err;
  }
}

// Called before changing a buyer's dailyLimit - ensures the CURRENT active
// publisher count still fits under the global cap with the proposed limit.
// LOWERING a buyer's limit can only ever reduce total committed capacity,
// so it's always allowed, even if the system is still over capacity
// afterward from some other pre-existing cause - blocking it uniformly
// would leave admins with no way to correct an already over-committed
// state (e.g. one inherited from a config/data migration).
async function validateBuyerLimitChange(buyerKey, proposedDailyLimit) {
  const [lm, hc] = await Promise.all([getOrCreateBuyerConfig("LM"), getOrCreateBuyerConfig("HC")]);
  const currentLimit = buyerKey === "LM" ? lm.dailyLimit : hc.dailyLimit;
  if (proposedDailyLimit <= currentLimit) return;

  const [globalConfig, activePublisherCount] = await Promise.all([
    getOrCreateGlobalConfig(),
    Publisher.countDocuments({ active: true }),
  ]);
  const lmLimit = buyerKey === "LM" ? proposedDailyLimit : lm.dailyLimit;
  const hcLimit = buyerKey === "HC" ? proposedDailyLimit : hc.dailyLimit;
  assertCapacity({
    activePublisherCount,
    perPublisherCapacity: lmLimit + hcLimit,
    totalDailyLimit: globalConfig.totalDailyLimit,
  });
}

// Called before changing the global daily limit. RAISING it can only ever
// add headroom, so it's always allowed (this is the main lever admins use
// to resolve an already over-committed state) - only a decrease is
// checked against current commitments.
async function validateGlobalLimitChange(proposedTotalDailyLimit) {
  const globalConfig = await getOrCreateGlobalConfig();
  if (proposedTotalDailyLimit >= globalConfig.totalDailyLimit) return;

  const [{ total }, activePublisherCount] = await Promise.all([
    getPerPublisherCapacity(),
    Publisher.countDocuments({ active: true }),
  ]);
  assertCapacity({
    activePublisherCount,
    perPublisherCapacity: total,
    totalDailyLimit: proposedTotalDailyLimit,
  });
}

// Called before activating a publisher (creating one as active, or
// flipping an existing one from disabled to active) - ensures the
// resulting active count still fits.
async function validatePublisherActivation(willBeActiveCount) {
  const [{ total }, globalConfig] = await Promise.all([getPerPublisherCapacity(), getOrCreateGlobalConfig()]);
  assertCapacity({
    activePublisherCount: willBeActiveCount,
    perPublisherCapacity: total,
    totalDailyLimit: globalConfig.totalDailyLimit,
  });
}

async function updateBuyerDailyLimit(buyerKey, dailyLimit) {
  await validateBuyerLimitChange(buyerKey, dailyLimit);
  return BuyerConfig.findOneAndUpdate({ key: buyerKey }, { dailyLimit }, { upsert: true, new: true });
}

// A single publisher's own usage/limit snapshot across both buyers - the
// derived "daily limit" a publisher sees is the sum of both buyers'
// per-publisher allotments.
async function getPublisherUsageSnapshot(publisherId, dateKey = todayKey()) {
  const buyers = await Promise.all(
    BUYER_KEYS.map(async (key) => {
      const [config, usage] = await Promise.all([
        getOrCreateBuyerConfig(key),
        getOrCreateBuyerUsageDoc(dateKey, key, publisherId),
      ]);
      return { key, dailyLimit: config.dailyLimit, usedToday: usage.usedCount };
    })
  );
  const dailyLimit = buyers.reduce((sum, b) => sum + b.dailyLimit, 0);
  const usedToday = buyers.reduce((sum, b) => sum + b.usedToday, 0);
  return {
    dateKey,
    buyers,
    dailyLimit,
    usedToday,
    remainingToday: Math.max(0, dailyLimit - usedToday),
  };
}

// Admin overview: each buyer's per-publisher allotment plus total usage
// summed across every publisher today, and how many active publishers the
// current limits can support.
async function getBuyerAdminSnapshot(dateKey = todayKey()) {
  const [capacity, totals] = await Promise.all([
    getCapacityInfo(),
    Promise.all(
      BUYER_KEYS.map(async (key) => {
        const agg = await BuyerUsage.aggregate([
          { $match: { dateKey, buyerKey: key } },
          { $group: { _id: null, total: { $sum: "$usedCount" } } },
        ]);
        return { key, usedTodayAcrossAllPublishers: agg[0]?.total || 0 };
      })
    ),
  ]);

  return {
    dateKey,
    totalDailyLimit: capacity.totalDailyLimit,
    activePublisherCount: capacity.activePublisherCount,
    maxSupportablePublishers: capacity.maxSupportablePublishers,
    buyers: BUYER_KEYS.map((key) => ({
      key,
      dailyLimitPerPublisher: key === "LM" ? capacity.lmDailyLimit : capacity.hcDailyLimit,
      usedTodayAcrossAllPublishers: totals.find((t) => t.key === key).usedTodayAcrossAllPublishers,
    })),
  };
}

module.exports = {
  getOrCreateBuyerConfig,
  reserveBuyerCall,
  getPerPublisherCapacity,
  getCapacityInfo,
  updateBuyerDailyLimit,
  validateGlobalLimitChange,
  validatePublisherActivation,
  getPublisherUsageSnapshot,
  getBuyerAdminSnapshot,
};
