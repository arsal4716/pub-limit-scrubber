const express = require("express");
const {
  uploadFile,
  getStatus,
  downloadOutput,
  listJobsForPublisher,
} = require("../controllers/scrubController");
const { upload } = require("../middleware/upload");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.post("/upload", upload.single("file"), asyncHandler(uploadFile));
router.get("/status/:jobId", asyncHandler(getStatus));
router.get("/download/:jobId", asyncHandler(downloadOutput));
router.get("/jobs", asyncHandler(listJobsForPublisher));

module.exports = router;
