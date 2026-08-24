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

  // Publisher login (separate account per publisher - signup, admin
  // approval, optional per-publisher IP allowlist). Uses its own JWT
  // secret so a leaked/expired publisher token can never be mistaken for
  // an admin token or vice versa.
  publisherJwtSecret: process.env.PUBLISHER_JWT_SECRET || "dev-only-insecure-publisher-secret",
  publisherJwtExpiresIn: process.env.PUBLISHER_JWT_EXPIRES_IN || "12h",

  // Whether to trust the X-Forwarded-For header for the client's real IP
  // (needed for per-publisher IP allowlisting to work at all when the app
  // sits behind a reverse proxy/load balancer). Only set this to true when
  // there actually IS a trusted proxy in front of the app - otherwise a
  // client can forge X-Forwarded-For and bypass the IP allowlist entirely.
  trustProxy: process.env.TRUST_PROXY !== "false",

  // LM (ACA) - callgrid. Falls back to the legacy BUYER_API_URL (with any
  // trailing "?CallerId=" stripped) so existing deployments keep working
  // until their .env is updated to the LM_* names.
  lmBuyerApiUrl:
    process.env.LM_BUYER_API_URL ||
    (process.env.BUYER_API_URL || "").replace(/[?&]CallerId=$/i, "") ||
    "https://bid.callgrid.com/api/bid/cmn6507vj00vz06juii3memo2",
  lmBuyerApiTimeoutMs: toInt(
    process.env.LM_BUYER_API_TIMEOUT_MS || process.env.BUYER_API_TIMEOUT_MS,
    10000
  ),

  // HC (ACA) - NextGen Insurance Solutions. Requires a per-lead state code
  // (read from the CSV's state column - see phoneUtils.extractStateFromRow)
  // and an API key sent as the `x-vendor-api-key` header - without it every
  // call fails with 401 Unauthorized.
  hcBuyerApiUrl:
    process.env.HC_BUYER_API_URL || "https://api.nextgeninsurancesolutionsinc.com/vendor-availability",
  hcBuyerApiTimeoutMs: toInt(process.env.HC_BUYER_API_TIMEOUT_MS, 5000),
  hcVendorApiKey: process.env.HC_VENDOR_API_KEY || "",

  // Our own internal DNC/duplicate check - every unique phone goes through
  // this FIRST, before either buyer. It's not a third-party API with a
  // quota, so it's never rate-limited - only `internalDncConcurrency` caps
  // how many requests are in flight at once. Phones it flags as a
  // duplicate are marked DNC and never sent to LM or HC at all.
  internalDncApiUrl: process.env.INTERNAL_DNC_API_URL || "http://91.108.112.198:3000/check-number",
  internalDncApiTimeoutMs: toInt(process.env.INTERNAL_DNC_API_TIMEOUT_MS, 5000),
  internalDncConcurrency: toInt(process.env.INTERNAL_DNC_CONCURRENCY, 100),

  // Batch size used when the admin "rate limit mode" toggle is ON. LM and
  // HC each run their own independent, concurrently-running loop over
  // their half of the unique phone list, sending this many requests per
  // batch; the delay between batches is computed from the admin-editable
  // target rate (GlobalConfig.rateLimitPerMinute, default 1000/min per
  // buyer) rather than being fixed here - see buyerApiClient.js.
  buyerApiConcurrency: toInt(process.env.BUYER_API_CONCURRENCY, 20),

  // Used when rate limit mode is OFF: a much larger batch size and no
  // delay between batches - phones are scrubbed as fast as the buyer APIs
  // and network allow rather than at a fixed pace.
  fastModeConcurrency: toInt(process.env.FAST_MODE_CONCURRENCY, 200),

  // Seed value for the global capacity ceiling (applied on first boot
  // only, then only editable from the admin dashboard).
  defaultTotalDailyLimit: toInt(process.env.DEFAULT_TOTAL_DAILY_LIMIT, 1000000),
  limitResetTimezone: process.env.LIMIT_RESET_TIMEZONE || "America/New_York",
};
