const { zoneParts } = require("../utils/dateKey");
const { getOrCreateGlobalConfig } = require("./limitService");

// Operating hours, observed in US Eastern time (America/New_York, so it
// follows EST/EDT automatically). Hours are [open, close) in 24h clock.
const TIMEZONE = process.env.OPERATING_TIMEZONE || "America/New_York";
const WEEKDAY_HOURS = [9, 21]; // Mon-Fri 9:00 AM - 9:00 PM
const WEEKEND_HOURS = [9, 15]; // Sat-Sun 9:00 AM - 3:00 PM

const HOURS_TEXT =
  "Mon-Fri 9:00 AM - 9:00 PM and Sat-Sun 9:00 AM - 3:00 PM Eastern Time";

function isWithinHours(date = new Date()) {
  const { weekday, hour } = zoneParts(TIMEZONE, date);
  const [open, close] = weekday === "Sat" || weekday === "Sun" ? WEEKEND_HOURS : WEEKDAY_HOURS;
  return hour >= open && hour < close;
}

// Next moment the scrubber opens (scans in 15-minute steps).
function nextOpenAt(date = new Date()) {
  const step = 15 * 60 * 1000;
  let t = Math.ceil(date.getTime() / step) * step;
  for (let i = 0; i < 8 * 24 * 4; i++, t += step) {
    if (isWithinHours(new Date(t))) return new Date(t);
  }
  return null;
}

function formatOpenTime(date) {
  return date.toLocaleString("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

// What publishers should see right now. `open` is true only when the admin
// master switch is ON and we're inside operating hours.
async function getPortalStatus(now = new Date()) {
  const config = await getOrCreateGlobalConfig();
  if (!config.portalEnabled) {
    return {
      open: false,
      reason: "off",
      message: "This portal is temporarily down. Please check back later.",
      hours: HOURS_TEXT,
      nextOpenAt: null,
    };
  }
  if (!isWithinHours(now)) {
    const next = nextOpenAt(now);
    return {
      open: false,
      reason: "closed_hours",
      message:
        `The scrubber is closed right now. Hours: ${HOURS_TEXT}.` +
        (next ? ` It reopens ${formatOpenTime(next)} ET.` : ""),
      hours: HOURS_TEXT,
      nextOpenAt: next ? next.toISOString() : null,
    };
  }
  return { open: true, reason: null, message: null, hours: HOURS_TEXT, nextOpenAt: null };
}

module.exports = { getPortalStatus, isWithinHours, nextOpenAt, HOURS_TEXT };
