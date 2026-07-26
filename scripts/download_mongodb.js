const { MongoMemoryServer } = require('mongodb-memory-server');

async function downloadBinary() {
  console.log('Starting MongoDB Memory Server binary download...');
  const mongod = await MongoMemoryServer.create();
  console.log('Download complete and server started at', mongod.getUri());
  await mongod.stop();
  console.log('Server stopped. Ready to run Jest tests.');
}

downloadBinary().catch(console.error);
