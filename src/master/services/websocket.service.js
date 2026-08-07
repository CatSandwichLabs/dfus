const { createLogger } = require('../../utils/logger');

const logger = createLogger('realtime');

/**
 * RealTimeService - Abstraction layer for real-time notifications.
 * 
 * In SERVERLESS mode (Vercel): Uses Pusher to send events.
 * In LOCAL mode (Docker/dev): Uses native WebSocket (ws).
 * 
 * The interface remains the same for all consumers:
 *   - broadcastToUser(userId, message)
 *   - broadcastAll(message)
 */
class RealTimeService {
  constructor() {
    this.pusher = null;
    this.wss = null;
    this.clients = new Map(); // Only used in local WS mode
    this._mode = 'noop'; // 'pusher', 'websocket', or 'noop'
  }

  /**
   * Initialize Pusher for serverless environments.
   * Called automatically if PUSHER_APP_ID env var is set.
   */
  initPusher() {
    try {
      const Pusher = require('pusher');
      this.pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER,
        useTLS: true
      });
      this._mode = 'pusher';
      logger.info('RealTime: Pusher initialized successfully');
    } catch (err) {
      logger.warn(`RealTime: Pusher initialization failed: ${err.message}. Notifications disabled.`);
      this._mode = 'noop';
    }
  }

  /**
   * Initialize native WebSocket for local/Docker environments.
   * Called from server.js when running app.listen().
   */
  init(server) {
    try {
      const WebSocket = require('ws');
      const jwt = require('jsonwebtoken');
      const config = require('../../config/env');

      this.wss = new WebSocket.Server({ server, path: '/ws' });
      this._mode = 'websocket';

      this.wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
          ws.close(4001, 'Unauthorized');
          return;
        }

        try {
          const decoded = jwt.verify(token, config.JWT.ACCESS_SECRET);
          const userId = decoded.userId;
          ws.userId = userId;

          if (!this.clients.has(userId)) {
            this.clients.set(userId, new Set());
          }
          this.clients.get(userId).add(ws);
          logger.debug(`User ${userId} connected to WebSocket`);

          ws.on('close', () => {
            const userClients = this.clients.get(userId);
            if (userClients) {
              userClients.delete(ws);
              if (userClients.size === 0) {
                this.clients.delete(userId);
              }
            }
          });
        } catch (err) {
          ws.close(4001, 'Invalid Token');
        }
      });

      logger.info('RealTime: WebSocket server initialized');
    } catch (err) {
      logger.warn(`RealTime: WebSocket initialization failed: ${err.message}. Falling back to noop.`);
      this._mode = 'noop';
    }
  }

  /**
   * Auto-detect and initialize the appropriate transport.
   * Called lazily on first use.
   */
  _ensureInitialized() {
    if (this._mode !== 'noop') return;

    // If Pusher credentials are available, use Pusher
    if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET) {
      this.initPusher();
    }
    // Otherwise stay in noop mode (notifications silently skip)
  }

  /**
   * Send a message to a specific user.
   */
  broadcastToUser(userId, message) {
    this._ensureInitialized();

    if (this._mode === 'pusher') {
      const channel = `private-user-${userId}`;
      this.pusher.trigger(channel, 'notification', message).catch(err => {
        logger.error(`Pusher trigger failed for user ${userId}: ${err.message}`);
      });
    } else if (this._mode === 'websocket') {
      const WebSocket = require('ws');
      const userClients = this.clients.get(userId.toString());
      if (userClients) {
        const data = JSON.stringify(message);
        for (const ws of userClients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        }
      }
    }
    // In 'noop' mode, silently skip
  }

  /**
   * Alias for broadcastToUser (activity.service.js uses this name).
   */
  sendToUser(userId, message) {
    this.broadcastToUser(userId, message);
  }

  /**
   * Broadcast a message to all connected users.
   */
  broadcastAll(message) {
    this._ensureInitialized();

    if (this._mode === 'pusher') {
      this.pusher.trigger('public-global', 'notification', message).catch(err => {
        logger.error(`Pusher global broadcast failed: ${err.message}`);
      });
    } else if (this._mode === 'websocket') {
      const WebSocket = require('ws');
      if (!this.wss) return;
      const data = JSON.stringify(message);
      this.wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }
    // In 'noop' mode, silently skip
  }
}

module.exports = new RealTimeService();
