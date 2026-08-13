const mongoose = require("mongoose");

// Singleton document (key: "global") holding the overall daily lead cap -
// a capacity-planning ceiling, not a live-consumed pool. The sum of every
// active publisher's own dailyLimit must not exceed this value. See
// services/buyerLimitService.js.
const globalConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    totalDailyLimit: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GlobalConfig", globalConfigSchema);
