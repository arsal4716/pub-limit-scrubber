const path = require("path");

// Load server/.env explicitly by path rather than relying on process.cwd() -
// otherwise starting the server from a different working directory (e.g.
// `node server/src/server.js` from the repo root) silently fails to find
// it, MONGO_URI comes back empty, and the app falls back to an in-memory
// MongoDB with no error at all.
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  port: toInt(process.env.PORT, 6003),
  nodeEnv: process.env.NODE_ENV || "development",

  mongoUri: process.env.MONGO_URI || "",

  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "change-me-now",
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || "dev-only-insecure-secret",
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "12h",

  buyerApiUrl:
    process.env.BUYER_API_URL ||
    "https://bid.callgrid.com/api/bid/cmn6507vj00vz06juii3memo2?CallerId=",
  buyerApiTimeoutMs: toInt(process.env.BUYER_API_TIMEOUT_MS, 10000),
  buyerApiConcurrency: toInt(process.env.BUYER_API_CONCURRENCY, 20),
  buyerApiBatchDelayMs: toInt(process.env.BUYER_API_BATCH_DELAY_MS, 1200),

  defaultTotalDailyLimit: toInt(process.env.DEFAULT_TOTAL_DAILY_LIMIT, 100000),
  limitResetTimezone: process.env.LIMIT_RESET_TIMEZONE || "America/New_York",
};
