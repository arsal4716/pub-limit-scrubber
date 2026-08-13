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

  // Mongoose's default autoIndex only ever CREATES indexes missing from a
  // schema - it never drops indexes that a schema change removed or
  // replaced. Without this, a change like BuyerUsage's unique index moving
  // from {dateKey, buyerKey} to {dateKey, buyerKey, publisherId} leaves the
  // OLD index active in the live database, silently rejecting valid writes
  // (e.g. a second publisher's usage doc for the same buyer/day collides
  // with the first publisher's under the stale constraint) until it's
  // synced away. Models are registered by the time this runs since
  // `require("./app")` in server.js pulls in every route/controller/model
  // before connectDB() is called.
  for (const modelName of mongoose.modelNames()) {
    await mongoose.model(modelName).syncIndexes();
  }
  console.log("[db] indexes synced");
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
