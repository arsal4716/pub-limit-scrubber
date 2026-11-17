const Publisher = require("../models/Publisher");

// Public pages have no login, so abuse protection is by token and by IP
// (fixed one-minute windows, in memory).
const PER_TOKEN_PER_MINUTE = 300;
const PER_IP_PER_MINUTE = 60;
const windows = new Map();

function over(key, limit) {
  const minute = Math.floor(Date.now() / 60000);
  const entry = windows.get(key);
  if (!entry || entry.minute !== minute) {
    windows.set(key, { minute, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

setInterval(() => {
  const minute = Math.floor(Date.now() / 60000);
  for (const [key, entry] of windows) if (entry.minute < minute) windows.delete(key);
}, 5 * 60 * 1000).unref();

// Resolves the publisher behind a public check link. An unknown token and a
// disabled publisher give the same generic 404, so nothing is revealed.
async function requireCheckLink(req, res, next) {
  const token = String(req.params.token || "");
  const publisher = token.length >= 16 ? await Publisher.findOne({ checkLinkToken: token }) : null;
  if (!publisher || !publisher.active || publisher.signupStatus !== "approved") {
    return res.status(404).json({ error: "This link isn't valid." });
  }
  if (over(`t:${token}`, PER_TOKEN_PER_MINUTE) || over(`ip:${req.ip}`, PER_IP_PER_MINUTE)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }
  req.publisher = publisher;
  next();
}

module.exports = { requireCheckLink };
