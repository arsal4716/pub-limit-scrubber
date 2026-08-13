const mongoose = require("mongoose");
const { BUYER_KEYS } = require("../constants/buyers");

// Tracks how many API calls a specific PUBLISHER has sent to a specific
// buyer on a given calendar day (reset timezone). Each publisher's own
// dailyLimit (see the Publisher model) is split 50/50 between the two
// buyers - this is NOT a pool shared across publishers. A new dateKey
// naturally "resets" the counter.
const buyerUsageSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, index: true }, // YYYY-MM-DD in reset timezone
    buyerKey: { type: String, enum: BUYER_KEYS, required: true },
    publisherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Publisher",
      required: true,
    },
    usedCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

buyerUsageSchema.index({ dateKey: 1, buyerKey: 1, publisherId: 1 }, { unique: true });

module.exports = mongoose.model("BuyerUsage", buyerUsageSchema);
