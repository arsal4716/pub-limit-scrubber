const express = require("express");
const {
  uploadFile,
  getStatus,
  downloadOutput,
  listJobsForPublisher,
  getUploadRequirements,
} = require("../controllers/scrubController");
const { upload } = require("../middleware/upload");
const { requirePublisher } = require("../middleware/publisherAuth");
const { requirePublisherOrAdmin } = require("../middleware/scrubAccess");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// Static header-name lists only - no publisher-specific data, safe to leave
// public so the login/signup pages can't be a prerequisite for it.
router.get("/upload-requirements", getUploadRequirements);

// Auth runs before multer so an unauthenticated request never gets its
// file written to disk in the first place.
router.post("/upload", requirePublisher, upload.single("file"), asyncHandler(uploadFile));

// Both the owning publisher and the admin dashboard need these (e.g.
// JobsTable's download button), so they accept either token type - the
// controller enforces per-publisher ownership for non-admin callers.
router.get("/status/:jobId", requirePublisherOrAdmin, asyncHandler(getStatus));
router.get("/download/:jobId", requirePublisherOrAdmin, asyncHandler(downloadOutput));

router.get("/jobs", requirePublisher, asyncHandler(listJobsForPublisher));

module.exports = router;
