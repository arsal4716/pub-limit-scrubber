const fs = require("fs");
const { parse, format } = require("fast-csv");
const { normalizePhone, extractPhoneFromRow, extractStateFromRow } = require("./phoneUtils");
const { BUYER_SLOT_LABEL } = require("../constants/buyers");

// Pass 1: stream the uploaded file once to discover the total row count and
// the ordered list of unique, valid US phone numbers ("first occurrence"
// order - this defines which leads are "first" for the purposes of the
// publisher's daily limit). Only phone numbers (and each one's state, for
// the HC buyer) are kept in memory, not full rows, so this scales to
// multi-million-row files without holding the whole file in RAM (unlike a
// naive read-everything-into-an-array approach).
function analyzeFile(inputPath, delimiter = ",") {
  return new Promise((resolve, reject) => {
    let totalRows = 0;
    let invalidPhoneCount = 0;
    let duplicateInFileCount = 0;
    const seen = new Set();
    const uniquePhonesOrdered = [];
    const phoneStates = new Map();

    fs.createReadStream(inputPath)
      .pipe(parse({ headers: true, delimiter }))
      .on("error", reject)
      .on("data", (row) => {
        totalRows++;
        const normalized = normalizePhone(extractPhoneFromRow(row));

        if (!normalized) {
          invalidPhoneCount++;
          return;
        }
        if (seen.has(normalized)) {
          duplicateInFileCount++;
          return;
        }
        seen.add(normalized);
        uniquePhonesOrdered.push(normalized);
        phoneStates.set(normalized, extractStateFromRow(row));
      })
      .on("end", () => {
        resolve({ totalRows, invalidPhoneCount, duplicateInFileCount, uniquePhonesOrdered, phoneStates });
      });
  });
}

// Pass 2: re-stream the original file and write every original row back out
// unchanged, plus appended scrub columns - so the original data is never
// lost, even for rows that were skipped or invalid. `phoneResults` maps a
// normalized phone to its buyer result - every unique, valid phone always
// gets one (possibly "Not Checked" if that publisher's buyer allotment was
// exhausted), since there's no pre-flight slicing anymore.
function writeOutputFile(inputPath, outputPath, { phoneResults, delimiter = "," }) {
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
        const normalized = normalizePhone(extractPhoneFromRow(row));

        let scrubStatus;
        // Each phone is routed to exactly one buyer, so there's a single
        // status/message pair per row - `BuyerAssigned` names the slot
        // (anonymized "Buyer 1"/"Buyer 2", never the real buyer) that
        // actually checked it.
        let result = { slot: "", status: "", message: "" };

        if (!normalized) {
          scrubStatus = "Invalid Phone";
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

module.exports = { analyzeFile, writeOutputFile };
