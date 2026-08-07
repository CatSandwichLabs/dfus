const config = require('../config/env');

let dbInstance = null;
let initPromise = null;

async function initDatabase() {
  // Re-use existing promise to prevent double-initialization in serverless cold starts
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!dbInstance) {
      if (config.MODE === 'presentation') {
        // SQLite mode - only for local development, not serverless
        try {
          const SqliteMetadataRepo = require('./SqliteMetadataRepo');
          dbInstance = new SqliteMetadataRepo();
        } catch (err) {
          // SQLite native module may not be available (e.g., on Vercel)
          // Fall back to MongoDB if MONGODB_URI is available
          if (config.MONGO.URI) {
            const dbConnection = require('./mongodb/connection');
            const MongoMetadataRepo = require('./mongodb/MongoMetadataRepo');
            await dbConnection.connect();
            dbInstance = new MongoMetadataRepo();
          } else {
            throw new Error('Neither SQLite nor MongoDB is available. Set MONGODB_URI or install better-sqlite3.');
          }
        }
      } else {
        const dbConnection = require('./mongodb/connection');
        const MongoMetadataRepo = require('./mongodb/MongoMetadataRepo');
        await dbConnection.connect();
        dbInstance = new MongoMetadataRepo();
      }
    }
    return dbInstance;
  })();

  return initPromise;
}

function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() on startup.');
  }
  return dbInstance;
}

module.exports = {
  initDatabase,
  getDatabase
};
