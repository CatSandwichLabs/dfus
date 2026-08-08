const cron = require('node-cron');
const { getDatabase } = require('../../repositories/database');

class CleanupJob {
  start() {
    // Run every day at midnight
    cron.schedule('0 0 * * *', async () => {
      console.log('[CleanupJob] Starting background cleanup...');
      const db = getDatabase();
      if (!db.client || !db.client.model) return;

      try {
        const File = db.client.model('File');
        const Chunk = db.client.model('Chunk');
        
        // 1. Purge items in Trash > 30 days old
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const oldTrashFiles = await File.find({
          status: 'deleted',
          updatedAt: { $lt: thirtyDaysAgo }
        });
        
        for (const file of oldTrashFiles) {
          console.log(`[CleanupJob] Permanently deleting file ${file._id} from trash...`);
          // Decrement chunk refCounts
          await Chunk.updateMany(
            { fileId: file._id },
            { $inc: { refCount: -1 } }
          );
          
          // Reclaim quota
          if (file.owner) {
            await db.updateUser(file.owner, {
              $inc: { storageUsed: -file.size }
            });
          }
          
          await File.deleteOne({ _id: file._id });
        }
        
        console.log(`[CleanupJob] Purged ${oldTrashFiles.length} files from trash.`);

        // 2. Cleanup orphaned chunks (refCount <= 0)
        // For physical cleanup, we would notify workers here. 
        // For now, we'll mark them as 'deleted' in metadata if not already
        const orphanedChunks = await Chunk.updateMany(
          { refCount: { $lte: 0 }, status: { $ne: 'deleted' } },
          { $set: { status: 'deleted' } }
        );
        
        console.log(`[CleanupJob] Marked ${orphanedChunks.modifiedCount} orphaned chunks for deletion.`);

        // 3. Aborted uploads cleanup (> 24 hours old and status uploading)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const abortedUploads = await File.find({
          status: 'uploading',
          createdAt: { $lt: oneDayAgo }
        });

        for (const file of abortedUploads) {
           console.log(`[CleanupJob] Cleaning up aborted upload ${file._id}...`);
           await Chunk.updateMany(
             { fileId: file._id },
             { $inc: { refCount: -1 } }
           );
           await File.deleteOne({ _id: file._id });
        }

        console.log(`[CleanupJob] Purged ${abortedUploads.length} aborted uploads.`);
        
      } catch (err) {
        console.error('[CleanupJob] Error during cleanup:', err);
      }
    });
  }
}

module.exports = new CleanupJob();
