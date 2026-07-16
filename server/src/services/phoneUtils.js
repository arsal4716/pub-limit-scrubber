// Accepts any US phone format (with/without country code, punctuation,
// extensions stripped) and normalizes it to 10 digits, or returns null
// if it isn't a valid US number.
function normalizePhone(phone) {
  if (!phone) return null;

  let digits = phone.toString().replace(/\D/g, "");

  // Strip a leading US country code.
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.substring(1);
  }

  if (digits.length !== 10) {
    return null;
  }

  return digits;
}

const PHONE_HEADER_CANDIDATES = [
  "phone_number",
  "Phone",
  "phoneNumber",
  "PhoneNumber",
  "phone",
  "Phone Number",
  "phone number",
  "PHONE",
  "Mobile",
  "mobile",
  "CallerId",
  "caller_id",
];

function extractPhoneFromRow(row) {
  for (const key of PHONE_HEADER_CANDIDATES) {
    if (row[key]) return row[key];
  }
  return null;
}

module.exports = { normalizePhone, extractPhoneFromRow, PHONE_HEADER_CANDIDATES };
