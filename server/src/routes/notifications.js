const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

router.get('/',              requireAuth, ctrl.list);
router.patch('/:id/read',    requireAuth, ctrl.markRead);
router.patch('/read-all',    requireAuth, ctrl.markAllRead);

module.exports = router;
