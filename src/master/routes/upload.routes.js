const express = require('express');
const uploadController = require('../controllers/upload.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);

router.post('/init', asyncWrapper(uploadController.initUpload.bind(uploadController)));
router.get('/:sessionId/status', asyncWrapper(uploadController.getStatus.bind(uploadController)));
router.post('/:sessionId/finalize', asyncWrapper(uploadController.finalizeUpload.bind(uploadController)));
router.delete('/:sessionId', asyncWrapper(uploadController.abortUpload.bind(uploadController)));

module.exports = router;
