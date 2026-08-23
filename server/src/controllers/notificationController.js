const pool = require('../db/pool');

async function list(req, res, next) {
  try {
    const userId = req.session.userId;
    const { rows } = await pool.query(
      `SELECT id, type, title, message, ticket_id, ticket_number, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY is_read ASC, created_at DESC
       LIMIT 30`,
      [userId]
    );
    const unread = rows.filter(r => !r.is_read).length;
    res.json({ success: true, notifications: rows, unread });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [id, req.session.userId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [req.session.userId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, markRead, markAllRead };
