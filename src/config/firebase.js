const { initializeApp, getApps } = require('firebase-admin/app');
const config = require('./env');
const { createLogger } = require('../utils/logger');

const logger = createLogger('firebase-admin');

// We use Application Default Credentials or just project ID if no service account is strictly needed for simple token verification.
// For production, you'd load a serviceAccountKey.json, but token verification often only needs the project ID.

try {
  if (getApps().length === 0) {
    initializeApp({
      projectId: config.FIREBASE.PROJECT_ID || 'dfs-system-3d4ba'
    });
    logger.info('Firebase Admin SDK initialized successfully');
  }
} catch (err) {
  logger.error(`Firebase Admin SDK initialization failed: ${err.message}`);
}

module.exports = { getApps };
