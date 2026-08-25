const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAdminLogs } = require('../controllers/adminAuditController');

router.get('/', requireAuth, requireAdmin, getAdminLogs);

module.exports = router;
