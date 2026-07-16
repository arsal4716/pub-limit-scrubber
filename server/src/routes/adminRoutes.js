const express = require("express");
const {
  getConfig,
  updateConfig,
  listPublishers,
  createPublisher,
  updatePublisher,
  listJobs,
} = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAdmin);

router.get("/config", asyncHandler(getConfig));
router.put("/config", asyncHandler(updateConfig));

router.get("/publishers", asyncHandler(listPublishers));
router.post("/publishers", asyncHandler(createPublisher));
router.put("/publishers/:id", asyncHandler(updatePublisher));

router.get("/jobs", asyncHandler(listJobs));

module.exports = router;
