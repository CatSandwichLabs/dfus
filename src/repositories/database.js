const config = require('../config/env');
const SqliteMetadataRepo = require('./SqliteMetadataRepo');
const MongoMetadataRepo = require('./mongodb/MongoMetadataRepo');
const dbConnection = require('./mongodb/connection');

let dbInstance = null;

async function initDatabase() {
  if (!dbInstance) {
    if (config.MODE === 'presentation') {
      dbInstance = new SqliteMetadataRepo();
    } else {
      await dbConnection.connect();
      dbInstance = new MongoMetadataRepo();
    }
  }
  return dbInstance;
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
