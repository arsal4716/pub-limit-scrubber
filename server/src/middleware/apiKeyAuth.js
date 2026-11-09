const crypto = require("crypto");
const Publisher = require("../models/Publisher");
const { isIpAllowed } = require("../services/publisherAuthService");

function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateApiKey() {
  return `pk_${crypto.randomBytes(24).toString("hex")}`;
}

// Per-publisher request cap (fixed one-minute window, in memory).
const MAX_REQUESTS_PER_MINUTE = 600;
const windows = new Map();

function overRateLimit(publisherId) {
  const minute = Math.floor(Date.now() / 60000);
  const entry = windows.get(publisherId);
  if (!entry || entry.minute !== minute) {
    windows.set(publisherId, { minute, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_MINUTE;
}

// Authenticates a publisher by API key (x-api-key header, or
// "Authorization: Bearer <key>"). Re-checks active/approved status and the
// publisher's IP allowlist on every request.
async function requireApiKey(req, res, next) {
  const header = req.headers.authorization || "";
  const key = req.headers["x-api-key"] || (header.startsWith("Bearer ") ? header.slice(7) : null);
  if (!key) return res.status(401).json({ error: "Missing API key" });

  const publisher = await Publisher.findOne({ apiKeyHash: hashApiKey(String(key)) });
  if (!publisher || !publisher.active || publisher.signupStatus !== "approved") {
    return res.status(401).json({ error: "Invalid API key" });
  }
  if (!isIpAllowed(publisher.allowedIps, req.ip)) {
    return res.status(403).json({ error: "Requests aren't allowed from this IP address" });
  }
  if (overRateLimit(String(publisher._id))) {
    return res.status(429).json({ error: "Rate limit exceeded (600 requests/minute)" });
  }
  req.publisher = publisher;
  next();
}

module.exports = { requireApiKey, hashApiKey, generateApiKey };
