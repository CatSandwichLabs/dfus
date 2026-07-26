const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn } = require('child_process');

async function startDevServer() {
  console.log('Starting local in-memory MongoDB...');
  console.log('If this is the first run, it may take a few minutes to download the MongoDB binary (approx 600MB).');
  
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  console.log(`MongoDB started at ${uri}`);
  console.log('Starting Node.js application server...');
  
  const child = spawn('node', ['server/server.js'], {
    env: {
      ...process.env,
      MONGODB_URI: uri,
      NODE_ENV: 'development'
    },
    stdio: 'inherit'
  });

  child.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    mongod.stop();
    process.exit(code);
  });
  
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    child.kill('SIGINT');
    await mongod.stop();
    process.exit(0);
  });
}

startDevServer().catch(err => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
