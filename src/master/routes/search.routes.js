const express = require('express');
const searchController = require('../controllers/search.controller');
const authenticate = require('../middleware/authenticate');
const asyncWrapper = require('../../utils/asyncWrapper');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncWrapper(searchController.search.bind(searchController)));
router.get('/tags', asyncWrapper(searchController.getTags.bind(searchController)));

module.exports = router;
