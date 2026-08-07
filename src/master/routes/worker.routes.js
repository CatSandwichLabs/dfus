const express = require('express');
const workerController = require('../controllers/worker.controller');
const workerAuth = require('../../worker/middleware/workerAuth'); // Use the shared worker auth middleware
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.post('/register', workerAuth, asyncWrapper(workerController.registerWorker.bind(workerController)));

module.exports = router;
