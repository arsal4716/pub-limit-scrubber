const app = require("./app");
const env = require("./config/env");
const { connectDB } = require("./config/db");
const { recoverInterruptedJobs } = require("./services/scrubQueue");
const { failInterruptedRuns } = require("./services/frequentService");

async function start() {
  await connectDB();
  await recoverInterruptedJobs();
  await failInterruptedRuns();

  app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
