const admin = require('firebase-admin');
const config = require('./env');
const { createLogger } = require('../utils/logger');

const logger = createLogger('firebase-admin');

// We use Application Default Credentials or just project ID if no service account is strictly needed for simple token verification.
// For production, you'd load a serviceAccountKey.json, but token verification often only needs the project ID.

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: config.FIREBASE.PROJECT_ID || 'demo-dfus-project'
    });
    logger.info('Firebase Admin SDK initialized successfully');
  }
} catch (err) {
  logger.error(`Firebase Admin SDK initialization failed: ${err.message}`);
}

module.exports = admin;
