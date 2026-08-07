## 2026-08-07T08:31:15Z
Implement Milestone M1: Initialization & Baseline Infrastructure changes across `src/`:
1. Create `src/middleware/rateLimiter.js` with `generalLimiter` and `authLimiter` using `express-rate-limit`. Mount on `/api` and `/api/auth` in `src/master/server.js`.
2. Update `src/master/server.js` and `src/worker/server.js`:
   - Mount CORS middleware properly (expose `Content-Disposition`, `x-worker-secret`).
   - Wire `app.set('logger', logger)`.
   - Mount 404 catch-all route and structured `errorHandler` middleware.
   - Add graceful shutdown handlers (`SIGTERM`, `SIGINT`) closing HTTP servers, stopping heartbeats, and closing DB connections with a 5s fallback timeout.
3. Update `src/utils/logger.js`: Auto-create `data/logs` folder on startup, ensure Winston logs all HTTP requests, errors, and system events.
4. Update `src/utils/errors.js` and `src/middleware/errorHandler.js`: Add `details` metadata to `AppError` and ensure all exceptions are logged via Winston.
5. Update `src/config/env.js`: Add strict validation and fallbacks for ports, rate limits, mode, and DB paths.
6. Verify implementation by running `npm run test:e2e`. Ensure all 15 E2E tests pass with 0 failures!
