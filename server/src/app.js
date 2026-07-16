const express = require("express");
const cors = require("cors");
const env = require("./config/env");

const authRoutes = require("./routes/authRoutes");
const publisherRoutes = require("./routes/publisherRoutes");
const scrubRoutes = require("./routes/scrubRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/publishers", publisherRoutes);
app.use("/api/scrub", scrubRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
