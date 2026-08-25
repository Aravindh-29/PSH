const express = require('express');
const router = express.Router();
const { requireMfaPending, setupQr, confirmSetup, verifyMfa, pendingStatus } = require('../controllers/mfaController');

router.get('/pending',       pendingStatus);
router.get('/setup-qr',      requireMfaPending, setupQr);
router.post('/confirm-setup',requireMfaPending, confirmSetup);
router.post('/verify',       requireMfaPending, verifyMfa);

module.exports = router;
