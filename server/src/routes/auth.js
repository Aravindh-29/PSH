const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, logout, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

router.post('/login', loginLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

module.exports = router;
