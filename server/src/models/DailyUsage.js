const mongoose = require("mongoose");

// Tracks how many leads have been consumed against a quota (global or a
// specific publisher) for a given calendar day in the reset timezone.
// A new dateKey naturally "resets" the quota - no cron job needed.
const dailyUsageSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, index: true }, // YYYY-MM-DD in reset timezone
    scope: { type: String, enum: ["global", "publisher"], required: true },
    publisherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Publisher",
      default: null,
    },
    usedCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

dailyUsageSchema.index(
  { dateKey: 1, scope: 1, publisherId: 1 },
  { unique: true }
);

module.exports = mongoose.model("DailyUsage", dailyUsageSchema);
