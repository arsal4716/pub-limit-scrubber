const mongoose = require("mongoose");
const env = require("./env");

let memoryServer = null;

async function connectDB() {
  let uri = env.mongoUri;

  if (!uri) {
    if (env.nodeEnv === "production") {
      throw new Error("MONGO_URI must be set in production");
    }
    // Dev convenience: spin up an in-memory MongoDB so the app runs with zero setup.
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log("[db] MONGO_URI not set - using in-memory MongoDB for development");
  }

  await mongoose.connect(uri);
  console.log("[db] connected");
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
