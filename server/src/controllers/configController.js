const pool = require('../db/pool');

async function getModules(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM modules WHERE is_active = true ORDER BY name');
    res.json({ success: true, modules: result.rows });
  } catch (err) { next(err); }
}

async function getCategories(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY name');
    res.json({ success: true, categories: result.rows });
  } catch (err) { next(err); }
}

async function getUsers(req, res, next) {
  try {
    const result = await pool.query('SELECT id, full_name, username, role FROM users WHERE is_active = true ORDER BY full_name');
    res.json({ success: true, users: result.rows });
  } catch (err) { next(err); }
}

module.exports = { getModules, getCategories, getUsers };
