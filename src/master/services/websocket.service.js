const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('websocket');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // userId -> Set of ws clients
  }

  init(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      // Authenticate via query param or headers (query is easier for browser WS API)
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
  }

  broadcastToUser(userId, message) {
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

  broadcastAll(message) {
    if (!this.wss) return;
    const data = JSON.stringify(message);
    this.wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

module.exports = new WebSocketService();
