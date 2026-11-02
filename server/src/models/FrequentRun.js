const mongoose = require("mongoose");

// One weekly Frequent_Shopper upload. Each completed run keeps its own
// unique-phone list on disk (phonesPath) so the NEXT week's upload can be
// compared against it, and produces two output files: the cleaned
// Frequent_Shopper list and the Frequent_SMS list (numbers not present in
// the previous run).
const frequentRunSchema = new mongoose.Schema(
  {
    originalFilename: { type: String, required: true },
    runDate: { type: String, required: true, index: true }, // YYYY-MM-DD in the reset timezone
    source: { type: String, enum: ["upload", "scheduled"], default: "upload" },
    inputPath: { type: String, required: true },
    phonesPath: { type: String, default: null },
    shopperPath: { type: String, default: null }, // Frequent_Shopper output (all unique numbers)
    smsPath: { type: String, default: null }, // Frequent_SMS output (new vs previous run)

    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      index: true,
    },
    errorMessage: { type: String, default: null },

    previousRunId: { type: mongoose.Schema.Types.ObjectId, ref: "FrequentRun", default: null },
    previousRunDate: { type: String, default: null },
    isBaseline: { type: Boolean, default: false }, // first upload: nothing to compare against

    totalRows: { type: Number, default: 0 },
    blankPhoneCount: { type: Number, default: 0 },
    invalidPhoneCount: { type: Number, default: 0 },
    duplicateInFileCount: { type: Number, default: 0 },
    uniqueCount: { type: Number, default: 0 },
    alreadyInPreviousCount: { type: Number, default: 0 },
    newCount: { type: Number, default: 0 },

    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FrequentRun", frequentRunSchema);
