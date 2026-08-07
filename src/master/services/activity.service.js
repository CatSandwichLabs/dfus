const { getDatabase } = require('../../repositories/database');
const wss = require('./websocket.service');

class ActivityService {
  constructor() {
    this.db = getDatabase();
  }

  async logActivity(userId, action, details) {
    // In a real implementation we would save to db.activityLogs
    // For now, we just broadcast via websocket
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
