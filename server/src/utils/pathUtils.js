'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../../../../');

let _tmpDir = null;
let _uploadsDir = null;

/**
 * Resolve a directory path. Absolute paths are used as-is.
 * Relative paths are resolved against the project root.
 */
function resolveDir(value) {
  if (path.isAbsolute(value)) return value;
  return path.join(ROOT_DIR, value);
}

/**
 * Initialize directories from env config.
 * Must be called once at application startup before getChunkPath / getFinalPath.
 *
 * @param {{ tmpDir: string, uploadsDir: string }} cfg
 */
function init(cfg) {
  _tmpDir = resolveDir(cfg.tmpDir || 'tmp');
  _uploadsDir = resolveDir(cfg.uploadsDir || 'uploads');
  ensureDirectories();
}

function ensureDirectories() {
  for (const dir of [_tmpDir, _uploadsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Return the configured tmp directory (for tests).
 * @returns {string|null}
 */
function getTmpDir() {
  return _tmpDir;
}

/**
 * Return the configured uploads directory (for tests).
 * @returns {string|null}
 */
function getUploadsDir() {
  return _uploadsDir;
}

/**
 * Generate a safe, unpredictable path for a temporary chunk file.
 * Uses crypto.randomUUID() exclusively - no user-supplied data touches the path.
 *
 * @returns {string} Absolute path.
 */
function getChunkPath() {
  if (!_tmpDir) throw new Error('pathUtils.init() has not been called');
  return path.join(_tmpDir, crypto.randomUUID());
}

/**
 * Generate a safe path for a final merged file.
 * User filename is sanitized: only alphanumeric, underscore, and dash characters
 * are retained; a UUID prefix guarantees no collisions.
 *
 * @param {string} userFileName - Original filename from the client.
 * @returns {string} Absolute path.
 */
function getFinalPath(userFileName) {
  if (!_uploadsDir) throw new Error('pathUtils.init() has not been called');
  const rawExt = path.extname(userFileName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
  const rawBase = path.basename(userFileName, path.extname(userFileName))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  return path.join(_uploadsDir, `${crypto.randomUUID()}_${rawBase}${rawExt}`);
}

/**
 * Delete a file, silently ignoring ENOENT (already deleted).
 *
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function safeDelete(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { init, getTmpDir, getUploadsDir, getChunkPath, getFinalPath, safeDelete };
