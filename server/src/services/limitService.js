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

async function updateBuyerToggles({ lmEnabled, hcEnabled } = {}) {
  const update = {};
  if (lmEnabled !== undefined) update.lmEnabled = lmEnabled;
  if (hcEnabled !== undefined) update.hcEnabled = hcEnabled;
  return GlobalConfig.findOneAndUpdate({ key: "global" }, update, { upsert: true, new: true });
}

function enabledBuyersFrom(config) {
  return { LM: !!config.lmEnabled, HC: !!config.hcEnabled };
}

module.exports = { updateBuyerToggles, enabledBuyersFrom, getOrCreateGlobalConfig, updateGlobalDailyLimit, updateRateLimitSettings };
