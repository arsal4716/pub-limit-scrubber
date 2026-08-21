const axios = require("axios");
const env = require("../config/env");

// The internal API expects "(XXX)XXX-XXXX", e.g. "(915)271-2882".
function formatPhoneForApi(normalizedPhone) {
  return `(${normalizedPhone.slice(0, 3)})${normalizedPhone.slice(3, 6)}-${normalizedPhone.slice(6)}`;
}

async function checkOne(phone) {
  try {
    const response = await axios.post(
      env.internalDncApiUrl,
      { phone: formatPhoneForApi(phone) },
      { timeout: env.internalDncApiTimeoutMs }
    );
    if (response.data?.success !== true) {
      return { isDuplicate: false, message: null };
    }
    const status = response.data.status;
    return { isDuplicate: status !== "Not Duplicate", message: status };
  } catch (err) {
    // Fail open: if our own dedupe service is unreachable or errors out,
    // don't block the whole file over it - let the lead through to the
    // buyer APIs instead of marking a real lead DNC over a network blip.
    console.error("[internalDncClient] check-number request failed:", err.message);
    return { isDuplicate: false, message: null };
  }
}

// Runs every phone through our own duplicate/DNC check before either buyer
// ever sees it. This is our own service, not a third-party API with a
// quota, so there's no pacing/delay between batches - `concurrency` only
// caps how many requests are in flight at once. Returns a Map of
// normalizedPhone -> { isDuplicate, message }.
async function checkPhonesForDnc(phones, concurrency = env.internalDncConcurrency) {
  const results = new Map();

  for (let i = 0; i < phones.length; i += concurrency) {
    const batch = phones.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(checkOne));
    batch.forEach((phone, idx) => results.set(phone, batchResults[idx]));
  }

  return results;
}

module.exports = { checkPhonesForDnc };
