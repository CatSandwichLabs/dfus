require('dotenv').config();

const env = process.env;

// Required variables helper
const required = [];

if (env.NODE_ENV !== 'test') {
  // In serverless mode, worker secret is optional since workers connect directly
  if (env.VERCEL !== '1') {
    required.push('WORKER_SECRET');
  }
  required.push('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET');
  if (env.MODE === 'cloud') {
    required.push('MONGODB_URI', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID');
  }
}

for (const req of required) {
  if (!env[req]) {
    console.error(`[Fatal] Missing required environment variable: ${req}`);
    process.exit(1);
  }
}

if (env.NODE_ENV !== 'test') {
  if (env.JWT_ACCESS_SECRET.length < 32) {
    console.error('[Fatal] JWT_ACCESS_SECRET must be at least 32 characters long.');
    process.exit(1);
  }
  if (env.JWT_REFRESH_SECRET.length < 32) {
    console.error('[Fatal] JWT_REFRESH_SECRET must be at least 32 characters long.');
    process.exit(1);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    console.error('[Fatal] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
    process.exit(1);
  }
}

// Validation Helpers
function parsePositiveInt(val, fallback, min = 1, max = Infinity, name = '') {
  if (val === undefined || val === null || val === '') return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    console.warn(`[Config Warning] Invalid ${name}: "${val}". Falling back to ${fallback}.`);
    return fallback;
  }
  return parsed;
}

function parseEnum(val, fallback, allowedValues, name = '') {
  if (!val) return fallback;
  if (!allowedValues.includes(val)) {
    console.warn(`[Config Warning] Invalid ${name}: "${val}". Allowed values: [${allowedValues.join(', ')}]. Falling back to ${fallback}.`);
    return fallback;
  }
  return val;
}

function parseArray(val, fallback) {
  if (!val) return fallback;
  if (Array.isArray(val)) return val;
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  NODE_ENV: parseEnum(env.NODE_ENV, 'development', ['development', 'production', 'test'], 'NODE_ENV'),
  MODE: parseEnum(env.MODE, 'presentation', ['presentation', 'cloud'], 'MODE'),
  
  MASTER: {
    HOST: env.MASTER_HOST || 'localhost',
    PORT: parsePositiveInt(env.MASTER_PORT, 3000, 1, 65535, 'MASTER_PORT'),
  },
  
  WORKER: {
    MASTER_URL: env.MASTER_URL || 'https://dfus-master.onrender.com',
    COUNT: parsePositiveInt(env.WORKER_COUNT, 3, 1, 64, 'WORKER_COUNT'),
    BASE_PORT: parsePositiveInt(env.WORKER_BASE_PORT, 4001, 1, 65535, 'WORKER_BASE_PORT'),
    SECRET: env.WORKER_SECRET || 'default-worker-secret-key',
    ID: env.WORKER_ID || `worker-${Math.random().toString(36).substring(2, 10)}`,
    PORT: env.WORKER_PORT ? parsePositiveInt(env.WORKER_PORT, null, 1, 65535, 'WORKER_PORT') : null
  },
  
  AUTH: {
    FIRST_USER_ADMIN: env.FIRST_USER_ADMIN === 'true'
  },

  CORS: {
    ALLOWED_ORIGINS: parseArray(env.CORS_ORIGINS, ['*']),
    CREDENTIALS: true
  },

  JWT: {
    ACCESS_SECRET: env.JWT_ACCESS_SECRET || 'dfus-default-jwt-access-secret-change-in-production-key-32ch',
    REFRESH_SECRET: env.JWT_REFRESH_SECRET || 'dfus-default-jwt-refresh-secret-change-in-production-key-32ch',
    ACCESS_EXPIRES_IN: env.JWT_ACCESS_EXPIRES_IN || '15m',
    REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  
  FIREBASE: {
    PROJECT_ID: env.FIREBASE_PROJECT_ID
  },

  PUSHER: {
    APP_ID: env.PUSHER_APP_ID || null,
    KEY: env.PUSHER_KEY || null,
    SECRET: env.PUSHER_SECRET || null,
    CLUSTER: env.PUSHER_CLUSTER || 'ap2'
  },

  CRON: {
    SECRET: env.CRON_SECRET || null
  },

  RECAPTCHA_API_KEY: env.RECAPTCHA_API_KEY || null,
  
  STORAGE: {
    DEFAULT_QUOTA: parsePositiveInt(env.DEFAULT_STORAGE_QUOTA, 1073741824, 1, Infinity, 'DEFAULT_STORAGE_QUOTA'), // 1GB
    CHUNK_SIZE: parsePositiveInt(env.CHUNK_SIZE_BYTES, 2097152, 1, Infinity, 'CHUNK_SIZE_BYTES') // 2MB
  },
  
  SYSTEM: {
    REPLICATION_FACTOR: parsePositiveInt(env.REPLICATION_FACTOR, 2, 1, 64, 'REPLICATION_FACTOR'),
    HEARTBEAT_INTERVAL: parsePositiveInt(env.HEARTBEAT_INTERVAL_MS, 5000, 100, 3600000, 'HEARTBEAT_INTERVAL_MS'),
    MAX_MISSED_BEATS: parsePositiveInt(env.MAX_MISSED_BEATS, 3, 1, 100, 'MAX_MISSED_BEATS'),
    REPLICATION_CONCURRENCY: parsePositiveInt(env.REPLICATION_CONCURRENCY, 5, 1, 100, 'REPLICATION_CONCURRENCY'),
    LOG_LEVEL: parseEnum(env.LOG_LEVEL, 'info', ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'], 'LOG_LEVEL'),
  },
  
  SQLITE: {
    DB_PATH: env.SQLITE_DB_PATH || './data/db/distributed_storage.db'
  },
  
  MONGO: {
    URI: env.MONGODB_URI
  },
  
  GOOGLE: {
    CLIENT_ID: env.GOOGLE_CLIENT_ID,
    CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN,
    DRIVE_FOLDER_ID: env.GOOGLE_DRIVE_FOLDER_ID
  },
  
  RATE_LIMIT: {
    WINDOW_MS: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 900000, 1000, Infinity, 'RATE_LIMIT_WINDOW_MS'),
    MAX: parsePositiveInt(env.RATE_LIMIT_MAX, 200, 1, Infinity, 'RATE_LIMIT_MAX'),
    AUTH_MAX: parsePositiveInt(env.AUTH_RATE_LIMIT_MAX, 10, 1, Infinity, 'AUTH_RATE_LIMIT_MAX')
  }
};

// Make it immutable
Object.freeze(config);
Object.freeze(config.MASTER);
Object.freeze(config.WORKER);
Object.freeze(config.AUTH);
Object.freeze(config.CORS);
Object.freeze(config.JWT);
Object.freeze(config.FIREBASE);
Object.freeze(config.PUSHER);
Object.freeze(config.CRON);
Object.freeze(config.STORAGE);
Object.freeze(config.SYSTEM);
Object.freeze(config.SQLITE);
Object.freeze(config.MONGO);
Object.freeze(config.GOOGLE);
Object.freeze(config.RATE_LIMIT);

module.exports = config;
