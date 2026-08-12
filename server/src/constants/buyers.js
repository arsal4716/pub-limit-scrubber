// Central registry of buyer identities. Buyer1/Buyer2 is the fixed,
// anonymized mapping shown to publishers - only admin-facing code should
// ever surface BUYER_LABELS.
const BUYER_KEYS = ["LM", "IC"];

const BUYER_LABELS = {
  LM: "LM (ACA - Callgrid)",
  IC: "IC (ACA - Salesradix)",
};

const BUYER_SLOT = {
  LM: "buyer1",
  IC: "buyer2",
};

module.exports = { BUYER_KEYS, BUYER_LABELS, BUYER_SLOT };
