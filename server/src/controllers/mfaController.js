const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const pool = require('../db/pool');

// Allow ±2 time steps (±60 sec) to handle phone/server clock drift
authenticator.options = { window: 2 };

// Require a pending (password-verified, not yet MFA-verified) session
function requireMfaPending(req, res, next) {
  if (!req.session?.mfaPendingUserId) {
    return res.status(401).json({ success: false, message: 'No pending MFA session' });
  }
  next();
}

// GET /api/mfa/setup-qr
async function setupQr(req, res, next) {
  try {
    const userId = req.session.mfaPendingUserId;
    const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const { username } = userRes.rows[0];
    const secret = authenticator.generateSecret(20);
    req.session.mfaSetupSecret = secret;

    const otpAuthUrl = authenticator.keyuri(username, 'SERV-IT', secret);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUrl, { width: 220, margin: 1 });

    res.json({ success: true, secret, qrDataUrl });
  } catch (err) { next(err); }
}

// POST /api/mfa/confirm-setup  { code }
async function confirmSetup(req, res, next) {
  try {
    const userId = req.session.mfaPendingUserId;
    const secret = req.session.mfaSetupSecret;
    if (!secret) return res.status(400).json({ success: false, message: 'Start setup first' });

    const { code } = req.body;
    const valid = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret });
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid code — check authenticator and try again' });

    await pool.query('UPDATE users SET mfa_secret = $1, mfa_enabled = true WHERE id = $2', [secret, userId]);

    const userRes = await pool.query('SELECT id, username, email, full_name, role FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.fullName = user.full_name;
    delete req.session.mfaPendingUserId;
    delete req.session.mfaSetupSecret;

    res.json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) { next(err); }
}

// POST /api/mfa/verify  { code }
async function verifyMfa(req, res, next) {
  try {
    const userId = req.session.mfaPendingUserId;
    const { code } = req.body;

    const userRes = await pool.query(
      'SELECT id, username, email, full_name, role, mfa_secret FROM users WHERE id = $1',
      [userId]
    );
    if (!userRes.rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const user = userRes.rows[0];
    const valid = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret: user.mfa_secret });
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid code — check authenticator and try again' });

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.fullName = user.full_name;
    delete req.session.mfaPendingUserId;

    res.json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) { next(err); }
}

// GET /api/mfa/pending  — frontend calls to check MFA state before rendering MFA pages
async function pendingStatus(req, res) {
  if (!req.session?.mfaPendingUserId) {
    return res.json({ success: false, pending: false });
  }
  const userRes = await pool.query('SELECT mfa_enabled FROM users WHERE id = $1', [req.session.mfaPendingUserId]).catch(() => ({ rows: [] }));
  const mfaEnabled = userRes.rows[0]?.mfa_enabled ?? false;
  res.json({ success: true, pending: true, mfaSetup: !mfaEnabled });
}

module.exports = { requireMfaPending, setupQr, confirmSetup, verifyMfa, pendingStatus };
