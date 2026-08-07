const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.get('/me', authenticate, asyncWrapper(authController.getMe));

module.exports = router;
