const fs = require("fs");
const { parse, format } = require("fast-csv");
const { normalizePhone, extractPhoneFromRow } = require("./phoneUtils");

// Pass 1: stream the uploaded file once to discover the total row count and
// the ordered list of unique, valid US phone numbers ("first occurrence"
// order - this defines which leads are "first" for the purposes of the
// publisher's daily limit). Only phone numbers are kept in memory, not full
// rows, so this scales to multi-million-row files without holding the
// whole file in RAM (unlike a naive read-everything-into-an-array approach).
function analyzeFile(inputPath, delimiter = ",") {
  return new Promise((resolve, reject) => {
    let totalRows = 0;
    let invalidPhoneCount = 0;
    let duplicateInFileCount = 0;
    const seen = new Set();
    const uniquePhonesOrdered = [];

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
      })
      .on("end", () => {
        resolve({ totalRows, invalidPhoneCount, duplicateInFileCount, uniquePhonesOrdered });
      });
  });
}

// Pass 2: re-stream the original file and write every original row back out
// unchanged, plus appended scrub columns - so the original data is never
// lost, even for rows that were skipped or invalid. `phoneResults` maps a
// normalized phone to its buyer API result; `phonesToProcessSet` is the
// subset of unique phones that were actually within the reserved quota.
function writeOutputFile(
  inputPath,
  outputPath,
  { phoneResults, phonesToProcessSet, delimiter = "," }
) {
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
        let result = { duplicate: "", buyerCode: "", buyerMessage: "" };

        if (!normalized) {
          scrubStatus = "Invalid Phone";
        } else {
          const isRepeat = seenInPass2.has(normalized);
          seenInPass2.add(normalized);
          const apiResult = phoneResults.get(normalized);

          if (apiResult) {
            result = apiResult;
            scrubStatus = isRepeat ? "Duplicate In File (Processed)" : "Processed";
          } else if (phonesToProcessSet.has(normalized)) {
            // Defensive fallback: should always have a result if it was queued to process.
            scrubStatus = "Not Processed";
          } else {
            scrubStatus = isRepeat ? "Duplicate In File" : "Skipped - Daily Limit Reached";
          }
        }

        csvStream.write({
          ...row,
          NormalizedPhone: normalized || "",
          Duplicate: result.duplicate,
          BuyerCode: result.buyerCode,
          BuyerMessage: result.buyerMessage,
          ScrubStatus: scrubStatus,
        });
      })
      .on("end", () => {
        csvStream.end();
      });
  });
}

module.exports = { analyzeFile, writeOutputFile };
