const mongoose = require("mongoose");

// Singleton document (key: "global") holding the overall daily lead cap -
// a capacity-planning ceiling, not a live-consumed pool. The sum of every
// active publisher's own dailyLimit must not exceed this value. See
// services/buyerLimitService.js.
const globalConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    totalDailyLimit: { type: Number, required: true, min: 0 },
    // true (default) = throttled to rateLimitPerMinute per buyer. false =
    // no artificial pacing between batches - phones are scrubbed as fast
    // as possible, still batched at a higher concurrency. See
    // services/buyerApiClient.js.
    rateLimitEnabled: { type: Boolean, default: true },
    // Target requests/minute PER BUYER while rate limiting is on (default
    // 1000, matching the original fixed pace) - admin-editable in the
    // dashboard. Ignored when rateLimitEnabled is false.
    // Which buyer APIs are used. Both on = file scrubs split the list
    // between them (realtime checks both). Exactly one on = every number
    // goes through that one buyer only. Defaults: HC only, LM off.
    // Master switch. false = portal shown as "temporarily down" to
    // publishers: no new uploads or API checks, and running jobs pause
    // their buyer calls until it's turned back on.
    portalEnabled: { type: Boolean, default: true },
    lmEnabled: { type: Boolean, default: false },
    hcEnabled: { type: Boolean, default: true },
    rateLimitPerMinute: { type: Number, default: 1000, min: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GlobalConfig", globalConfigSchema);
