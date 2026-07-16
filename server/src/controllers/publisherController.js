const Publisher = require("../models/Publisher");

// Public: minimal list for the home page publisher picker. Deliberately
// excludes limits/usage - those are admin-only details.
async function listPublicPublishers(req, res) {
  const publishers = await Publisher.find({ active: true })
    .select("name")
    .sort({ name: 1 });
  res.json({ publishers: publishers.map((p) => ({ name: p.name })) });
}

module.exports = { listPublicPublishers };
