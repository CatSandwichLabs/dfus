const { program } = require('commander');
const { getDatabase } = require('../src/repositories/database');
const mongoose = require('mongoose');

program
  .version('1.0.0')
  .description('DFUS Admin CLI');

program
  .command('set-quota <email> <bytes>')
  .description('Set storage quota for a user')
  .action(async (email, bytes) => {
    try {
      const db = getDatabase();
      const user = await db.findUserByEmail(email);
      if (!user) {
        console.error('User not found');
        process.exit(1);
      }
      await db.updateUser(user._id, { storageQuota: parseInt(bytes, 10) });
      console.log(`Updated quota for ${email} to ${bytes} bytes`);
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });

program
  .command('list-workers')
  .description('List registered workers')
  .action(async () => {
    try {
      const db = getDatabase();
      const workers = await db.getAllWorkers();
      console.table(workers.map(w => ({
        id: w.workerId,
        host: w.host,
        port: w.port,
        status: w.status
      })));
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });

program.parse(process.argv);
