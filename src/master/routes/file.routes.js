const express = require('express');
const fileController = require('../controllers/file.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);

router.get('/:fileId/manifest', asyncWrapper(fileController.getDownloadManifest.bind(fileController)));
router.get('/', asyncWrapper(fileController.listFiles.bind(fileController)));
router.get('/:fileId', asyncWrapper(fileController.getFile.bind(fileController)));
router.delete('/:fileId', asyncWrapper(fileController.deleteFile.bind(fileController)));
router.put('/:fileId', asyncWrapper(fileController.updateFile.bind(fileController)));

module.exports = router;
