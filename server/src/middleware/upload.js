const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobDir = path.join(UPLOADS_ROOT, crypto.randomUUID());
    fs.mkdirSync(jobDir, { recursive: true });
    req.jobDir = jobDir;
    cb(null, jobDir);
  },
  filename: (req, file, cb) => cb(null, "input.csv"),
});

function fileFilter(req, file, cb) {
  const isCsv =
    file.mimetype === "text/csv" ||
    file.mimetype === "application/vnd.ms-excel" ||
    path.extname(file.originalname).toLowerCase() === ".csv";
  if (!isCsv) {
    return cb(new Error("Only CSV files are supported"));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB - files can have millions of rows
});

module.exports = { upload, UPLOADS_ROOT };
