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
    acceptedCount: { type: Number, default: 0 }, // Duplicate: No
    blockedCount: { type: Number, default: 0 }, // Duplicate: Yes (code 4007)
    apiErrorCount: { type: Number, default: 0 }, // Duplicate: Error

    estimatedSeconds: { type: Number, default: 0 },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScrubJob", scrubJobSchema);
