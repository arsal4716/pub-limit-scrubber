const GlobalConfig = require("../models/GlobalConfig");
const env = require("../config/env");

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

async function updateGlobalDailyLimit(totalDailyLimit) {
  return GlobalConfig.findOneAndUpdate(
    { key: "global" },
    { totalDailyLimit },
    { upsert: true, new: true }
  );
}

// `updates` may include `enabled` and/or `ratePerMinute` - only the
// provided fields are changed.
async function updateRateLimitSettings({ enabled, ratePerMinute } = {}) {
  const update = {};
  if (enabled !== undefined) update.rateLimitEnabled = enabled;
  if (ratePerMinute !== undefined) update.rateLimitPerMinute = ratePerMinute;

  return GlobalConfig.findOneAndUpdate({ key: "global" }, update, { upsert: true, new: true });
}

module.exports = { getOrCreateGlobalConfig, updateGlobalDailyLimit, updateRateLimitSettings };
