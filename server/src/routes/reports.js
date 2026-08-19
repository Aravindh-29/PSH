const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const reportCtrl = require('../controllers/reportController');

const router = express.Router();
router.get('/',       requireAuth,  reportCtrl.getReport);
router.get('/global', requireAdmin, reportCtrl.getGlobalReport);
module.exports = router;
