const fs = require("fs");
const path = require("path");
const FrequentRun = require("../models/FrequentRun");
const env = require("../config/env");
const { startRun, nextScheduledRun } = require("../services/frequentService");
const { zoneParts } = require("../utils/dateKey");

function toDto(run) {
  return {
    id: run._id,
    originalFilename: run.originalFilename,
    runDate: run.runDate,
    source: run.source,
    status: run.status,
    errorMessage: run.errorMessage,
    isBaseline: run.isBaseline,
    previousRunDate: run.previousRunDate,
    totalRows: run.totalRows,
    blankPhoneCount: run.blankPhoneCount,
    invalidPhoneCount: run.invalidPhoneCount,
    duplicateInFileCount: run.duplicateInFileCount,
    uniqueCount: run.uniqueCount,
    alreadyInPreviousCount: run.alreadyInPreviousCount,
    newCount: run.newCount,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

async function uploadRun(req, res) {
  if (!req.file) return res.status(400).json({ error: "A CSV file is required" });

  const run = await FrequentRun.create({
    originalFilename: req.file.originalname,
    runDate: zoneParts(env.frequentTimezone).dateKey,
    inputPath: req.file.path,
    status: "processing",
  });
  startRun(String(run._id));
  res.status(201).json(toDto(run));
}

async function listRuns(req, res) {
  const runs = await FrequentRun.find().sort({ createdAt: -1 }).limit(30);
  res.json({
    runs: runs.map(toDto),
    schedule: {
      timezone: env.frequentTimezone,
      hour: env.frequentRunHour,
      inboxDir: env.frequentInboxDir,
      nextRunAt: nextScheduledRun(),
    },
  });
}

async function downloadRun(req, res) {
  const run = await FrequentRun.findById(req.params.id);
  if (!run || run.status !== "completed") return res.status(404).json({ error: "File not ready" });

  const isSms = req.params.kind === "sms";
  if (!isSms && req.params.kind !== "shopper") return res.status(404).json({ error: "Unknown file" });
  const filePath = isSms ? run.smsPath : run.shopperPath;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(410).json({ error: "File no longer exists" });
  }
  res.download(filePath, `${isSms ? "Frequent_SMS" : "Frequent_Shopper"}_${run.runDate}.csv`);
}

// Deleting a run also removes it as the comparison baseline - the next
// upload compares against the latest run that's left.
async function deleteRun(req, res) {
  const run = await FrequentRun.findById(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status === "processing") {
    return res.status(409).json({ error: "This run is still processing" });
  }
  fs.rm(path.dirname(run.inputPath), { recursive: true, force: true }, () => {});
  await run.deleteOne();
  res.json({ ok: true });
}

module.exports = { uploadRun, listRuns, downloadRun, deleteRun };
