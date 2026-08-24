const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

const SALT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function verifyPassword(password, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}

function signPublisherToken(publisher) {
  return jwt.sign(
    { role: "publisher", publisherId: String(publisher._id), slug: publisher.slug },
    env.publisherJwtSecret,
    { expiresIn: env.publisherJwtExpiresIn }
  );
}

function verifyPublisherToken(token) {
  const payload = jwt.verify(token, env.publisherJwtSecret);
  if (payload.role !== "publisher") throw new Error("Invalid token role");
  return payload;
}

// Express's req.ip can come back as an IPv4-mapped IPv6 address
// ("::ffff:203.0.113.5") depending on how Node's net layer sees the
// connection - normalize both sides so an admin-entered plain IPv4
// address still matches.
function normalizeIp(ip) {
  return (ip || "").replace(/^::ffff:/, "");
}

// Empty allowlist = no restriction, any IP is fine with valid credentials.
// Non-empty = the client's IP must be an exact match for one of the
// configured entries.
function isIpAllowed(allowedIps, clientIp) {
  if (!allowedIps || allowedIps.length === 0) return true;
  const normalizedClientIp = normalizeIp(clientIp);
  return allowedIps.some((ip) => normalizeIp(ip) === normalizedClientIp);
}

module.exports = {
  hashPassword,
  verifyPassword,
  signPublisherToken,
  verifyPublisherToken,
  normalizeIp,
  isIpAllowed,
};
