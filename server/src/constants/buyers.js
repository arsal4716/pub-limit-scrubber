// Central registry of buyer identities. Buyer1/Buyer2 is the fixed,
// anonymized mapping shown to publishers - only admin-facing code should
// ever surface BUYER_LABELS.
const BUYER_KEYS = ["LM", "HC"];

const BUYER_LABELS = {
  LM: "LM (ACA - Callgrid)",
  HC: "HC (ACA - NextGen Insurance Solutions)",
};

const BUYER_SLOT = {
  LM: "buyer1",
  HC: "buyer2",
};

// Publisher-facing display text for each slot - never the real buyer name.
const BUYER_SLOT_LABEL = {
  buyer1: "Buyer 1",
  buyer2: "Buyer 2",
};

module.exports = { BUYER_KEYS, BUYER_LABELS, BUYER_SLOT, BUYER_SLOT_LABEL };
