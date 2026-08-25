const pool = require('../db/pool');
const { logAdminAudit } = require('./adminAuditController');

// List all subcategories, optionally filtered by category
async function list(req, res, next) {
  try {
    const { categoryId } = req.query;
    const params = [];
    let where = 'WHERE s.is_active = TRUE';
    if (categoryId) { params.push(categoryId); where += ` AND s.category_id = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT s.id, s.name, s.category_id, s.is_active, s.created_at,
             c.name AS category_name
      FROM subcategories s
      JOIN categories c ON c.id = s.category_id
      ${where}
      ORDER BY c.name, s.name
    `, params);
    res.json({ success: true, subcategories: rows });
  } catch (err) { next(err); }
}

// Admin: list all including inactive
async function listAdmin(req, res, next) {
  try {
    const { categoryId } = req.query;
    const params = [];
    let where = '';
    if (categoryId) { params.push(categoryId); where = `WHERE s.category_id = $1`; }
    const { rows } = await pool.query(`
      SELECT s.id, s.name, s.category_id, s.is_active, s.created_at,
             c.name AS category_name
      FROM subcategories s
      JOIN categories c ON c.id = s.category_id
      ${where}
      ORDER BY c.name, s.name
    `, params);
    res.json({ success: true, subcategories: rows });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, categoryId } = req.body;
    if (!name?.trim() || !categoryId) {
      return res.status(400).json({ success: false, message: 'Name and categoryId are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO subcategories (name, category_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), categoryId]
    );
    logAdminAudit(req.session?.userId, 'SUBCATEGORY_CREATED', 'subcategory', rows[0].id, rows[0].name, { categoryId }, req.ip);
    res.status(201).json({ success: true, subcategory: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Subcategory already exists in this category' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;
    const { rows } = await pool.query(`
      UPDATE subcategories SET name = COALESCE($1, name), is_active = COALESCE($2, is_active)
      WHERE id = $3 RETURNING *
    `, [name?.trim() || null, is_active ?? null, id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    logAdminAudit(req.session?.userId, 'SUBCATEGORY_UPDATED', 'subcategory', id, rows[0].name, { name, is_active }, req.ip);
    res.json({ success: true, subcategory: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Subcategory already exists in this category' });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const delRes = await pool.query(`DELETE FROM subcategories WHERE id = $1 RETURNING name`, [id]);
    if (!delRes.rowCount) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    logAdminAudit(req.session?.userId, 'SUBCATEGORY_DELETED', 'subcategory', id, delRes.rows[0].name, {}, req.ip);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, listAdmin, create, update, remove };
