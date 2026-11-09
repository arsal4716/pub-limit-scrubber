const express = require("express");
const { check, checkBatch } = require("../controllers/apiV1Controller");
const { requireApiKey } = require("../middleware/apiKeyAuth");
const { requirePortalOpen } = require("../middleware/portalOpen");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireApiKey);
router.use(asyncHandler(requirePortalOpen));

router.post("/check", asyncHandler(check));
router.post("/check-batch", asyncHandler(checkBatch));

module.exports = router;
