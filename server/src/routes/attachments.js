const express = require('express');
const { requireAuth } = require('../middleware/auth');
const attachCtrl = require('../controllers/attachmentController');

const router = express.Router();
router.use(requireAuth);
router.get('/:attachmentId/download', attachCtrl.download);
router.delete('/:attachmentId', attachCtrl.remove);

module.exports = router;
