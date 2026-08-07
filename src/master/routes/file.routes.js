const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fileController = require('../controllers/file.controller');
const authenticate = require('../../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');
const config = require('../../config/env');

const router = express.Router();

// Memory storage since we immediately stream it to the chunker
// Note: We might want to stream directly rather than using memory storage if files are huge,
// but Multer's busboy can be piped.
// Let's use a temporary disk storage for multer to avoid RAM crashes for huge files, 
// then stream it into the chunker.
const upload = multer({ 
  dest: 'data/tmp/',
  limits: { fileSize: config.STORAGE.DEFAULT_QUOTA }
});

router.post('/upload', authenticate, upload.single('file'), asyncWrapper(fileController.uploadFile));
router.get('/:fileId', authenticate, asyncWrapper(fileController.downloadFile));
router.get('/', authenticate, asyncWrapper(fileController.listFiles));
router.delete('/:fileId', authenticate, asyncWrapper(fileController.deleteFile));

module.exports = router;
