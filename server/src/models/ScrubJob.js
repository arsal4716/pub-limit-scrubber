const mongoose = require("mongoose");

const scrubJobSchema = new mongoose.Schema(
  {
    publisherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Publisher",
      required: true,
      index: true,
    },
    publisherName: { type: String, required: true }, // denormalized for display/history

    originalFilename: { type: String, required: true },
    inputPath: { type: String, required: true },
    outputPath: { type: String, default: null },

    status: {
      type: String,
      enum: ["queued", "analyzing", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    errorMessage: { type: String, default: null },

    dateKey: { type: String, required: true, index: true }, // day the job was created (reset timezone)

    totalRows: { type: Number, default: 0 },
    invalidPhoneCount: { type: Number, default: 0 },
    duplicateInFileCount: { type: Number, default: 0 },
    uniquePhoneCount: { type: Number, default: 0 },

    allowedCount: { type: Number, default: 0 }, // quota actually reserved/sent to buyer API
    quotaReserved: { type: Boolean, default: false }, // guards against double-reserving on crash recovery
    skippedOverLimitCount: { type: Number, default: 0 },

    processedCount: { type: Number, default: 0 }, // progress counter
    acceptedCount: { type: Number, default: 0 }, // that phone's assigned buyer returned Available
    blockedCount: { type: Number, default: 0 }, // that phone's assigned buyer returned Blocked
    apiErrorCount: { type: Number, default: 0 }, // that phone's assigned buyer errored

    // Per-buyer breakdown. buyer1 = LM, buyer2 = HC (fixed mapping) - the
    // anonymized buyer1/buyer2 naming is what publisher-facing UI shows.
    // Each phone is routed to exactly ONE buyer (the unique phone list is
    // split roughly in half), so these two are disjoint - together they
    // account for every processed phone, not an overlapping double-count.
    buyerStats: {
      buyer1: {
        blockedCount: { type: Number, default: 0 },
        availableCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        notCheckedCount: { type: Number, default: 0 }, // skipped: buyer's own daily limit reached
      },
      buyer2: {
        blockedCount: { type: Number, default: 0 },
        availableCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        notCheckedCount: { type: Number, default: 0 },
      },
    },

    estimatedSeconds: { type: Number, default: 0 },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScrubJob", scrubJobSchema);
