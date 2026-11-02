const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { parse, format } = require("fast-csv");
const FrequentRun = require("../models/FrequentRun");
const { analyzeFile } = require("./csvService");
const { normalizePhone, extractPhoneFromRow } = require("./phoneUtils");
const { detectDelimiter } = require("../utils/csvDelimiter");
const env = require("../config/env");
const { zoneParts } = require("../utils/dateKey");
const { UPLOADS_ROOT } = require("../middleware/upload");

async function loadPhoneSet(phonesPath) {
  const set = new Set();
  const lines = readline.createInterface({ input: fs.createReadStream(phonesPath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) set.add(line);
  }
  return set;
}

function writePhonesFile(phonesPath, phones) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(phonesPath);
    out.on("error", reject);
    out.on("finish", resolve);
    for (const phone of phones) out.write(`${phone}\n`);
    out.end();
  });
}

// Streams the original file once, writing the first row seen for every
// unique phone to the Frequent_Shopper file, and - when it's one of
// `newPhones` - to the Frequent_SMS file too. Original columns are kept,
// plus a NormalizedPhone column.
function writeOutputs(inputPath, shopperPath, smsPath, { delimiter, phoneColumn, newPhones }) {
  return new Promise((resolve, reject) => {
    const seen = new Set();
    const shopperOut = format({ headers: true, delimiter });
    const smsOut = format({ headers: true, delimiter });
    const shopperFile = fs.createWriteStream(shopperPath);
    const smsFile = fs.createWriteStream(smsPath);
    shopperOut.pipe(shopperFile);
    smsOut.pipe(smsFile);

    let pendingFinishes = 2;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const done = () => {
      pendingFinishes -= 1;
      if (pendingFinishes === 0 && !settled) {
        settled = true;
        resolve();
      }
    };
    shopperFile.on("finish", done);
    smsFile.on("finish", done);
    [shopperFile, smsFile, shopperOut, smsOut].forEach((s) => s.on("error", fail));

    fs.createReadStream(inputPath)
      .pipe(parse({ headers: true, delimiter }))
      .on("error", (err) => {
        shopperOut.end();
        smsOut.end();
        fail(err);
      })
      .on("data", (row) => {
        const phone = normalizePhone(extractPhoneFromRow(row, phoneColumn));
        if (!phone || seen.has(phone)) return;
        seen.add(phone);
        const outRow = { ...row, NormalizedPhone: phone };
        shopperOut.write(outRow);
        if (newPhones.has(phone)) smsOut.write(outRow);
      })
      .on("end", () => {
        shopperOut.end();
        smsOut.end();
      });
  });
}

async function processRun(runId) {
  const run = await FrequentRun.findById(runId);
  if (!run) return;

  const dir = path.dirname(run.inputPath);
  const delimiter = await detectDelimiter(run.inputPath);
  const analysis = await analyzeFile(run.inputPath, delimiter);
  const phones = analysis.uniquePhonesOrdered;

  // Compare against the most recent earlier completed run.
  const previous = await FrequentRun.findOne({
    _id: { $ne: run._id },
    status: "completed",
    createdAt: { $lt: run.createdAt },
  }).sort({ createdAt: -1 });

  let newPhones;
  if (previous && previous.phonesPath && fs.existsSync(previous.phonesPath)) {
    const previousSet = await loadPhoneSet(previous.phonesPath);
    newPhones = new Set(phones.filter((p) => !previousSet.has(p)));
    run.previousRunId = previous._id;
    run.previousRunDate = previous.runDate;
    run.isBaseline = false;
  } else {
    // Nothing to compare against yet: this upload becomes the baseline, so
    // the SMS list is empty rather than texting every number.
    newPhones = new Set();
    run.isBaseline = true;
  }

  const phonesPath = path.join(dir, "phones.txt");
  const shopperPath = path.join(dir, "Frequent_Shopper.csv");
  const smsPath = path.join(dir, "Frequent_SMS.csv");
  await writePhonesFile(phonesPath, phones);
  await writeOutputs(run.inputPath, shopperPath, smsPath, {
    delimiter,
    phoneColumn: analysis.phoneColumn,
    newPhones,
  });

  run.totalRows = analysis.totalRows;
  run.blankPhoneCount = analysis.blankPhoneCount;
  run.invalidPhoneCount = analysis.invalidPhoneCount;
  run.duplicateInFileCount = analysis.duplicateInFileCount;
  run.uniqueCount = phones.length;
  run.newCount = newPhones.size;
  run.alreadyInPreviousCount = run.isBaseline ? 0 : phones.length - newPhones.size;
  run.phonesPath = phonesPath;
  run.shopperPath = shopperPath;
  run.smsPath = smsPath;
  run.status = "completed";
  run.completedAt = new Date();
  await run.save();
}

// Fire-and-forget: runs outside the scrub queue (no buyer API involved).
function startRun(runId) {
  processRun(runId).catch(async (err) => {
    console.error(`[frequentService] run ${runId} failed:`, err);
    await FrequentRun.findByIdAndUpdate(runId, {
      status: "failed",
      errorMessage: err.userFacing
        ? err.message
        : "An unexpected error occurred while processing this file.",
    });
  });
}

// Runs left mid-flight by a crash can't resume (in-memory only) - mark
// them failed so the admin sees it and re-uploads.
async function failInterruptedRuns() {
  await FrequentRun.updateMany(
    { status: "processing" },
    { status: "failed", errorMessage: "Server restarted while processing. Please upload the file again." }
  );
}

// ---- Weekly schedule -------------------------------------------------
// Every Monday from FREQUENT_RUN_HOUR (in FREQUENT_TIMEZONE) the newest CSV
// in the inbox folder is picked up and run exactly like a manual upload,
// producing both files. Checked once a minute rather than via a fixed cron
// instant, so a server that was down at 7:00 still runs later that Monday,
// and a file dropped in after 7:00 is still picked up the same day.
let noFileLoggedFor = null;

function newestInboxCsv() {
  if (!fs.existsSync(env.frequentInboxDir)) return null;
  const files = fs
    .readdirSync(env.frequentInboxDir, { withFileTypes: true })
    .filter((d) => d.isFile() && path.extname(d.name).toLowerCase() === ".csv")
    .map((d) => {
      const full = path.join(env.frequentInboxDir, d.name);
      return { name: d.name, full, mtime: fs.statSync(full).mtimeMs };
    })
    // Ignore leftovers from earlier weeks so a stale file is never rerun.
    .filter((f) => Date.now() - f.mtime < 8 * 24 * 60 * 60 * 1000)
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

async function runScheduledIfDue(now = new Date()) {
  const zone = zoneParts(env.frequentTimezone, now);
  if (zone.weekday !== "Mon" || zone.hour < env.frequentRunHour) return null;

  const alreadyRan = await FrequentRun.exists({ source: "scheduled", runDate: zone.dateKey });
  if (alreadyRan) return null;

  const file = newestInboxCsv();
  if (!file) {
    if (noFileLoggedFor !== zone.dateKey) {
      noFileLoggedFor = zone.dateKey;
      console.warn(`[frequent] Monday run due but no .csv found in ${env.frequentInboxDir}; will keep checking today`);
    }
    return null;
  }

  // Keep a copy in its own folder (like uploads) and move the original to
  // processed/ so it's never picked up twice.
  const dir = path.join(UPLOADS_ROOT, require("crypto").randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const inputPath = path.join(dir, "input.csv");
  fs.copyFileSync(file.full, inputPath);
  const processedDir = path.join(env.frequentInboxDir, "processed");
  fs.mkdirSync(processedDir, { recursive: true });
  fs.renameSync(file.full, path.join(processedDir, `${zone.dateKey}_${file.name}`));

  const run = await FrequentRun.create({
    originalFilename: file.name,
    runDate: zone.dateKey,
    source: "scheduled",
    inputPath,
    status: "processing",
  });
  console.log(`[frequent] scheduled Monday run started for ${zone.dateKey} using ${file.name}`);
  startRun(String(run._id));
  return run;
}

function startFrequentScheduler() {
  const tick = () =>
    runScheduledIfDue().catch((err) => console.error("[frequent] scheduler error:", err));
  tick();
  return setInterval(tick, 60 * 1000);
}

// Next scheduled run instant (ISO), for display. Steps in 15-minute slots.
function nextScheduledRun(now = new Date()) {
  const step = 15 * 60 * 1000;
  let t = Math.ceil(now.getTime() / step) * step;
  for (let i = 0; i < 8 * 24 * 4; i++, t += step) {
    const z = zoneParts(env.frequentTimezone, new Date(t));
    if (z.weekday === "Mon" && z.hour === env.frequentRunHour && z.minute === 0) {
      return new Date(t).toISOString();
    }
  }
  return null;
}

module.exports = { startRun, failInterruptedRuns, startFrequentScheduler, runScheduledIfDue, nextScheduledRun };
