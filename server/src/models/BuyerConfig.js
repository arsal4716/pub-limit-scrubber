const mongoose = require("mongoose");
const { BUYER_KEYS } = require("../constants/buyers");

// One doc per buyer (LM, IC) holding that buyer's own daily API-call cap,
// independent of the global/publisher lead limits in GlobalConfig.
const buyerConfigSchema = new mongoose.Schema(
  {
    key: { type: String, enum: BUYER_KEYS, required: true, unique: true },
    dailyLimit: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BuyerConfig", buyerConfigSchema);
