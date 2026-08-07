const express = require('express');
const accountController = require('../controllers/account.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);

router.get('/me', asyncWrapper(accountController.getProfile.bind(accountController)));
router.put('/me', asyncWrapper(accountController.updateProfile.bind(accountController)));
router.put('/password', asyncWrapper(accountController.changePassword.bind(accountController)));

router.get('/sessions', asyncWrapper(accountController.getSessions.bind(accountController)));
router.delete('/sessions', asyncWrapper(accountController.revokeAllSessions.bind(accountController)));
router.delete('/sessions/:id', asyncWrapper(accountController.revokeSession.bind(accountController)));

router.post('/export', asyncWrapper(accountController.exportData.bind(accountController)));
router.delete('/', asyncWrapper(accountController.deleteAccount.bind(accountController)));

module.exports = router;
