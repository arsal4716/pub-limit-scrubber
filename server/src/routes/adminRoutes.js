const express = require("express");
const {
  getConfig,
  updateConfig,
  getBuyerConfig,
  updateBuyerConfig,
  listPublishers,
  createPublisher,
  updatePublisher,
  listJobs,
  deleteJob,
} = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAdmin);

router.get("/config", asyncHandler(getConfig));
router.put("/config", asyncHandler(updateConfig));

router.get("/buyer-config", asyncHandler(getBuyerConfig));
router.put("/buyer-config", asyncHandler(updateBuyerConfig));

router.get("/publishers", asyncHandler(listPublishers));
router.post("/publishers", asyncHandler(createPublisher));
router.put("/publishers/:id", asyncHandler(updatePublisher));

router.get("/jobs", asyncHandler(listJobs));
router.delete("/jobs/:id", asyncHandler(deleteJob));

module.exports = router;
