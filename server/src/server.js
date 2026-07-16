const app = require("./app");
const env = require("./config/env");
const { connectDB } = require("./config/db");
const { recoverInterruptedJobs } = require("./services/scrubQueue");

async function start() {
  await connectDB();
  await recoverInterruptedJobs();

  app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
