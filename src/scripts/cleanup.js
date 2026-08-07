const { getDatabase, initDatabase } = require('../repositories/database');
const { createLogger } = require('../utils/logger');
const config = require('../config/env');

const logger = createLogger('cleanup-job');

async function runCleanup() {
  try {
    logger.info('Starting cleanup job...');
    await initDatabase();
    const db = getDatabase();

    const now = new Date();

    // 1. Delete Expired Upload Sessions
    if (db.deleteExpiredSessions) {
      const deletedCount = await db.deleteExpiredSessions(now);
      logger.info(`Deleted ${deletedCount} expired upload sessions.`);
    }

    // 2. Permanently Delete Expired Trash Items
    if (db.getExpiredTrashItems && db.deleteTrashItem) {
      const expiredTrash = await db.getExpiredTrashItems(now);
      let count = 0;
      for (const item of expiredTrash) {
        if (item.type === 'file') {
          // If file is deleted, we might want to also flag its chunks for GC
          await db.deleteFile(item.itemId);
        } else {
          await db.deleteFolder(item.itemId);
        }
        await db.deleteTrashItem(item._id);
        count++;
      }
      logger.info(`Permanently deleted ${count} expired trash items.`);
    }

    // 3. Garbage Collect Orphaned Chunks (refCount logic)
    // In a real system, we'd query chunks that belong to no active files.
    // For simplicity, we assume files deleted permanently leave chunks behind.
    // Since we modeled chunks with fileId, we just delete chunks whose fileId doesn't exist in Files collection.
    if (db.deleteOrphanedChunks) {
      const deletedChunks = await db.deleteOrphanedChunks();
      logger.info(`Deleted ${deletedChunks} orphaned chunks.`);
    }

    logger.info('Cleanup job finished successfully.');
    process.exit(0);
  } catch (err) {
    logger.error('Cleanup job failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runCleanup();
}
