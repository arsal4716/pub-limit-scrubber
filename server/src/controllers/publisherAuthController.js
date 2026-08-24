const Publisher = require("../models/Publisher");
const { getPublisherUsageSnapshot } = require("../services/buyerLimitService");
const { todayKey } = require("../utils/dateKey");
const {
  hashPassword,
  verifyPassword,
  signPublisherToken,
  normalizeIp,
  isIpAllowed,
} = require("../services/publisherAuthService");

const MIN_PASSWORD_LENGTH = 8;

function clientIp(req) {
  return normalizeIp(req.ip);
}

// Publisher name + email + password. If the name matches an existing
// admin-provisioned publisher that has no credentials yet, this "claims"
// it instead of erroring - the claim still lands in "pending" for admin
// review, same as a brand new name, so a reserved name can't be silently
// taken over by whoever signs up for it first. A name that already has a
// password set is a real conflict and is rejected.
async function signup(req, res) {
  const { publisherName, email, password } = req.body;

  if (!publisherName || !publisherName.trim()) {
    return res.status(400).json({ error: "Publisher name is required" });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const slug = Publisher.toSlug(publisherName);
  const emailNormalized = email.trim().toLowerCase();

  let publisher = await Publisher.findOne({ slug }).select("+passwordHash");

  if (publisher) {
    if (publisher.passwordHash) {
      return res.status(409).json({
        error: "This publisher name is already registered. Log in instead, or contact an admin.",
      });
    }
  } else {
    const emailTaken = await Publisher.findOne({ email: emailNormalized });
    if (emailTaken) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    publisher = new Publisher({ name: publisherName.trim(), dailyLimit: 0 });
  }

  publisher.email = emailNormalized;
  publisher.passwordHash = await hashPassword(password);
  publisher.signupStatus = "pending";
  await publisher.save();

  res.status(201).json({
    message: "Your signup request was submitted. An admin needs to approve it before you can log in.",
  });
}

async function login(req, res) {
  const { publisherName, password } = req.body;

  if (!publisherName || !password) {
    return res.status(400).json({ error: "Publisher name and password are required" });
  }

  const slug = Publisher.toSlug(publisherName);
  const publisher = await Publisher.findOne({ slug }).select("+passwordHash");

  // Same generic error whether the name doesn't exist, has no password
  // set yet, or the password is wrong - never reveal which case it is.
  const invalidCredentials = { error: "Invalid publisher name or password" };
  if (!publisher || !publisher.passwordHash) {
    return res.status(401).json(invalidCredentials);
  }

  const passwordOk = await verifyPassword(password, publisher.passwordHash);
  if (!passwordOk) {
    return res.status(401).json(invalidCredentials);
  }

  if (!publisher.active) {
    return res.status(403).json({ error: "This publisher account has been disabled. Contact an admin." });
  }
  if (publisher.signupStatus === "pending") {
    return res.status(403).json({ error: "Your signup request is still pending admin approval." });
  }
  if (publisher.signupStatus === "rejected") {
    return res.status(403).json({ error: "Your signup request was rejected. Contact an admin." });
  }

  if (!isIpAllowed(publisher.allowedIps, clientIp(req))) {
    return res.status(403).json({ error: "Login isn't allowed from this IP address. Contact an admin." });
  }

  const token = signPublisherToken(publisher);
  res.json({ token, name: publisher.name });
}

// The logged-in publisher's own profile + today's usage - powers the
// upload page's daily-limit banner.
async function me(req, res) {
  const snapshot = await getPublisherUsageSnapshot(req.publisher._id, todayKey());
  res.json({
    name: req.publisher.name,
    dailyLimit: snapshot.dailyLimit,
    usedToday: snapshot.usedToday,
    remainingToday: snapshot.remainingToday,
    dateKey: snapshot.dateKey,
  });
}

module.exports = { signup, login, me };
