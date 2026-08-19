const mongoose = require("mongoose");

// Singleton document (key: "global") holding the overall daily lead cap -
// a capacity-planning ceiling, not a live-consumed pool. The sum of every
// active publisher's own dailyLimit must not exceed this value. See
// services/buyerLimitService.js.
const globalConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    totalDailyLimit: { type: Number, required: true, min: 0 },
    // true (default) = throttled to ~1000/min per buyer, matching existing
    // behavior. false = no artificial pacing between batches - phones are
    // scrubbed as fast as possible, still batched at a higher concurrency.
    // See services/buyerApiClient.js.
    rateLimitEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GlobalConfig", globalConfigSchema);
