const config = require('../config/env');
const SqliteMetadataRepo = require('./SqliteMetadataRepo');
// const MongoMetadataRepo = require('./MongoMetadataRepo');

let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    if (config.MODE === 'presentation') {
      dbInstance = new SqliteMetadataRepo();
    } else {
      throw new Error('Cloud mode (MongoDB) repository not yet initialized. Use presentation mode.');
      // dbInstance = new MongoMetadataRepo();
    }
  }
  return dbInstance;
}

module.exports = {
  getDatabase
};
