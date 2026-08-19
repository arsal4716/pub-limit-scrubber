const { AREA_CODE_TO_STATE } = require("../data/areaCodeToState");

// Accepts any US phone format (with/without country code, punctuation,
// spaces, or a trailing extension) and normalizes it to 10 digits, or
// returns null if it isn't a valid US number.
function normalizePhone(phone) {
  if (!phone) return null;

  // Drop a trailing extension ("x123", "ext. 123", "extension 123") before
  // counting digits, so e.g. "555-123-4567 x42" isn't rejected as too long.
  const withoutExtension = phone.toString().replace(/\s*(ext\.?|extension|x)\s*\d+\s*$/i, "");

  let digits = withoutExtension.replace(/\D/g, "");

  // Strip a leading US country code.
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.substring(1);
  }

  if (digits.length !== 10) {
    return null;
  }

  return digits;
}

// Human-readable examples shown to publishers - actual matching (see
// findValueByHeaders below) is case/spacing/punctuation-insensitive, so
// e.g. "phone_number", "Phone Number", and "PHONENUMBER" all match
// "Phone Number" here without needing to be listed separately.
const PHONE_HEADER_CANDIDATES = [
  "Phone",
  "Phone Number",
  "Mobile",
  "Mobile Number",
  "Cell",
  "Cell Phone",
  "Telephone",
  "Contact Number",
  "Primary Phone",
  "CallerId",
];

const STATE_HEADER_CANDIDATES = ["State", "State Code", "State Abbreviation", "ST"];

// Matches a column header ignoring case, surrounding whitespace, and any
// spaces/underscores/hyphens - so "Phone Number", "phone_number", and
// "PHONE-NUMBER" are all treated as the same column.
function normalizeHeaderKey(key) {
  return key.toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findValueByHeaders(row, candidates) {
  const wanted = new Set(candidates.map(normalizeHeaderKey));
  for (const key of Object.keys(row)) {
    if (!wanted.has(normalizeHeaderKey(key))) continue;
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
}

function extractPhoneFromRow(row) {
  return findValueByHeaders(row, PHONE_HEADER_CANDIDATES);
}

const STATE_NAME_TO_ABBR = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "washington dc": "DC",
};

const VALID_STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR));

// Accepts either a 2-letter abbreviation or a full state name, in any
// case, with optional periods/extra whitespace ("AZ", "az", "Arizona",
// "ARIZONA", "AZ." all resolve to "AZ"). Falls back to an uppercased,
// trimmed value for anything unrecognized rather than silently dropping it.
function normalizeStateCode(raw) {
  if (!raw) return null;
  const trimmed = raw.toString().trim();
  if (!trimmed) return null;

  const compact = trimmed.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

  if (compact.length === 2 && VALID_STATE_ABBRS.has(compact.toUpperCase())) {
    return compact.toUpperCase();
  }
  if (STATE_NAME_TO_ABBR[compact]) {
    return STATE_NAME_TO_ABBR[compact];
  }
  return trimmed.toUpperCase();
}

// Extracts a lead's state from the row, normalized to a 2-letter code
// (abbreviation or full name, any case, both accepted). Returns null if no
// recognized state column is present or it's blank - callers should fall
// back to deriveStateFromAreaCode before giving up entirely.
function extractStateFromRow(row) {
  return normalizeStateCode(findValueByHeaders(row, STATE_HEADER_CANDIDATES));
}

// Falls back to the phone's own area code when the file has no state
// column (or a blank value for that row) - e.g. a normalized phone
// "6142345678" starts with area code 614, which is Ohio. Returns null for
// an area code not in the table (unassigned, toll-free/N11, or otherwise
// non-geographic) rather than guessing.
function deriveStateFromAreaCode(normalizedPhone) {
  if (!normalizedPhone || normalizedPhone.length !== 10) return null;
  const areaCode = normalizedPhone.slice(0, 3);
  const state = AREA_CODE_TO_STATE[areaCode];
  return state ? normalizeStateCode(state) : null;
}

module.exports = {
  normalizePhone,
  extractPhoneFromRow,
  extractStateFromRow,
  deriveStateFromAreaCode,
  normalizeStateCode,
  PHONE_HEADER_CANDIDATES,
  STATE_HEADER_CANDIDATES,
};
