const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.post('/register', asyncWrapper(authController.register.bind(authController)));
router.post('/login', asyncWrapper(authController.login.bind(authController)));
router.post('/verify-2fa', asyncWrapper(authController.verify2FALogin.bind(authController)));

router.post('/refresh', asyncWrapper(authController.refresh.bind(authController)));
router.post('/logout', authenticate, asyncWrapper(authController.logout.bind(authController)));

router.post('/2fa/setup', authenticate, asyncWrapper(authController.setup2FA.bind(authController)));
router.post('/2fa/verify', authenticate, asyncWrapper(authController.verify2FASetup.bind(authController)));
router.post('/2fa/disable', authenticate, asyncWrapper(authController.disable2FA.bind(authController)));

router.post('/api-keys', authenticate, asyncWrapper(authController.createApiKey.bind(authController)));
router.get('/api-keys', authenticate, asyncWrapper(authController.getApiKeys.bind(authController)));
router.delete('/api-keys/:id', authenticate, asyncWrapper(authController.revokeApiKey.bind(authController)));

router.get('/me', authenticate, asyncWrapper(authController.getMe.bind(authController)));

module.exports = router;
