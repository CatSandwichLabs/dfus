const activityService = require('../master/services/activity.service');

module.exports = (actionType) => async (req, res, next) => {
  // Capture original res.end to log after response is sent
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    res.end = originalEnd;
    res.end(chunk, encoding);
    
    // Log activity if the request was successful
    if (res.statusCode >= 200 && res.statusCode < 400 && req.user) {
      activityService.logActivity(req.user.userId, actionType, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
  };
  next();
};
