const mongoose = require("mongoose");

// Singleton document (key: "global") holding the overall daily lead cap.
const globalConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    totalDailyLimit: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GlobalConfig", globalConfigSchema);
