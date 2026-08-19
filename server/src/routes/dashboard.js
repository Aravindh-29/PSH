const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getStats } = require('../controllers/dashboardController');

const router = express.Router();
router.get('/', requireAuth, getStats);
module.exports = router;
