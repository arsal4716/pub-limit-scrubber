const mongoose = require("mongoose");

const publisherSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    // Case/whitespace-insensitive lookup key, kept in sync with `name`.
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    dailyLimit: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

function toSlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

publisherSchema.statics.toSlug = toSlug;

publisherSchema.pre("validate", function preValidate(next) {
  if (this.name) {
    this.slug = toSlug(this.name);
  }
  next();
});

module.exports = mongoose.model("Publisher", publisherSchema);
