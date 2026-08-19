const pool = require('../db/pool');
const argon2 = require('argon2');

async function list(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS ticket_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.priority = 'CRITICAL') AS critical_count
      FROM users u
      LEFT JOIN tickets t ON t.created_by = u.id
      GROUP BY u.id
      ORDER BY u.full_name
    `);
    res.json({ success: true, users: result.rows });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS ticket_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.priority = 'CRITICAL') AS critical_count
      FROM users u
      LEFT JOIN tickets t ON t.created_by = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { username, email, fullName, password, role = 'employee' } = req.body;
    if (!username || !email || !fullName || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    const hash = await argon2.hash(password);
    const result = await pool.query(
      `INSERT INTO users (username, email, full_name, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, email, full_name, role`,
      [username.toLowerCase(), email.toLowerCase(), fullName, hash, role]
    );
    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Username or email already exists' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { fullName, email, role, isActive } = req.body;
    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email),
       role = COALESCE($3, role), is_active = COALESCE($4, is_active), updated_at = NOW()
       WHERE id = $5 RETURNING id, username, email, full_name, role, is_active`,
      [fullName || null, email || null, role || null, isActive !== undefined ? isActive : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const hash = await argon2.hash(password);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [hash, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, resetPassword };
