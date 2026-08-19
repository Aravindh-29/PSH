const argon2 = require('argon2');
const pool = require('../db/pool');
const logger = require('../utils/logger');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const result = await pool.query(
      'SELECT id, username, email, full_name, role, password_hash, is_active FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
      [username.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      logger.warn(`Failed login attempt for: ${username}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await argon2.verify(user.password_hash, password);

    if (!valid) {
      logger.warn(`Failed login attempt for: ${username}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.fullName = user.full_name;

    logger.info(`User logged in: ${user.username} (${user.role})`);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  const username = req.session?.username;
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('psh.sid');
    logger.info(`User logged out: ${username}`);
    res.json({ success: true, message: 'Logged out' });
  });
}

async function me(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }
    const user = result.rows[0];
    res.json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me };
