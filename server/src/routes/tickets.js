const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const ticketCtrl = require('../controllers/ticketController');
const attachCtrl = require('../controllers/attachmentController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 25 * 1024 * 1024, fieldSize: 64 * 1024, fields: 10, parts: 20 } });

function handleMulterError(req, res, next) {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      const message=err.code==='LIMIT_FILE_SIZE'?'Each attachment must be 25 MB or smaller.':err.code==='LIMIT_FILE_COUNT'||err.code==='LIMIT_UNEXPECTED_FILE'?'Select up to 10 attachments using the files field.':err.message||'Upload error';
      return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({ success: false, message });
    }
    next();
  });
}

router.use(requireAuth);
router.get('/next-number', ticketCtrl.nextNumber);
router.get('/', ticketCtrl.list);
router.post('/', ticketCtrl.create);
router.get('/:id', ticketCtrl.getOne);
router.post('/:id/opened', require('../controllers/ticketInboxController').opened);
router.put('/:id', ticketCtrl.update);
router.delete('/:id', ticketCtrl.remove);
router.post('/:id/comments', ticketCtrl.addComment);
router.post('/:id/attachments', handleMulterError, attachCtrl.upload);
router.get('/:id/attachments/zip', attachCtrl.downloadZip);

module.exports = router;
