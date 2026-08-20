const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, logout, me } = require('../controllers/authController');
const { redirectToProvider, handleCallback, ssoStatus } = require('../controllers/ssoController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Password login
router.post('/login', loginLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

// SSO (OIDC)
router.get('/sso-status',      ssoStatus);
router.get('/sso',             redirectToProvider);
router.get('/sso/callback',    handleCallback);

module.exports = router;
