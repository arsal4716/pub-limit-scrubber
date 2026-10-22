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
    return { isDuplicate: false, message: null, failed: true };
  }
}

// Runs every phone through our own duplicate/DNC check before either buyer
// ever sees it. This is our own service, not a third-party API with a
// quota, so there's no pacing/delay between batches - `concurrency` only
// caps how many requests are in flight at once. Returns a Map of
// normalizedPhone -> { isDuplicate, message }.
//
// `onProgress(checkedSoFar)` fires after each batch. If the service is
// down, every request waits out its timeout, which on a big file would
// stall the job for hours - so after MAX_FAILED_BATCHES consecutive
// batches where every request failed, the DNC pass is abandoned (fail
// open) and the remaining phones go straight to the buyers.
const MAX_FAILED_BATCHES = 3;

async function checkPhonesForDnc(phones, concurrency = env.internalDncConcurrency, onProgress) {
  const results = new Map();
  let failedBatches = 0;

  for (let i = 0; i < phones.length; i += concurrency) {
    const batch = phones.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(checkOne));
    batch.forEach((phone, idx) => results.set(phone, batchResults[idx]));
    if (onProgress) await onProgress(Math.min(i + concurrency, phones.length));

    failedBatches = batchResults.every((r) => r.failed) ? failedBatches + 1 : 0;
    if (failedBatches >= MAX_FAILED_BATCHES) {
      console.error("[internalDncClient] service unreachable; skipping internal DNC check for the rest of the file");
      if (onProgress) await onProgress(phones.length);
      break;
    }
  }

  return results;
}

module.exports = { checkPhonesForDnc };
