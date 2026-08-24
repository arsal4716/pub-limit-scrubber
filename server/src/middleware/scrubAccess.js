const jwt = require("jsonwebtoken");
const env = require("../config/env");
const Publisher = require("../models/Publisher");
const { verifyPublisherToken } = require("../services/publisherAuthService");

// Job status/download need to work for BOTH the owning publisher (its own
// jobs only) and the admin dashboard (any job, e.g. JobsTable's download
// button) - so this accepts either an admin token or a publisher token,
// setting req.isAdmin accordingly. Route handlers still need their own
// ownership check for the publisher case (req.isAdmin is false).
async function requirePublisherOrAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    const adminPayload = jwt.verify(token, env.adminJwtSecret);
    if (adminPayload.role === "admin") {
      req.isAdmin = true;
      return next();
    }
  } catch (err) {
    // Not a valid admin token - fall through and try it as a publisher token.
  }

  try {
    const payload = verifyPublisherToken(token);
    const publisher = await Publisher.findById(payload.publisherId);
    if (!publisher || !publisher.active || publisher.signupStatus !== "approved") {
      return res.status(401).json({ error: "This account is no longer active" });
    }
    req.isAdmin = false;
    req.publisher = publisher;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requirePublisherOrAdmin };
