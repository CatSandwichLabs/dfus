'use strict';

module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'server/src/**/*.js',
    '!server/src/config/db.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
