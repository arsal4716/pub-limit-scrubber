const mongoose = require("mongoose");
const { BUYER_KEYS } = require("../constants/buyers");

// One doc per buyer (LM, HC) holding the daily API-call allotment EACH
// PUBLISHER individually gets from that buyer (a shared template applied
// uniformly to every publisher, not a pool split across them). The global
// daily limit in GlobalConfig is a separate capacity-planning ceiling on
// how many publishers these allotments can collectively support.
const buyerConfigSchema = new mongoose.Schema(
  {
    key: { type: String, enum: BUYER_KEYS, required: true, unique: true },
    dailyLimit: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BuyerConfig", buyerConfigSchema);
