const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const ticketCtrl = require('../controllers/ticketController');
const attachCtrl = require('../controllers/attachmentController');

const router = express.Router();
// No fileSize limit in multer — per-file validation happens in the controller
// This prevents one oversized file from aborting the entire multi-file upload
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fieldSize: 100 * 1024 * 1024 } });

function handleMulterError(req, res, next) {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload error' });
    }
    next();
  });
}

router.use(requireAuth);
router.get('/next-number', ticketCtrl.nextNumber);
router.get('/', ticketCtrl.list);
router.post('/', ticketCtrl.create);
router.get('/:id', ticketCtrl.getOne);
router.put('/:id', ticketCtrl.update);
router.delete('/:id', ticketCtrl.remove);
router.post('/:id/comments', ticketCtrl.addComment);
router.post('/:id/attachments', handleMulterError, attachCtrl.upload);
router.get('/:id/attachments/zip', attachCtrl.downloadZip);

module.exports = router;
