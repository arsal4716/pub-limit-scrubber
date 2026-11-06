// Sends the SAME phone numbers through both buyer APIs (LM and HC) and
// writes an .xlsx comparing their responses.
//
//   node scripts/compare-buyers.js [phones.txt] [output.xlsx]
//
// Needs HC_VENDOR_API_KEY (and any LM_*/HC_* overrides) in server/.env or
// the environment, and outbound access to both buyer hosts. This only
// pings the buyers - it does not touch the DB or any publisher's daily
// limit, but each number is a real API call to each buyer.
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { pingLM, pingHC } = require("../src/services/buyerApiClient");
const { normalizePhone, deriveStateFromAreaCode } = require("../src/services/phoneUtils");

const inputPath = process.argv[2] || path.join(__dirname, "sample-cids.txt");
const outputPath = process.argv[3] || path.join(process.cwd(), "buyer-api-comparison.xlsx");
const CONCURRENCY = 5;

function summarize(result) {
  const raw = result.raw === null || result.raw === undefined ? "" : JSON.stringify(result.raw);
  return { status: result.status, message: result.message || "", raw };
}

async function checkOne(phone) {
  const state = deriveStateFromAreaCode(phone);
  const [lm, hc] = await Promise.all([pingLM(phone), state ? pingHC(phone, state) : { status: "Error", message: "No state for area code", raw: null }]);
  const a = summarize(lm);
  const b = summarize(hc);
  let match;
  if (a.status === "Error" || b.status === "Error") match = "Error (not comparable)";
  else match = a.status === b.status ? "Same" : "Different";
  return { phone, state: state || "", lm: a, hc: b, match };
}

async function main() {
  const phones = [...new Set(fs.readFileSync(inputPath, "utf8").split(/\r?\n/).map(normalizePhone).filter(Boolean))];
  console.log(`Checking ${phones.length} unique numbers through LM and HC...`);

  const results = new Array(phones.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < phones.length) {
        const i = next++;
        results[i] = await checkOne(phones[i]);
      }
    })
  );

  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet("Summary");
  const sheet = wb.addWorksheet("Results");
  sheet.columns = [
    { header: "Phone", key: "phone", width: 14 },
    { header: "State", key: "state", width: 7 },
    { header: "LM status", key: "lmStatus", width: 12 },
    { header: "LM message", key: "lmMessage", width: 28 },
    { header: "HC status", key: "hcStatus", width: 12 },
    { header: "HC message", key: "hcMessage", width: 28 },
    { header: "Comparison", key: "match", width: 22 },
    { header: "LM raw response", key: "lmRaw", width: 50 },
    { header: "HC raw response", key: "hcRaw", width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of results) {
    sheet.addRow({
      phone: r.phone, state: r.state,
      lmStatus: r.lm.status, lmMessage: r.lm.message,
      hcStatus: r.hc.status, hcMessage: r.hc.message,
      match: r.match, lmRaw: r.lm.raw, hcRaw: r.hc.raw,
    });
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "I1" };

  const count = (fn) => results.filter(fn).length;
  const comparable = count((r) => r.match === "Same" || r.match === "Different");
  const rows = [
    ["Numbers checked", results.length],
    ["Same result from both", count((r) => r.match === "Same")],
    ["Different result", count((r) => r.match === "Different")],
    ["Not comparable (an API errored)", count((r) => r.match === "Error (not comparable)")],
    ["Agreement % (of comparable)", comparable ? `${((count((r) => r.match === "Same") / comparable) * 100).toFixed(1)}%` : "n/a"],
    [],
    ["", "LM", "HC"],
    ["Blocked", count((r) => r.lm.status === "Blocked"), count((r) => r.hc.status === "Blocked")],
    ["Available", count((r) => r.lm.status === "Available"), count((r) => r.hc.status === "Available")],
    ["Error", count((r) => r.lm.status === "Error"), count((r) => r.hc.status === "Error")],
    [],
    ["LM Blocked but HC Available", count((r) => r.lm.status === "Blocked" && r.hc.status === "Available")],
    ["HC Blocked but LM Available", count((r) => r.hc.status === "Blocked" && r.lm.status === "Available")],
  ];
  rows.forEach((row) => summary.addRow(row));
  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 14;
  summary.getColumn(3).width = 14;
  summary.getRow(7).font = { bold: true };

  await wb.xlsx.writeFile(outputPath);
  console.log(`Wrote ${outputPath}`);
  rows.forEach((r) => r.length && console.log(r.join("\t")));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
