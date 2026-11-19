const axios = require("axios");
const env = require("../config/env");

// The internal API expects "(XXX)XXX-XXXX", e.g. "(915)271-2882".
function formatPhoneForApi(normalizedPhone) {
  return `(${normalizedPhone.slice(0, 3)})${normalizedPhone.slice(3, 6)}-${normalizedPhone.slice(6)}`;
}

const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One request, retried (with a short backoff) on timeouts/errors before
// giving up, so a briefly overloaded DNC service doesn't let numbers slip
// through to the buyers.
async function checkOne(phone, attempts = MAX_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
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
      lastError = err.message;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  // Fail open after all retries: if our own dedupe service is unreachable,
  // don't block the whole file over it - the lead goes on to the buyers.
  return { isDuplicate: false, message: null, failed: true, error: lastError };
}

// Runs every phone through our own duplicate/DNC check before either buyer
// ever sees it. This is our own service, not a third-party API with a
// quota, so there is NO rate limit and no pacing: a sliding pool keeps
// `concurrency` requests in flight at all times (a new one starts the
// instant any finishes, with no waiting for a batch's slowest request), so
// the pass runs as fast as the service answers. The admin buyer rate limit,
// rate sharing between publishers and operating-hours pauses never apply
// here. Returns a Map of normalizedPhone -> { isDuplicate, message }.
//
// `onProgress(checkedSoFar, duplicatesSoFar)` fires about every
// PROGRESS_EVERY checks (not awaited by the workers, so saving progress
// never slows the checks). If the service is down, every request waits out
// its timeout, which on a big file would stall the job for hours - so after
// MAX_CONSECUTIVE_FAILURES checks in a row fail, the DNC pass is abandoned
// (fail open) and the remaining phones go straight to the buyers.
const PROGRESS_EVERY = 500;
const MAX_CONSECUTIVE_FAILURES = 60;

async function checkPhonesForDnc(phones, concurrency = env.internalDncConcurrency, onProgress, attempts = MAX_ATTEMPTS) {
  const results = new Map();
  let next = 0;
  let checked = 0;
  let duplicates = 0;
  let consecutiveFailures = 0;
  let failedSinceLog = 0;
  let lastError = null;
  let abandoned = false;
  let lastReported = 0;
  let progressChain = Promise.resolve();

  const report = () => {
    if (!onProgress) return;
    lastReported = checked;
    const snapshot = [checked, duplicates];
    progressChain = progressChain.then(() => onProgress(...snapshot)).catch(() => {});
  };

  const worker = async () => {
    while (!abandoned && next < phones.length) {
      const phone = phones[next++];
      const result = await checkOne(phone, attempts);
      results.set(phone, result);
      checked += 1;
      if (result.isDuplicate) duplicates += 1;

      if (result.failed) {
        consecutiveFailures += 1;
        failedSinceLog += 1;
        lastError = result.error;
        if (failedSinceLog >= 100) {
          console.error(`[internalDncClient] ${failedSinceLog} checks failed after ${attempts} attempts (${lastError})`);
          failedSinceLog = 0;
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) abandoned = true;
      } else {
        consecutiveFailures = 0;
      }

      if (checked - lastReported >= PROGRESS_EVERY) report();
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, phones.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (failedSinceLog > 0) {
    console.error(`[internalDncClient] ${failedSinceLog} checks failed after ${attempts} attempts (${lastError})`);
  }
  if (abandoned) {
    console.error("[internalDncClient] service unreachable; skipping internal DNC check for the rest of the file");
  }
  checked = phones.length; // phones skipped after abandoning count as passed through
  report();
  await progressChain;
  return results;
}

module.exports = { checkPhonesForDnc };
