// Mirrors the server's normalizePhone: any US format -> 10 digits, or null.
export function normalizePhone(phone) {
  if (!phone) return null;
  const withoutExtension = String(phone).replace(/\s*(ext\.?|extension|x)\s*\d+\s*$/i, "");
  let digits = withoutExtension.replace(/\D/g, "");
  digits = digits.replace(/^(011|00)(?=1\d{10}$)/, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.substring(1);
  return digits.length === 10 ? digits : null;
}

// Restricts what can be typed/pasted into a phone box to a valid-looking US
// number: digits only, at most 10 (a leading +1/1 country code is dropped),
// and the area code and exchange can't start with 0 or 1 (NANP rule).
// Returns the display value "(512) 555-0003" as it fills in.
export function formatUsPhoneInput(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("1")) digits = digits.slice(1); // country code
  digits = digits.slice(0, 10);

  // Drop any digit that breaks the 0/1 rule for the first digit of the
  // area code (position 0) and of the exchange (position 3).
  let kept = "";
  for (const d of digits) {
    const pos = kept.length;
    if ((pos === 0 || pos === 3) && (d === "0" || d === "1")) continue;
    kept += d;
  }

  if (kept.length <= 3) return kept.length ? `(${kept}` : "";
  if (kept.length <= 6) return `(${kept.slice(0, 3)}) ${kept.slice(3)}`;
  return `(${kept.slice(0, 3)}) ${kept.slice(3, 6)}-${kept.slice(6)}`;
}
