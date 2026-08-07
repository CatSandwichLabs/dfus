const express = require('express');
const shareController = require('../controllers/share.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

// Public route to access shared file
router.post('/access/:shareToken', asyncWrapper(shareController.accessSharedFile.bind(shareController)));

// Authenticated routes to manage shares
router.use(authenticate);

router.post('/:fileId', asyncWrapper(shareController.createShareLink.bind(shareController)));
router.delete('/:fileId', asyncWrapper(shareController.revokeShareLink.bind(shareController)));

module.exports = router;
