const { normalizePhone, normalizeStateCode, deriveStateFromAreaCode } = require("./phoneUtils");
const { checkPhonesForDnc } = require("./internalDncClient");
const { reserveBuyerCall, getPublisherBuyerLimits } = require("./buyerLimitService");
const { pingLM, pingHC } = require("./buyerApiClient");

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

  const limits = getPublisherBuyerLimits(publisher.dailyLimit);
  const checkedBy = [];

  if (!(await reserveBuyerCall("LM", publisher._id, limits.LM))) {
    return { phone, status: "limit_reached", reason: "Daily limit reached", checkedBy };
  }
  const lm = await pingLM(phone);
  checkedBy.push("buyer1");
  if (lm.status === "Blocked") return { phone, status: "blocked", reason: lm.message, checkedBy };
  if (lm.status === "Error") return { phone, status: "error", reason: "Buyer 1 error", checkedBy };

  const state = (rawState && normalizeStateCode(rawState)) || deriveStateFromAreaCode(phone);
  if (!state) return { phone, status: "available", reason: "Caller Allowed", checkedBy };

  if (!(await reserveBuyerCall("HC", publisher._id, limits.HC))) {
    return { phone, status: "available", reason: "Caller Allowed (buyer 2 limit reached, not checked)", checkedBy };
  }
  const hc = await pingHC(phone, state);
  checkedBy.push("buyer2");
  if (hc.status === "Blocked") return { phone, status: "blocked", reason: hc.message, checkedBy };
  if (hc.status === "Error") return { phone, status: "error", reason: "Buyer 2 error", checkedBy };
  return { phone, status: "available", reason: "Caller Allowed", checkedBy };
}

module.exports = { checkNumber };
