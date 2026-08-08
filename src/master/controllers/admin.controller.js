const { getDatabase } = require('../../repositories/database');

class AdminController {
  async getSystemHealth(req, res) {
    const db = getDatabase();
    
    // Aggregate health stats
    const workers = await db.getAllWorkers();
    let alive = 0, suspect = 0, dead = 0;
    workers.forEach(w => {
      if (w.status === 'alive') alive++;
      else if (w.status === 'suspect') suspect++;
      else if (w.status === 'dead') dead++;
    });

    const status = (dead > 0 || alive === 0) ? 'critical' : (suspect > 0 ? 'degraded' : 'healthy');

    res.json({
      status,
      workers: { total: workers.length, alive, suspect, dead },
      database: 'connected',
      uptime: process.uptime()
    });
  }

  async setStorageQuota(req, res) {
    const { userId } = req.params;
    const { quotaBytes } = req.body;
    const db = getDatabase();
    await db.updateUser(userId, { storageQuota: quotaBytes });
    res.json({ message: 'Quota updated successfully' });
  }

  async getActivityLogs(req, res) {
    const db = getDatabase();
    // Use Mongoose directly for the admin route, or if a repo method exists, use it.
    // For this admin panel, we'll fetch recent activities directly via Mongoose if using MongoMetadataRepo
    if (db.client && db.client.model) {
      const Activity = db.client.model('Activity');
      const activities = await Activity.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      return res.json({ activities });
    }
    res.json({ activities: [] });
  }
}

module.exports = new AdminController();
