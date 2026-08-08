const { getDatabase } = require('../../repositories/database');
const wss = require('./websocket.service');

class ActivityService {
  constructor() {
    this.db = getDatabase();
  }

  async logActivity(userId, action, details) {
    const activityData = {
      userId,
      action,
      resourceType: details.resourceType || 'system',
      resourceId: details.resourceId || null,
      metadata: details,
      ipAddress: details.ip,
      userAgent: details.userAgent
    };
    
    if (this.db.logActivity) {
      await this.db.logActivity(activityData);
    }

    const message = {
      type: 'ACTIVITY_LOG',
      data: {
        action,
        details,
        timestamp: new Date().toISOString()
      }
    };
    wss.sendToUser(userId, message);
  }
}

module.exports = new ActivityService();
