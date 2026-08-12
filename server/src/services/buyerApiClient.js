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

// IC (ACA) - salesradix. "Available" = allowed. Anything else = blocked/duplicate.
async function pingIC(phone) {
  try {
    const response = await axios.get(env.icBuyerApiUrl, {
      params: {
        PhoneNumber: `1${phone}`,
        Vertical: env.icVertical,
        SubSourceID: env.icSubSourceId,
        ResponseType: "json",
      },
      timeout: env.icBuyerApiTimeoutMs,
    });
    const result = (response.data?.result || "").trim();
    const allowed = result.toLowerCase() === "available";
    return {
      status: allowed ? "Available" : "Blocked",
      message: allowed ? "Caller Allowed" : result || "Duplicate / Blocked",
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

const BUYER_PINGERS = { LM: pingLM, IC: pingIC };

// Enforces the buyer's own daily call cap before actually pinging it. If
// the cap was already reached today, the buyer is skipped for this phone
// (the other buyer is still called normally) rather than failing the job.
async function callBuyer(buyerKey, phone) {
  const allowed = await reserveBuyerCall(buyerKey);
  if (!allowed) {
    return { status: "Not Checked", message: "Daily buyer limit reached", raw: null };
  }
  return BUYER_PINGERS[buyerKey](phone);
}

// Pings both buyers for a phone at the same time. Overall status is
// "Available" if either buyer allows it, "Blocked" only if every buyer
// that was actually queried reports it blocked, and "Error"/"Not
// Processed" when no buyer could give a real answer.
async function checkPhone(phone) {
  const [lm, ic] = await Promise.all([callBuyer("LM", phone), callBuyer("IC", phone)]);
  const buyers = { LM: lm, IC: ic };

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
// throttle each buyer to ~1000 requests/min independently.
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

// Effective sustained throughput against each buyer API, e.g. 20/1.2s = ~1000/min.
function leadsPerMinuteRate() {
  return (env.buyerApiConcurrency / env.buyerApiBatchDelayMs) * 60 * 1000;
}

module.exports = { checkPhone, processPhones, leadsPerMinuteRate };
