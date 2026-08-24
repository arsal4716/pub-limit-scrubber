const express = require("express");
const { signup, login, me } = require("../controllers/publisherAuthController");
const { requirePublisher } = require("../middleware/publisherAuth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.post("/signup", asyncHandler(signup));
router.post("/login", asyncHandler(login));
router.get("/me", requirePublisher, asyncHandler(me));

module.exports = router;
