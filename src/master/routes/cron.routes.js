const express = require('express');
const heartbeatService = require('../services/heartbeat.service');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('cron');
const router = express.Router();

/**
 * GET /api/v1/system/cron/heartbeat
 * 
 * Triggered by Vercel Cron every minute to check for dead workers.
 * Vercel cron requests include an Authorization header with CRON_SECRET.
 * In production, verify the secret. In dev, allow all.
 */
router.get('/heartbeat', async (req, res) => {
  try {
    // Verify this is a legitimate cron request
    // Vercel sets the Authorization header with CRON_SECRET
    if (process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const result = await heartbeatService.checkDeadWorkers();
    logger.info(`Cron heartbeat check complete: ${result.checked} workers checked, ${result.deadFound} dead`);
    
    res.json({ 
      ok: true, 
      ...result,
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    logger.error(`Cron heartbeat failed: ${err.message}`);
    res.status(500).json({ error: 'Heartbeat check failed', message: err.message });
  }
});

module.exports = router;
