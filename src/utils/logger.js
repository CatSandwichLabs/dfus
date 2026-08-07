const winston = require('winston');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const config = require('../config/env');

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Ensure log directory exists on startup
const logsDir = path.join(__dirname, '../../data/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console
const consoleFormat = printf(({ level, message, timestamp, service, stack, ...meta }) => {
  let log = `${timestamp} [${service}] ${level}: ${message}`;
  if (Object.keys(meta).length) {
    log += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

/**
 * Create a logger for a specific service (master or worker-N)
 * @param {string} serviceName 
 */
function createLogger(serviceName) {
  const transports = [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      )
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, `${serviceName}.log`),
      format: combine(timestamp(), json())
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      level: 'info',
      format: combine(timestamp(), json())
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: combine(timestamp(), json())
    })
  ];

  return winston.createLogger({
    level: config.SYSTEM.LOG_LEVEL || 'info',
    defaultMeta: { service: serviceName },
    format: errors({ stack: true }),
    transports
  });
}

/**
 * Create HTTP request logging middleware bound to Winston logger
 * @param {winston.Logger} logger 
 */
function createHttpLogger(logger) {
  return morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  });
}

module.exports = {
  createLogger,
  createHttpLogger
};
