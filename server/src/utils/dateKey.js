const env = require("../config/env");

// Returns the calendar date (YYYY-MM-DD) for `date` as observed in the
// configured reset timezone (default America/New_York). Used to key daily
// quota usage so limits naturally reset when the date rolls over in that zone.
function todayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.limitResetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

module.exports = { todayKey };
