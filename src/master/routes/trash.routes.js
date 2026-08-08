const express = require('express');
const trashController = require('../controllers/trash.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncWrapper(trashController.listTrash.bind(trashController)));
router.post('/move', asyncWrapper(trashController.moveToTrash.bind(trashController)));
router.post('/:trashId/restore', asyncWrapper(trashController.restoreFromTrash.bind(trashController)));
router.delete('/:trashId', asyncWrapper(trashController.permanentDelete.bind(trashController)));

module.exports = router;
