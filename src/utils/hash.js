const crypto = require('crypto');

/**
 * Computes a SHA-256 hash of a string.
 * @param {string} str 
 * @returns {string} Hexadecimal hash
 */
function hashString(str) {
  if (!str) return '';
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = {
  hashString
};
