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
    // Total daily leads this publisher may scrub, split 50/50 between the
    // two buyers when processing (see buyerLimitService.getPublisherBuyerLimits).
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

    // Login credentials - not required at the schema level since a
    // publisher record can exist (admin-provisioned) before it has any
    // credentials set. No `default: null` here on purpose: leaving the
    // field entirely unset (rather than explicitly null) is what keeps
    // the sparse unique index below usable for multiple publishers with
    // no email yet.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    // Never returned by a plain find/findById - callers that need it
    // (login) must explicitly .select("+passwordHash").
    passwordHash: {
      type: String,
      select: false,
    },
    // "pending" = a self-service signup awaiting admin review, blocked
    // from logging in until approved. Publishers created directly from the
    // admin dashboard default to "approved" - an admin creating one has
    // already vetted them, unlike a public signup form.
    signupStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    // Empty = no restriction, login allowed from any IP with valid
    // credentials. Non-empty = login only allowed from one of these exact
    // client IPs (see services/publisherAuthService.isIpAllowed).
    allowedIps: {
      type: [String],
      default: [],
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
