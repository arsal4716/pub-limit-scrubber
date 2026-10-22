const fs = require("fs");
const { parse, format } = require("fast-csv");
const {
  normalizePhone,
  extractPhoneFromRow,
  detectPhoneColumn,
  PHONE_DETECT_SAMPLE_SIZE,
  extractStateFromRow,
  deriveStateFromAreaCode,
} = require("./phoneUtils");
const { BUYER_SLOT_LABEL } = require("../constants/buyers");

// Pass 1: stream the uploaded file once to discover the total row count and
// the ordered list of unique, valid US phone numbers ("first occurrence"
// order - this defines which leads are "first" for the purposes of the
// publisher's daily limit). Only phone numbers (and each one's state, for
// the HC buyer) are kept in memory, not full rows, so this scales to
// multi-million-row files without holding the whole file in RAM (unlike a
// naive read-everything-into-an-array approach).
//
// The phone column is auto-detected (see phoneUtils.detectPhoneColumn) from
// the first rows, so rows are buffered only until the sample fills.
// Rejects with a PhoneColumnNotFoundError if no phone column exists.
const ANALYZE_PROGRESS_EVERY = 50000;

class PhoneColumnNotFoundError extends Error {
  constructor() {
    super(
      "Phone number not found. We couldn't find a column of US phone numbers in your file. " +
        "Please check the file has a phone column and try again."
    );
    this.userFacing = true;
  }
}

function analyzeFile(inputPath, delimiter = ",", onProgress) {
  return new Promise((resolve, reject) => {
    let totalRows = 0;
    let invalidPhoneCount = 0;
    let blankPhoneCount = 0;
    let duplicateInFileCount = 0;
    const seen = new Set();
    const uniquePhonesOrdered = [];
    const phoneStates = new Map();
    let phoneColumn;
    let pending = [];

    const handleRow = (row) => {
        totalRows++;
        const rawPhone = extractPhoneFromRow(row, phoneColumn);
        const normalized = normalizePhone(rawPhone);

        if (!normalized) {
          if (rawPhone === null) blankPhoneCount++;
          else invalidPhoneCount++;
          return;
        }
        if (seen.has(normalized)) {
          duplicateInFileCount++;
          return;
        }
        seen.add(normalized);
        uniquePhonesOrdered.push(normalized);
        // If the row has no state column (or it's blank), fall back to
        // deriving the state from the phone's own area code rather than
        // leaving it unset - the lead still gets scrubbed against HC
        // instead of erroring out for a missing state.
        const state = extractStateFromRow(row) || deriveStateFromAreaCode(normalized);
        phoneStates.set(normalized, state);
    };

    // Returns false (after rejecting) if no phone column could be found.
    const decideColumn = () => {
      phoneColumn = detectPhoneColumn(pending);
      if (!phoneColumn) {
        reject(new PhoneColumnNotFoundError());
        return false;
      }
      pending.forEach(handleRow);
      pending = [];
      return true;
    };

    const stream = fs.createReadStream(inputPath).pipe(parse({ headers: true, delimiter }));
    stream
      .on("error", reject)
      .on("data", (row) => {
        if (phoneColumn === undefined) {
          pending.push(row);
          if (pending.length >= PHONE_DETECT_SAMPLE_SIZE && !decideColumn()) stream.destroy();
          return;
        }
        handleRow(row);
        if (onProgress && totalRows % ANALYZE_PROGRESS_EVERY === 0) {
          onProgress({ totalRows, uniqueCount: uniquePhonesOrdered.length, duplicateInFileCount, invalidPhoneCount, blankPhoneCount });
        }
      })
      .on("end", () => {
        if (phoneColumn === undefined && !decideColumn()) return;
        if (uniquePhonesOrdered.length === 0) {
          return reject(new PhoneColumnNotFoundError());
        }
        resolve({ totalRows, invalidPhoneCount, blankPhoneCount, duplicateInFileCount, uniquePhonesOrdered, phoneStates, phoneColumn });
      });
  });
}

// Pass 2: re-stream the original file and write every original row back out
// unchanged, plus appended scrub columns - so the original data is never
// lost, even for rows that were skipped or invalid. `phoneResults` maps a
// normalized phone to its buyer result - every unique, valid phone always
// gets one (possibly "Not Checked" if that publisher's buyer allotment was
// exhausted), since there's no pre-flight slicing anymore.
function writeOutputFile(inputPath, outputPath, { phoneResults, delimiter = ",", phoneColumn }) {
  return new Promise((resolve, reject) => {
    const seenInPass2 = new Set();
    const writeStream = fs.createWriteStream(outputPath);
    const csvStream = format({ headers: true, delimiter });
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    csvStream.pipe(writeStream);
    writeStream.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    writeStream.on("error", fail);
    csvStream.on("error", fail);

    fs.createReadStream(inputPath)
      .pipe(parse({ headers: true, delimiter }))
      .on("error", (err) => {
        csvStream.end();
        fail(err);
      })
      .on("data", (row) => {
        const rawPhone = extractPhoneFromRow(row, phoneColumn);
        const normalized = normalizePhone(rawPhone);

        let scrubStatus;
        // Each phone is routed to exactly one buyer, so there's a single
        // status/message pair per row - `BuyerAssigned` names the slot
        // (anonymized "Buyer 1"/"Buyer 2", never the real buyer) that
        // actually checked it.
        let result = { slot: "", status: "", message: "" };

        if (!normalized) {
          scrubStatus = rawPhone === null ? "Blank Phone" : "Invalid Phone";
        } else {
          const isRepeat = seenInPass2.has(normalized);
          seenInPass2.add(normalized);
          const apiResult = phoneResults.get(normalized);

          if (apiResult) {
            result = apiResult;
            scrubStatus = isRepeat ? "Duplicate In File (Processed)" : "Processed";
          } else {
            // Defensive fallback: every unique, valid phone should always
            // have a result, since the full list is always processed.
            scrubStatus = isRepeat ? "Duplicate In File" : "Not Processed";
          }
        }

        csvStream.write({
          ...row,
          NormalizedPhone: normalized || "",
          ScrubStatus: scrubStatus,
          BuyerAssigned: BUYER_SLOT_LABEL[result.slot] || "",
          BuyerStatus: result.status,
          BuyerMessage: result.message,
        });
      })
      .on("end", () => {
        csvStream.end();
      });
  });
}

module.exports = { analyzeFile, writeOutputFile, PhoneColumnNotFoundError };
