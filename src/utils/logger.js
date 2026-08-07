const winston = require('winston');
const path = require('path');
const config = require('../config/env');

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

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
      filename: path.join(__dirname, '../../data/logs', `${serviceName}.log`),
      format: combine(timestamp(), json())
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../data/logs/error.log'),
      level: 'error',
      format: combine(timestamp(), json())
    })
  ];

  return winston.createLogger({
    level: config.SYSTEM.LOG_LEVEL,
    defaultMeta: { service: serviceName },
    format: errors({ stack: true }),
    transports
  });
}

// Default logger (can be overwritten or we just use createLogger)
module.exports = {
  createLogger
};
