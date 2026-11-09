const express = require("express");
const {
  getConfig,
  updateConfig,
  updateRateLimit,
  listPublishers,
  createPublisher,
  updatePublisher,
  listJobs,
  deleteJob,
  createApiKey,
  revokeApiKey,
} = require("../controllers/adminController");
const { uploadRun, listRuns, downloadRun, deleteRun } = require("../controllers/frequentController");
const { upload } = require("../middleware/upload");
const { requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAdmin);

router.get("/config", asyncHandler(getConfig));
router.put("/config", asyncHandler(updateConfig));
router.put("/rate-limit", asyncHandler(updateRateLimit));

router.get("/publishers", asyncHandler(listPublishers));
router.post("/publishers", asyncHandler(createPublisher));
router.put("/publishers/:id", asyncHandler(updatePublisher));

router.post("/publishers/:id/api-key", asyncHandler(createApiKey));
router.delete("/publishers/:id/api-key", asyncHandler(revokeApiKey));

router.get("/jobs", asyncHandler(listJobs));
router.delete("/jobs/:id", asyncHandler(deleteJob));

router.get("/frequent/runs", asyncHandler(listRuns));
router.post("/frequent/upload", upload.single("file"), asyncHandler(uploadRun));
router.get("/frequent/runs/:id/download/:kind", asyncHandler(downloadRun));
router.delete("/frequent/runs/:id", asyncHandler(deleteRun));

module.exports = router;
