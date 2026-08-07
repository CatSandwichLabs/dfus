const express = require('express');
const adminController = require('../controllers/admin.controller');
const authenticate = require('../middleware/authenticate');
const adminAuth = require('../middleware/adminAuth');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);
router.use(adminAuth);

router.get('/health', asyncWrapper(adminController.getSystemHealth.bind(adminController)));
router.post('/users/:userId/quota', asyncWrapper(adminController.setStorageQuota.bind(adminController)));

module.exports = router;
