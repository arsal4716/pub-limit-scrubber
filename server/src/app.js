const path = require("path");
const express = require("express");

const env = require("./config/env");
const authRoutes = require("./routes/authRoutes");
const publisherAuthRoutes = require("./routes/publisherAuthRoutes");
const scrubRoutes = require("./routes/scrubRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Needed so req.ip reflects the real client IP (via X-Forwarded-For) when
// running behind a reverse proxy/load balancer - otherwise every request
// looks like it comes from the proxy, and per-publisher IP allowlisting
// can never work. See env.trustProxy for the security tradeoff.
app.set("trust proxy", env.trustProxy ? 1 : false);

app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/publisher-auth", publisherAuthRoutes);
app.use("/api/scrub", scrubRoutes);
app.use("/api/admin", adminRoutes);

// Serve the built React app (server/client/dist) and everything else on the
// same port - the client and API are same-origin in production, so no CORS
// is needed. In development the Vite dev server proxies /api here instead
// (see client/vite.config.js), so this static middleware is simply unused
// until `npm run build` has produced client/dist.
const clientDistPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDistPath));

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
