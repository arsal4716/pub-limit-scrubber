const path = require("path");
const express = require("express");

const authRoutes = require("./routes/authRoutes");
const publisherRoutes = require("./routes/publisherRoutes");
const scrubRoutes = require("./routes/scrubRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/publishers", publisherRoutes);
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
