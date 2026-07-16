const express = require("express");
const { validatePublisher } = require("../controllers/publisherController");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// GET only, and only ever resolves the single exact name passed in - there
// is deliberately no "list all publishers" endpoint here.
router.get("/validate", asyncHandler(validatePublisher));

module.exports = router;
