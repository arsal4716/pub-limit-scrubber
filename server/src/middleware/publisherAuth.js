const Publisher = require("../models/Publisher");
const { verifyPublisherToken } = require("../services/publisherAuthService");

// Requires a valid publisher JWT. Re-checks the publisher's current
// active/signupStatus in the DB on every request (not just at login), so
// an admin disabling or un-approving a publisher mid-session revokes
// access immediately instead of waiting for the token to expire.
async function requirePublisher(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  let payload;
  try {
    payload = verifyPublisherToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const publisher = await Publisher.findById(payload.publisherId);
  if (!publisher || !publisher.active || publisher.signupStatus !== "approved") {
    return res.status(401).json({ error: "This account is no longer active" });
  }

  req.publisher = publisher;
  next();
}

module.exports = { requirePublisher };
