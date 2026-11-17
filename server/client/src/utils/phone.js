// Mirrors the server's normalizePhone: any US format -> 10 digits, or null.
export function normalizePhone(phone) {
  if (!phone) return null;
  const withoutExtension = String(phone).replace(/\s*(ext\.?|extension|x)\s*\d+\s*$/i, "");
  let digits = withoutExtension.replace(/\D/g, "");
  digits = digits.replace(/^(011|00)(?=1\d{10}$)/, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.substring(1);
  return digits.length === 10 ? digits : null;
}
