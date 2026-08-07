const mongoose = require('mongoose');
const config = require('../../config/env');
const { createLogger } = require('../../utils/logger');
const logger = createLogger('database');

/**
 * MongoDB Atlas Connection with Exponential Backoff Retry
 */
class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    // Fail fast on Vercel so we get a JSON error instead of a 10s timeout crash
    this.isServerless = process.env.VERCEL === '1';
    this.retryCount = 0;
    this.maxRetries = this.isServerless ? 0 : 5;
    this.baseDelayMs = this.isServerless ? 500 : 1000;
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    if (!config.MONGO.URI) {
      throw new Error('MONGODB_URI is not defined in environment variables.');
    }

    mongoose.set('bufferCommands', false);

    mongoose.connection.on('connected', () => {
      logger.info('Successfully connected to MongoDB Atlas.');
      this.isConnected = true;
      this.retryCount = 0;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Disconnected from MongoDB Atlas.');
      this.isConnected = false;
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
      this.isConnected = false;
    });

    await this.connectWithRetry();
  }

  async connectWithRetry() {
    if (this.retryCount === 0 && this.maxRetries === 0) {
      logger.info('Attempting to connect to MongoDB...');
      await mongoose.connect(config.MONGO.URI, {
        serverSelectionTimeoutMS: this.isServerless ? 3000 : 5000,
        bufferCommands: false,
      });
      return;
    }

    while (this.retryCount < this.maxRetries) {
      try {
        logger.info(`Attempting to connect to MongoDB (Attempt ${this.retryCount + 1}/${this.maxRetries})...`);
        await mongoose.connect(config.MONGO.URI, {
          serverSelectionTimeoutMS: this.isServerless ? 3000 : 5000,
          bufferCommands: false, // Fail fast instead of buffering indefinitely
        });
        return; // Success
      } catch (err) {
        this.retryCount++;
        if (this.retryCount >= this.maxRetries) {
          logger.error(`Failed to connect to MongoDB after ${this.maxRetries} attempts.`);
          throw err;
        }

        const delay = this.baseDelayMs * Math.pow(2, this.retryCount - 1);
        logger.warn(`MongoDB connection failed. Retrying in ${delay}ms...`, { error: err.message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async disconnect() {
    if (!this.isConnected) return;
    await mongoose.disconnect();
    this.isConnected = false;
    logger.info('Disconnected from MongoDB Atlas gracefully.');
  }
}

module.exports = new DatabaseConnection();
