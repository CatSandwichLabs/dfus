const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateEnvFile() {
  const envPath = path.join(__dirname, '../../.env');
  
  if (fs.existsSync(envPath)) {
    console.log('.env file already exists. Skipping setup.');
    return;
  }

  const accessSecret = crypto.randomBytes(32).toString('hex');
  const refreshSecret = crypto.randomBytes(32).toString('hex');
  const workerSecret = crypto.randomBytes(32).toString('hex');
  const storageKey = crypto.randomBytes(32).toString('hex');

  const envContent = `NODE_ENV=development

# Master Node
MASTER_PORT=3000
MONGODB_URI=mongodb://localhost:27017/dfus

# Security (Generated automatically)
JWT_ACCESS_SECRET=${accessSecret}
JWT_REFRESH_SECRET=${refreshSecret}
WORKER_SECRET=${workerSecret}

# Worker Node
WORKER_ID=worker-1
WORKER_PORT=4000
MASTER_URL=http://localhost:3000

# Storage
STORAGE_CHUNK_SIZE=5242880
STORAGE_ENCRYPTION_KEY=${storageKey}

# S3 / R2 Configuration
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=dfus-chunks
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('Successfully generated .env file with secure secrets.');
}

generateEnvFile();
