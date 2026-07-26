'use strict';

const mongoose = require('mongoose');
const { config } = require('./env');

mongoose.connection.on('disconnected', () => {
  if (config.nodeEnv !== 'test') {
    process.stderr.write('[DB] MongoDB disconnected\n');
  }
});

mongoose.connection.on('error', (err) => {
  process.stderr.write(`[DB] MongoDB connection error: ${err.message}\n`);
});

async function connectDB(uri) {
  const connectionString = uri || config.mongodbUri;
  if (!connectionString) {
    throw new Error('No MongoDB URI provided');
  }
  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  if (config.nodeEnv !== 'test') {
    process.stdout.write('[DB] MongoDB connected\n');
  }
}

async function closeDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, closeDB, mongoose };
