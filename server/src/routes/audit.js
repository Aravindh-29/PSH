const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const auditCtrl = require('../controllers/auditController');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', auditCtrl.getLogs);
router.get('/ticket/:ticketNumber', auditCtrl.getTicketHistory);

module.exports = router;
