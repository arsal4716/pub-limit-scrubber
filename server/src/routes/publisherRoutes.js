const express = require("express");
const { listPublicPublishers } = require("../controllers/publisherController");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.get("/", asyncHandler(listPublicPublishers));

module.exports = router;
