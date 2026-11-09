const { checkNumber } = require("../services/realtimeCheckService");

const MAX_BATCH = 500;
const BATCH_CONCURRENCY = 20;

// POST /api/v1/check  { "phone": "5551234567", "state": "OH" (optional) }
async function check(req, res) {
  const { phone, state } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone is required" });
  res.json(await checkNumber(req.publisher, phone, state));
}

// POST /api/v1/check-batch  { "phones": ["555...", { "phone": "555...", "state": "OH" }] }
async function checkBatch(req, res) {
  const { phones } = req.body || {};
  if (!Array.isArray(phones) || phones.length === 0) {
    return res.status(400).json({ error: "phones must be a non-empty array" });
  }
  if (phones.length > MAX_BATCH) {
    return res.status(400).json({ error: `Maximum ${MAX_BATCH} phones per request` });
  }

  const results = new Array(phones.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: BATCH_CONCURRENCY }, async () => {
      while (next < phones.length) {
        const i = next++;
        const item = phones[i];
        const phone = item && typeof item === "object" ? item.phone : item;
        const state = item && typeof item === "object" ? item.state : undefined;
        results[i] = await checkNumber(req.publisher, phone, state);
      }
    })
  );
  res.json({ count: results.length, results });
}

module.exports = { check, checkBatch };
