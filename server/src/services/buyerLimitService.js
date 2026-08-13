const BuyerUsage = require("../models/BuyerUsage");
const Publisher = require("../models/Publisher");
const { getOrCreateGlobalConfig } = require("./limitService");
const { todayKey } = require("../utils/dateKey");
const { BUYER_KEYS } = require("../constants/buyers");

const MAX_RESERVE_ATTEMPTS = 5;

// A publisher's own dailyLimit is split 50/50 between the two buyers - LM
// gets the ceiling half so the two halves always add back up to the whole
// on an odd limit (e.g. 100,001 -> 50,001 LM + 50,000 HC).
function getPublisherBuyerLimits(dailyLimit) {
  return {
    LM: Math.ceil(dailyLimit / 2),
    HC: Math.floor(dailyLimit / 2),
  };
}

async function getOrCreateBuyerUsageDoc(dateKey, buyerKey, publisherId) {
  return BuyerUsage.findOneAndUpdate(
    { dateKey, buyerKey, publisherId },
    { $setOnInsert: { usedCount: 0 } },
    { upsert: true, new: true }
  );
}

// Atomically reserves one call for `publisherId` against `buyerKey` today,
// gated by `dailyLimit` (that buyer's half of this publisher's own daily
// limit - computed once per job via getPublisherBuyerLimits, not looked up
// per call). Returns true (and increments the counter) if under the
// limit, false if this publisher has already used up this buyer's half of
// their allotment for the day.
async function reserveBuyerCall(buyerKey, publisherId, dailyLimit, dateKey = todayKey()) {
  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
    await getOrCreateBuyerUsageDoc(dateKey, buyerKey, publisherId);

    const updated = await BuyerUsage.findOneAndUpdate(
      { dateKey, buyerKey, publisherId, usedCount: { $lt: dailyLimit } },
      { $inc: { usedCount: 1 } }
    );
    if (updated) return true;

    const usage = await BuyerUsage.findOne({ dateKey, buyerKey, publisherId });
    if (!usage || usage.usedCount >= dailyLimit) return false;
    // Otherwise another request just changed the usage - retry.
  }
  return false;
}

function assertCapacity({ committed, totalDailyLimit }) {
  if (committed > totalDailyLimit) {
    const err = new Error(
      `Active publishers' daily limits would total ${committed.toLocaleString()}, which exceeds ` +
        `the global daily limit (${totalDailyLimit.toLocaleString()})`
    );
    err.status = 400;
    throw err;
  }
}

async function sumActivePublisherLimits(excludePublisherId = null) {
  const publishers = await Publisher.find({ active: true });
  return publishers
    .filter((p) => String(p._id) !== String(excludePublisherId))
    .reduce((sum, p) => sum + p.dailyLimit, 0);
}

// Called before creating a publisher or raising an existing one's
// dailyLimit - ensures active publishers' limits still fit under the
// global cap. LOWERING a publisher's own limit can only ever reduce total
// committed capacity, so it's always allowed even if the system is still
// over capacity afterward from some other cause - blocking it uniformly
// would leave admins with no way to correct an already over-committed state.
async function validatePublisherLimitChange({ publisherIdBeingEdited, currentLimit, newLimit }) {
  if (currentLimit !== null && newLimit <= currentLimit) return;

  const [globalConfig, sumOthers] = await Promise.all([
    getOrCreateGlobalConfig(),
    sumActivePublisherLimits(publisherIdBeingEdited),
  ]);
  assertCapacity({ committed: sumOthers + newLimit, totalDailyLimit: globalConfig.totalDailyLimit });
}

// Called before changing the global daily limit. RAISING it can only ever
// add headroom, so it's always allowed (this is the main lever admins use
// to resolve an already over-committed state) - only a decrease is
// checked against current commitments.
async function validateGlobalLimitChange(proposedTotalDailyLimit) {
  const globalConfig = await getOrCreateGlobalConfig();
  if (proposedTotalDailyLimit >= globalConfig.totalDailyLimit) return;

  const committed = await sumActivePublisherLimits();
  assertCapacity({ committed, totalDailyLimit: proposedTotalDailyLimit });
}

// A single publisher's own usage/limit snapshot across both buyers (their
// own dailyLimit split 50/50, with today's actual usage against each half).
async function getPublisherUsageSnapshot(publisherId, dateKey = todayKey()) {
  const publisher = await Publisher.findById(publisherId);
  const dailyLimit = publisher ? publisher.dailyLimit : 0;
  const buyerLimits = getPublisherBuyerLimits(dailyLimit);

  const buyers = await Promise.all(
    BUYER_KEYS.map(async (key) => {
      const usage = await getOrCreateBuyerUsageDoc(dateKey, key, publisherId);
      return { key, dailyLimit: buyerLimits[key], usedToday: usage.usedCount };
    })
  );
  const usedToday = buyers.reduce((sum, b) => sum + b.usedToday, 0);
  return {
    dateKey,
    buyers,
    dailyLimit,
    usedToday,
    remainingToday: Math.max(0, dailyLimit - usedToday),
  };
}

// Admin overview: total daily limit committed by active publishers vs. the
// global ceiling.
async function getGlobalCapacitySnapshot() {
  const [globalConfig, committed, activePublisherCount] = await Promise.all([
    getOrCreateGlobalConfig(),
    sumActivePublisherLimits(),
    Publisher.countDocuments({ active: true }),
  ]);
  return {
    totalDailyLimit: globalConfig.totalDailyLimit,
    committed,
    remaining: Math.max(0, globalConfig.totalDailyLimit - committed),
    activePublisherCount,
  };
}

module.exports = {
  getPublisherBuyerLimits,
  reserveBuyerCall,
  validatePublisherLimitChange,
  validateGlobalLimitChange,
  getPublisherUsageSnapshot,
  getGlobalCapacitySnapshot,
};
