const mongoose = require("mongoose");

// One row per lead that was checked, whichever way it came in (public link,
// API, or file upload) - who scrubbed it, when, and whether it's a duplicate.
const leadCheckSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true }, // normalized 10 digits
    state: { type: String, default: null },

    publisherId: { type: mongoose.Schema.Types.ObjectId, ref: "Publisher", required: true, index: true },
    publisherName: { type: String, required: true }, // denormalized: who scrubbed this lead

    status: {
      type: String,
      enum: ["available", "blocked", "dnc", "error", "limit_reached", "not_checked"],
      required: true,
      index: true,
    },
    // true when the lead is a duplicate/suppressed (blocked by a buyer or
    // found in the internal DNC list).
    isDuplicate: { type: Boolean, required: true, index: true },
    reason: { type: String, default: null },
    buyerSlot: { type: String, default: null }, // buyer1/buyer2 that decided it, if any

    source: { type: String, enum: ["link", "api", "file"], required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "ScrubJob", default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

leadCheckSchema.index({ publisherId: 1, createdAt: -1 });
leadCheckSchema.index({ createdAt: -1 });

module.exports = mongoose.model("LeadCheck", leadCheckSchema);
