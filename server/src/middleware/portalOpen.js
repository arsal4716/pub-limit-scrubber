const { getPortalStatus } = require("../services/operatingHours");

// Blocks new work (uploads, API checks) while the portal is switched off or
// outside operating hours, with a message publishers can show as-is.
async function requirePortalOpen(req, res, next) {
  const status = await getPortalStatus();
  if (status.open) return next();
  res.status(503).json({ error: status.message, code: status.reason, nextOpenAt: status.nextOpenAt });
}

module.exports = { requirePortalOpen };
