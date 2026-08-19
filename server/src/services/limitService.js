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

async function updateRateLimitMode(enabled) {
  return GlobalConfig.findOneAndUpdate(
    { key: "global" },
    { rateLimitEnabled: enabled },
    { upsert: true, new: true }
  );
}

module.exports = { getOrCreateGlobalConfig, updateGlobalDailyLimit, updateRateLimitMode };
