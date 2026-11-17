const express = require("express");
const { requireCheckLink } = require("../middleware/checkLinkAuth");
const { requirePortalOpen } = require("../middleware/portalOpen");
const { checkAndRecord } = require("../services/realtimeCheckService");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// Confirms a public check link is valid (no publisher details returned).
router.get("/c/:token", asyncHandler(requireCheckLink), (req, res) => res.json({ ok: true }));

// POST /api/public/c/:token/check  { "phone": "5551234567", "state": "OH" (optional) }
router.post(
  "/c/:token/check",
  asyncHandler(requireCheckLink),
  asyncHandler(requirePortalOpen),
  asyncHandler(async (req, res) => {
    const { phone, state } = req.body || {};
    if (!phone) return res.status(400).json({ error: "Please enter a phone number." });
    const result = await checkAndRecord(req.publisher, phone, state, "link");
    // Public response: no buyer names, no internals.
    res.json({
      phone: result.phone,
      status: result.status,
      isDuplicate: result.status === "blocked" || result.status === "dnc",
      reason: result.reason,
    });
  })
);

module.exports = router;
