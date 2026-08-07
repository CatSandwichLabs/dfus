require('dotenv').config();

const env = process.env;

// Require variables that must exist for basic operation
const required = ['WORKER_SECRET'];

if (env.MODE === 'cloud') {
  required.push('MONGODB_URI', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME');
}

for (const req of required) {
  if (!env[req]) {
    console.error(`[Fatal] Missing required environment variable: ${req}`);
    process.exit(1);
  }
}

const config = {
  MODE: env.MODE || 'presentation',
  
  MASTER: {
    HOST: env.MASTER_HOST || 'localhost',
    PORT: parseInt(env.MASTER_PORT, 10) || 3000,
  },
  
  WORKER: {
    COUNT: parseInt(env.WORKER_COUNT, 10) || 3,
    BASE_PORT: parseInt(env.WORKER_BASE_PORT, 10) || 4001,
    SECRET: env.WORKER_SECRET
  },
  
  AUTH: {
    FIRST_USER_ADMIN: env.FIRST_USER_ADMIN === 'true'
  },
  
  FIREBASE: {
    PROJECT_ID: env.FIREBASE_PROJECT_ID
  },
  
  STORAGE: {
    DEFAULT_QUOTA: parseInt(env.DEFAULT_STORAGE_QUOTA, 10) || 1073741824, // 1GB
    CHUNK_SIZE: parseInt(env.CHUNK_SIZE_BYTES, 10) || 2097152 // 2MB
  },
  
  SYSTEM: {
    REPLICATION_FACTOR: parseInt(env.REPLICATION_FACTOR, 10) || 2,
    HEARTBEAT_INTERVAL: parseInt(env.HEARTBEAT_INTERVAL_MS, 10) || 5000,
    MAX_MISSED_BEATS: parseInt(env.MAX_MISSED_BEATS, 10) || 3,
    REPLICATION_CONCURRENCY: parseInt(env.REPLICATION_CONCURRENCY, 10) || 5,
    LOG_LEVEL: env.LOG_LEVEL || 'info',
  },
  
  SQLITE: {
    DB_PATH: env.SQLITE_DB_PATH || './data/db/distributed_storage.db'
  },
  
  MONGO: {
    URI: env.MONGODB_URI
  },
  
  R2: {
    ACCOUNT_ID: env.R2_ACCOUNT_ID,
    ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    BUCKET_NAME: env.R2_BUCKET_NAME
  },
  
  RATE_LIMIT: {
    WINDOW_MS: parseInt(env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    MAX: parseInt(env.RATE_LIMIT_MAX, 10) || 200,
    AUTH_MAX: parseInt(env.AUTH_RATE_LIMIT_MAX, 10) || 10
  }
};

// Make it immutable
Object.freeze(config);
Object.freeze(config.MASTER);
Object.freeze(config.WORKER);
Object.freeze(config.AUTH);
Object.freeze(config.FIREBASE);
Object.freeze(config.STORAGE);
Object.freeze(config.SYSTEM);
Object.freeze(config.SQLITE);
Object.freeze(config.MONGO);
Object.freeze(config.R2);
Object.freeze(config.RATE_LIMIT);

module.exports = config;
