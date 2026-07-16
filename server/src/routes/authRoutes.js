const express = require("express");
const { login } = require("../controllers/authController");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.post("/login", asyncHandler(login));

module.exports = router;
