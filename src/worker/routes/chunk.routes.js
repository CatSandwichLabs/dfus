const express = require('express');
const chunkController = require('../controllers/chunk.controller');
const chunkAuth = require('../middleware/chunkAuth');

const router = express.Router();

// The master can also issue delete commands (might use workerAuth instead, but let's stick to chunkAuth for simplicity or add workerAuth for deletes)
const workerAuth = require('../../middleware/workerAuth');

// Client uploads raw binary.
// No body parser middleware here so req acts as a readable stream.
router.post('/:chunkHash', chunkAuth(), chunkController.uploadChunk);

// Client downloads chunk
router.get('/:chunkHash', chunkAuth('read'), chunkController.downloadChunk);

// Master tells worker to replicate chunk from another worker
router.post('/:chunkHash/replicate', chunkAuth('replicate'), express.json(), chunkController.replicateChunk);

// Master deletes chunk
router.delete('/:chunkHash', workerAuth, chunkController.deleteChunk);

module.exports = router;
