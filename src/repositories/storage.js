const config = require('../config/env');
const LocalStorageRepo = require('./LocalStorageRepo');
// const R2StorageRepo = require('./R2StorageRepo');

let storageInstance = null;

function getStorage(workerId = 'default') {
  if (!storageInstance) {
    if (config.MODE === 'presentation') {
      storageInstance = new LocalStorageRepo(workerId);
    } else {
      throw new Error('Cloud mode (R2) repository not yet initialized. Use presentation mode.');
      // storageInstance = new R2StorageRepo();
    }
  }
  return storageInstance;
}

module.exports = {
  getStorage
};
