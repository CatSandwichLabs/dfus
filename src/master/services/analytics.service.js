const { getDatabase } = require('../../repositories/database');

class AnalyticsService {
  constructor() {
    this.db = getDatabase();
  }

  async getUserAnalytics(userId) {
    const user = await this.db.findUserById(userId);
    
    // In a real system we would aggregate across files, folders, shares, and bandwidth usage
    // For now, return basic usage
    return {
      storageUsed: user.storageUsed || 0,
      storageQuota: user.storageQuota,
      filesCount: 0, // Would query db for count
      bandwidthUsed: 0 // Would query metrics db
    };
  }

  async getSystemAnalytics() {
    // For admin
    return {
      totalUsers: 0,
      totalStorageUsed: 0,
      activeWorkers: 0
    };
  }
}

module.exports = new AnalyticsService();
