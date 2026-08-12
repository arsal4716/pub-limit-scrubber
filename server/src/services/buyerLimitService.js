const BuyerConfig = require("../models/BuyerConfig");
const BuyerUsage = require("../models/BuyerUsage");
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

async function getOrCreateBuyerUsageDoc(dateKey, buyerKey) {
  return BuyerUsage.findOneAndUpdate(
    { dateKey, buyerKey },
    { $setOnInsert: { usedCount: 0 } },
    { upsert: true, new: true }
  );
}

// Atomically reserves a single API call against a buyer's daily cap for
// today. Returns true (and increments the counter) if under the limit,
// false if the buyer's daily limit has already been reached - callers
// should skip pinging that buyer for this phone when this returns false.
async function reserveBuyerCall(buyerKey, dateKey = todayKey()) {
  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
    const config = await getOrCreateBuyerConfig(buyerKey);
    await getOrCreateBuyerUsageDoc(dateKey, buyerKey);

    const updated = await BuyerUsage.findOneAndUpdate(
      { dateKey, buyerKey, usedCount: { $lt: config.dailyLimit } },
      { $inc: { usedCount: 1 } }
    );
    if (updated) return true;

    const usage = await BuyerUsage.findOne({ dateKey, buyerKey });
    if (!usage || usage.usedCount >= config.dailyLimit) return false;
    // Otherwise another request just changed the limit/usage - retry.
  }
  return false;
}

async function getBuyerUsageSnapshot(dateKey = todayKey()) {
  const buyers = await Promise.all(
    BUYER_KEYS.map(async (key) => {
      const [config, usage] = await Promise.all([
        getOrCreateBuyerConfig(key),
        getOrCreateBuyerUsageDoc(dateKey, key),
      ]);
      return {
        key,
        dailyLimit: config.dailyLimit,
        usedToday: usage.usedCount,
        remainingToday: Math.max(0, config.dailyLimit - usage.usedCount),
      };
    })
  );
  return { dateKey, buyers };
}

async function updateBuyerDailyLimit(buyerKey, dailyLimit) {
  return BuyerConfig.findOneAndUpdate(
    { key: buyerKey },
    { dailyLimit },
    { upsert: true, new: true }
  );
}

module.exports = {
  getOrCreateBuyerConfig,
  reserveBuyerCall,
  getBuyerUsageSnapshot,
  updateBuyerDailyLimit,
};
