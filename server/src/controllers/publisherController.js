const Publisher = require("../models/Publisher");
const { getUsageSnapshot } = require("../services/limitService");
const { todayKey } = require("../utils/dateKey");

// Validates a single, exact publisher name - never lists publishers, so it
// can't be used to enumerate who else is a publisher. Used to gate the
// "continue to upload" step and to show the publisher their own daily
// limit before they pick a file.
async function validatePublisher(req, res) {
  const name = (req.query.name || "").trim();
  if (!name) {
    return res.status(400).json({ valid: false, error: "Publisher name is required" });
  }

  const publisher = await Publisher.findOne({ slug: Publisher.toSlug(name), active: true });
  if (!publisher) {
    return res.status(404).json({
      valid: false,
      error: `"${name}" is not a recognized publisher. Please contact an admin to get set up.`,
    });
  }

  const snapshot = await getUsageSnapshot(publisher._id, todayKey());

  res.json({
    valid: true,
    name: publisher.name,
    dailyLimit: snapshot.publisherDailyLimit,
    usedToday: snapshot.publisherUsed,
    remainingToday: snapshot.publisherRemaining,
    dateKey: snapshot.dateKey,
  });
}

module.exports = { validatePublisher };
