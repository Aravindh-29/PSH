const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getStats, getQueryStats } = require('../controllers/dashboardController');

const router = express.Router();
router.get('/', requireAuth, getStats);
router.get('/query', requireAuth, getQueryStats);
module.exports = router;
