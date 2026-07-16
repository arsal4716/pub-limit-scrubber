const axios = require("axios");
const env = require("../config/env");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Checks a single normalized (10-digit) phone against the buyer API.
// Mirrors the reference script's contract: code 4007 means the CallerId
// is blocked/duplicate; anything else is treated as accepted.
async function checkPhone(phone) {
  try {
    const response = await axios.get(`${env.buyerApiUrl}${phone}`, {
      timeout: env.buyerApiTimeoutMs,
    });

    const data = response.data || {};

    if (data.code === 4007) {
      return {
        duplicate: "Yes",
        buyerCode: 4007,
        buyerMessage: data.message || "CallerId Blocked",
      };
    }

    return {
      duplicate: "No",
      buyerCode: data.code ?? "",
      buyerMessage: data.message || "",
    };
  } catch (err) {
    return {
      duplicate: "Error",
      buyerCode: "",
      buyerMessage: err.message,
    };
  }
}

// Processes `phones` in batches of `env.buyerApiConcurrency` requests,
// waiting `env.buyerApiBatchDelayMs` between batches. Default settings
// (20 requests / 1200ms) throttle the buyer API to ~1000 requests/min.
// `onBatchDone(processedSoFar, total)` is called after each batch so
// callers can persist progress for polling clients.
async function processPhones(phones, onResult, onBatchDone) {
  const total = phones.length;
  let processed = 0;

  for (let i = 0; i < total; i += env.buyerApiConcurrency) {
    const batch = phones.slice(i, i + env.buyerApiConcurrency);

    await Promise.all(
      batch.map(async (phone) => {
        const result = await checkPhone(phone);
        onResult(phone, result);
      })
    );

    processed += batch.length;
    if (onBatchDone) await onBatchDone(processed, total);

    const isLastBatch = i + env.buyerApiConcurrency >= total;
    if (!isLastBatch) {
      await sleep(env.buyerApiBatchDelayMs);
    }
  }
}

// Effective sustained throughput against the buyer API, e.g. 20/1.2s = ~1000/min.
function leadsPerMinuteRate() {
  return (env.buyerApiConcurrency / env.buyerApiBatchDelayMs) * 60 * 1000;
}

module.exports = { checkPhone, processPhones, leadsPerMinuteRate };
