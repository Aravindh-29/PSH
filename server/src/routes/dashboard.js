const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getStats } = require('../controllers/dashboardController');

const router = express.Router();
router.get('/', requireAuth, getStats);
router.get('/query/badge', requireAuth, require('../controllers/ticketInboxController').badge);
router.get('/query', requireAuth, require('../controllers/ticketInboxController').list);
module.exports = router;
