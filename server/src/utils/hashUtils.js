'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * Compute the SHA-256 hash of a file by streaming it.
 * Never loads the entire file into memory.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} Lowercase hex SHA-256 digest.
 */
function computeSHA256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const readStream = fs.createReadStream(filePath);

    readStream.on('error', reject);
    readStream.on('data', (chunk) => hash.update(chunk));
    readStream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Compute SHA-256 of a Buffer synchronously.
 *
 * @param {Buffer} buffer
 * @returns {string} Lowercase hex digest.
 */
function computeSHA256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { computeSHA256File, computeSHA256Buffer };
