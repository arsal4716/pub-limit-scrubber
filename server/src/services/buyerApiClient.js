const axios = require("axios");
const env = require("../config/env");
const { reserveBuyerCall } = require("./buyerLimitService");
const { BUYER_SLOT } = require("../constants/buyers");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// LM (ACA) - callgrid. Blocked when code is 4007 or 4005.
async function pingLM(phone) {
  try {
    const response = await axios.get(env.lmBuyerApiUrl, {
      params: { CallerId: `1${phone}` },
      timeout: env.lmBuyerApiTimeoutMs,
    });
    const code = Number(response.data?.code);
    const blocked = code === 4007 || code === 4005;
    return {
      status: blocked ? "Blocked" : "Available",
      message: blocked ? response.data?.message || "CallerID Blocked" : "Caller Allowed",
      raw: response.data,
    };
  } catch (err) {
    return {
      status: "Error",
      message: err.message,
      raw: err.response?.data || null,
    };
  }
}

// HC (ACA) - NextGen Insurance Solutions. Duplicate/suppression is
// determined solely by `phs_suppressed` - the capacity/availability
// fields (accept, status, agents, etc.) are informational only and don't
// affect the scrub result. Requires a per-lead state code.
async function pingHC(phone, state) {
  try {
    const response = await axios.get(env.hcBuyerApiUrl, {
      params: { state, caller_id: `1${phone}` },
      timeout: env.hcBuyerApiTimeoutMs,
    });
    const suppressed = response.data?.phs_suppressed === true;
    return {
      status: suppressed ? "Blocked" : "Available",
      message: suppressed ? response.data?.message || "Suppressed / Duplicate" : "Caller Allowed",
      raw: response.data,
    };
  } catch (err) {
    return {
      status: "Error",
      message: err.message,
      raw: err.response?.data || null,
    };
  }
}

const BUYER_PINGERS = { LM: pingLM, HC: pingHC };

// LM and HC both scrub against the same underlying suppression data, so
// checking a phone against both is redundant. Instead each phone is routed
// to exactly ONE buyer - split the unique phone list in half (first half to
// LM/buyer1, second half to HC/buyer2) and run both halves through their
// own independent, concurrently-running pacing loop. Since neither buyer
// re-checks the other's phones, this doubles total throughput (e.g. two
// buyers each sustaining ~1000/min yields ~2000 unique phones/min overall)
// instead of just doubling API calls per phone.
async function checkPhoneWithBuyer(buyerKey, phone, state, publisherId, dailyLimit) {
  if (buyerKey === "HC" && !state) {
    return { status: "Error", message: "Missing state value", raw: null };
  }

  // The publisher's own dailyLimit is split 50/50 between the two buyers -
  // not a pool shared with other publishers.
  const allowed = await reserveBuyerCall(buyerKey, publisherId, dailyLimit);
  if (!allowed) {
    // No fallback to the other buyer by design - a phone routed to a
    // buyer this publisher is out of quota with is left unprocessed
    // rather than double-checked by the other buyer.
    return { status: "Not Checked", message: "Daily buyer limit reached", raw: null };
  }
  return BUYER_PINGERS[buyerKey](phone, state);
}

// Runs one buyer's half of the split at env.buyerApiConcurrency phones
// every env.buyerApiBatchDelayMs, independent of the other buyer's loop.
async function processPhonesForBuyer(buyerKey, phones, phoneStates, publisherId, dailyLimit, onResult, onProgress) {
  const slot = BUYER_SLOT[buyerKey];
  let processed = 0;

  for (let i = 0; i < phones.length; i += env.buyerApiConcurrency) {
    const batch = phones.slice(i, i + env.buyerApiConcurrency);

    await Promise.all(
      batch.map(async (phone) => {
        const state = phoneStates.get(phone);
        const result = await checkPhoneWithBuyer(buyerKey, phone, state, publisherId, dailyLimit);
        onResult(phone, { slot, buyerKey, ...result });
      })
    );

    processed += batch.length;
    if (onProgress) await onProgress(processed);

    const isLastBatch = i + env.buyerApiConcurrency >= phones.length;
    if (!isLastBatch) {
      await sleep(env.buyerApiBatchDelayMs);
    }
  }
}

// Splits `phones` into two halves (buyer1 = LM gets the first, larger half
// on an odd count; buyer2 = HC gets the second) and processes both halves
// concurrently against `publisherId`'s own allotment from each buyer.
// `buyerLimits` is `{ LM, HC }`, that publisher's own dailyLimit split
// 50/50 (see buyerLimitService.getPublisherBuyerLimits). `phoneStates`
// maps a normalized phone to its state code (for HC). `onResult(phone,
// result)` fires per phone with `{ slot, buyerKey, status, message, raw }`
// - exactly one buyer's result, since each phone is only ever routed to
// one. `onBatchDone(processedSoFar, total)` fires after either loop makes
// progress, so callers can persist combined progress for polling clients.
async function processPhonesSplit(phones, phoneStates, publisherId, buyerLimits, onResult, onBatchDone) {
  const total = phones.length;
  const mid = Math.ceil(total / 2);
  const buyer1Phones = phones.slice(0, mid);
  const buyer2Phones = phones.slice(mid);

  let buyer1Done = 0;
  let buyer2Done = 0;
  const reportProgress = async () => {
    if (onBatchDone) await onBatchDone(buyer1Done + buyer2Done, total);
  };

  await Promise.all([
    processPhonesForBuyer("LM", buyer1Phones, phoneStates, publisherId, buyerLimits.LM, onResult, async (n) => {
      buyer1Done = n;
      await reportProgress();
    }),
    processPhonesForBuyer("HC", buyer2Phones, phoneStates, publisherId, buyerLimits.HC, onResult, async (n) => {
      buyer2Done = n;
      await reportProgress();
    }),
  ]);
}

// Combined sustained throughput across BOTH buyers running in parallel on
// their own half of the list, e.g. 20/1.2s per buyer = ~1000/min per buyer
// = ~2000 unique phones/min overall.
function leadsPerMinuteRate() {
  return 2 * ((env.buyerApiConcurrency / env.buyerApiBatchDelayMs) * 60 * 1000);
}

module.exports = { processPhonesSplit, leadsPerMinuteRate };
