const fs = require("fs");

const CANDIDATES = [",", ";", "\t"];
const SNIFF_BYTES = 8192;

// Publisher files show up with different delimiters (comma is most common,
// but semicolon-delimited exports are common too). Sniff the header line
// rather than hardcoding one, so both work without configuration.
async function detectDelimiter(filePath) {
  const buffer = Buffer.alloc(SNIFF_BYTES);
  const fd = await fs.promises.open(filePath, "r");
  let bytesRead = 0;
  try {
    ({ bytesRead } = await fd.read(buffer, 0, SNIFF_BYTES, 0));
  } finally {
    await fd.close();
  }

  const chunk = buffer.toString("utf8", 0, bytesRead);
  const newlineIndex = chunk.indexOf("\n");
  const headerLine = (newlineIndex === -1 ? chunk : chunk.slice(0, newlineIndex)).replace(
    /\r$/,
    ""
  );

  let best = ",";
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

module.exports = { detectDelimiter };
