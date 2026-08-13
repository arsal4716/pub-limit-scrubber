// Central registry of buyer identities. Buyer1/Buyer2 is the fixed,
// anonymized mapping shown to publishers.
const BUYER_KEYS = ["LM", "HC"];

const BUYER_SLOT = {
  LM: "buyer1",
  HC: "buyer2",
};

// Publisher-facing display text for each slot - never the real buyer name.
const BUYER_SLOT_LABEL = {
  buyer1: "Buyer 1",
  buyer2: "Buyer 2",
};

module.exports = { BUYER_KEYS, BUYER_SLOT, BUYER_SLOT_LABEL };
