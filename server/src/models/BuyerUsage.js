const mongoose = require("mongoose");
const { BUYER_KEYS } = require("../constants/buyers");

// Tracks how many API calls have actually been sent to a given buyer on a
// given calendar day (reset timezone). A new dateKey naturally "resets"
// the counter, same pattern as DailyUsage.
const buyerUsageSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, index: true }, // YYYY-MM-DD in reset timezone
    buyerKey: { type: String, enum: BUYER_KEYS, required: true },
    usedCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

buyerUsageSchema.index({ dateKey: 1, buyerKey: 1 }, { unique: true });

module.exports = mongoose.model("BuyerUsage", buyerUsageSchema);
