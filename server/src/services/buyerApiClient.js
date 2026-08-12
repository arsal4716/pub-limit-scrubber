const axios = require("axios");
const env = require("../config/env");
const { reserveBuyerCall } = require("./buyerLimitService");

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

// Enforces the buyer's own daily call cap before actually pinging it. If
// the cap was already reached today, the buyer is skipped for this phone
// (the other buyer is still called normally) rather than failing the job.
// `precheck(extra)` can veto the call entirely (e.g. HC needs a state and
// shouldn't burn its daily quota on a row that doesn't have one).
async function callBuyer(buyerKey, phone, extra, precheck) {
  if (precheck) {
    const skip = precheck(extra);
    if (skip) return skip;
  }

  const allowed = await reserveBuyerCall(buyerKey);
  if (!allowed) {
    return { status: "Not Checked", message: "Daily buyer limit reached", raw: null };
  }
  return BUYER_PINGERS[buyerKey](phone, extra);
}

function requireState(state) {
  return state ? null : { status: "Error", message: "Missing state value", raw: null };
}

// Pings both buyers for a phone at the same time. Overall status is
// "Available" if either buyer allows it, "Blocked" only if every buyer
// that was actually queried reports it blocked, and "Error"/"Not
// Processed" when no buyer could give a real answer. `state` is the
// lead's 2-letter state code, required by HC.
async function checkPhone(phone, state) {
  const [lm, hc] = await Promise.all([
    callBuyer("LM", phone),
    callBuyer("HC", phone, state, requireState),
  ]);
  const buyers = { LM: lm, HC: hc };

  const queried = Object.values(buyers).filter((r) => r.status !== "Not Checked");
  let overallStatus;
  if (queried.some((r) => r.status === "Available")) {
    overallStatus = "Available";
  } else if (queried.length > 0 && queried.every((r) => r.status === "Blocked")) {
    overallStatus = "Blocked";
  } else if (queried.length === 0) {
    overallStatus = "Not Processed";
  } else {
    overallStatus = "Error";
  }

  return { overallStatus, buyers };
}

// Processes `phones` in batches of `env.buyerApiConcurrency` phones,
// waiting `env.buyerApiBatchDelayMs` between batches. Each phone pings
// both buyers concurrently, so default settings (20 phones / 1200ms)
// throttle each buyer to ~1000 requests/min independently. `phoneStates`
// maps a normalized phone to its state code (for HC). `onBatchDone
// (processedSoFar, total)` is called after each batch so callers can
// persist progress for polling clients.
async function processPhones(phones, phoneStates, onResult, onBatchDone) {
  const total = phones.length;
  let processed = 0;

  for (let i = 0; i < total; i += env.buyerApiConcurrency) {
    const batch = phones.slice(i, i + env.buyerApiConcurrency);

    await Promise.all(
      batch.map(async (phone) => {
        const result = await checkPhone(phone, phoneStates.get(phone));
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

// Effective sustained throughput against each buyer API, e.g. 20/1.2s = ~1000/min.
function leadsPerMinuteRate() {
  return (env.buyerApiConcurrency / env.buyerApiBatchDelayMs) * 60 * 1000;
}

module.exports = { checkPhone, processPhones, leadsPerMinuteRate };
