const jwt = require("jsonwebtoken");
const env = require("../config/env");

// Single-admin-account auth (credentials from env vars) - no user management
// UI is needed for this internal tool; swap for a real user store later if
// multiple admins are required.
async function login(req, res) {
  const { username, password } = req.body;

  if (username !== env.adminUsername || password !== env.adminPassword) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign({ role: "admin", username }, env.adminJwtSecret, {
    expiresIn: env.adminJwtExpiresIn,
  });

  res.json({ token, username });
}

module.exports = { login };
