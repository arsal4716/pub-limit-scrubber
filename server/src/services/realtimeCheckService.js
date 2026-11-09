const { normalizePhone, normalizeStateCode, deriveStateFromAreaCode } = require("./phoneUtils");
const { checkPhonesForDnc } = require("./internalDncClient");
const { reserveBuyerCall, getPublisherBuyerLimits } = require("./buyerLimitService");
const { pingLM, pingHC } = require("./buyerApiClient");
const { getOrCreateGlobalConfig, enabledBuyersFrom } = require("./limitService");

// Realtime check of one number for a publisher. Order: internal DNC ->
// buyer 1 -> (only if buyer 1 says available) buyer 2, so a number is
// blocked if EITHER buyer blocks it. Each buyer call is reserved against
// the publisher's own daily limit (split 50/50), same as file scrubs.
// Buyer names are never exposed - only buyer1/buyer2.
async function checkNumber(publisher, rawPhone, rawState) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { phone: rawPhone ?? null, status: "invalid", reason: "Not a valid US phone number" };
  }

  const dnc = (await checkPhonesForDnc([phone], 1)).get(phone);
  if (dnc && dnc.isDuplicate) {
    return { phone, status: "dnc", reason: "Duplicate - internal DNC list", checkedBy: [] };
  }

  const enabled = enabledBuyersFrom(await getOrCreateGlobalConfig());
  if (!enabled.LM && !enabled.HC) {
    return { phone, status: "error", reason: "No buyer API is enabled", checkedBy: [] };
  }
  const limits = getPublisherBuyerLimits(publisher.dailyLimit, enabled);
  const state = (rawState && normalizeStateCode(rawState)) || deriveStateFromAreaCode(phone);
  const checkedBy = [];

  // Buyers run in order (LM, then HC) but only the enabled ones; a number
  // is blocked if any enabled buyer blocks it.
  const steps = [];
  if (enabled.LM) steps.push({ key: "LM", slot: "buyer1", ping: () => pingLM(phone) });
  if (enabled.HC) steps.push({ key: "HC", slot: "buyer2", ping: () => pingHC(phone, state) });

  for (const step of steps) {
    if (step.key === "HC" && !state) {
      if (checkedBy.length === 0) return { phone, status: "error", reason: "State could not be determined", checkedBy };
      continue;
    }
    if (!(await reserveBuyerCall(step.key, publisher._id, limits[step.key]))) {
      if (checkedBy.length === 0) return { phone, status: "limit_reached", reason: "Daily limit reached", checkedBy };
      return { phone, status: "available", reason: "Caller Allowed (another buyer's limit reached, not checked)", checkedBy };
    }
    const result = await step.ping();
    checkedBy.push(step.slot);
    if (result.status === "Blocked") return { phone, status: "blocked", reason: result.message, checkedBy };
    if (result.status === "Error") return { phone, status: "error", reason: `${step.slot === "buyer1" ? "Buyer 1" : "Buyer 2"} error`, checkedBy };
  }
  return { phone, status: "available", reason: "Caller Allowed", checkedBy };
}

module.exports = { checkNumber };
