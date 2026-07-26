'use strict';

require('dotenv').config({ override: false });

/*
 * Lazy getters read from process.env at access time, not at module load time.
 * This allows tests to set process.env.MONGODB_URI before requiring this module
 * and the value will be picked up correctly regardless of module caching.
 */
const config = {
  get port() {
    return parseInt(process.env.PORT || '3000', 10);
  },
  get mongodbUri() {
    return process.env.MONGODB_URI || '';
  },
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  get maxChunkSizeBytes() {
    return parseInt(process.env.MAX_CHUNK_SIZE_BYTES || String(6 * 1024 * 1024), 10);
  },
  get uploadsDir() {
    return process.env.UPLOADS_DIR || 'uploads';
  },
  get tmpDir() {
    return process.env.TMP_DIR || 'tmp';
  },
};

function validateForProduction() {
  if (config.nodeEnv === 'test') return;
  if (!config.mongodbUri) {
    process.stderr.write('FATAL: MONGODB_URI environment variable is not set.\n');
    process.exit(1);
  }
}

module.exports = { config, validateForProduction };
