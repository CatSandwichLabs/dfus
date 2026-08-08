const express = require('express');
const folderController = require('../controllers/folder.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);

router.post('/', asyncWrapper(folderController.createFolder.bind(folderController)));
router.get('/', asyncWrapper(folderController.listFolders.bind(folderController)));
router.get('/:folderId', asyncWrapper(folderController.getFolder.bind(folderController)));
router.get('/:folderId/path', asyncWrapper(folderController.getFolderPath.bind(folderController)));
router.put('/:folderId', asyncWrapper(folderController.updateFolder.bind(folderController)));
router.put('/:folderId/move', asyncWrapper(folderController.moveFolder.bind(folderController)));
router.delete('/:folderId', asyncWrapper(folderController.deleteFolder.bind(folderController)));

module.exports = router;
