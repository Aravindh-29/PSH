const pool = require('../db/pool');
const argon2 = require('argon2');

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

// Active fields for form rendering (used by Create/Edit Ticket)
async function getFields(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM ticket_fields WHERE is_active = true ORDER BY field_order ASC');
    res.json({ success: true, fields: result.rows });
  } catch (err) { next(err); }
}

// All fields for Configuration page (admin only)
async function getAdminFields(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM ticket_fields ORDER BY field_order ASC, id ASC');
    res.json({ success: true, fields: result.rows });
  } catch (err) { next(err); }
}

async function createField(req, res, next) {
  try {
    const { label, field_type, is_required = false, placeholder = '', options = [] } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ success: false, message: 'label is required' });
    const validTypes = ['text', 'textarea', 'dropdown', 'number'];
    if (!validTypes.includes(field_type)) return res.status(400).json({ success: false, message: 'Invalid field_type' });

    const field_key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
    const maxRes = await pool.query('SELECT COALESCE(MAX(field_order), 0) + 10 AS next_order FROM ticket_fields');
    const field_order = maxRes.rows[0].next_order;

    const result = await pool.query(
      `INSERT INTO ticket_fields (field_key, label, field_type, is_required, is_system, is_active, field_order, placeholder, options)
       VALUES ($1,$2,$3,$4,false,true,$5,$6,$7) RETURNING *`,
      [field_key, label.trim(), field_type, is_required, field_order, placeholder, JSON.stringify(options)]
    );
    res.status(201).json({ success: true, field: result.rows[0] });
  } catch (err) { next(err); }
}

async function updateField(req, res, next) {
  try {
    const { id } = req.params;
    const { label, is_required, is_active, is_system, field_order, placeholder, options } = req.body;

    const existing = await pool.query('SELECT * FROM ticket_fields WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Field not found' });
    const f = existing.rows[0];

    const result = await pool.query(
      `UPDATE ticket_fields SET
        label=$1, is_required=$2, is_active=$3, is_system=$4, field_order=$5, placeholder=$6, options=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [
        label       !== undefined ? label       : f.label,
        is_required !== undefined ? is_required : f.is_required,
        is_active   !== undefined ? is_active   : f.is_active,
        is_system   !== undefined ? is_system   : f.is_system,
        field_order !== undefined ? field_order : f.field_order,
        placeholder !== undefined ? placeholder : f.placeholder,
        JSON.stringify(options !== undefined ? options : (Array.isArray(f.options) ? f.options : [])),
        id,
      ]
    );
    res.json({ success: true, field: result.rows[0] });
  } catch (err) { next(err); }
}

async function deleteField(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM ticket_fields WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Field not found' });
    if (existing.rows[0].is_system) return res.status(400).json({ success: false, message: 'Field is locked. Unlock it first to delete.' });
    await pool.query('DELETE FROM ticket_fields WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function createCategory(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'name is required' });
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name.trim(), description || null]
    );
    if (result.rows.length === 0) return res.status(400).json({ success: false, message: 'Category already exists' });
    res.status(201).json({ success: true, category: result.rows[0] });
  } catch (err) { next(err); }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;
    const result = await pool.query(
      'UPDATE categories SET name=COALESCE($1,name), is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING *',
      [name || null, is_active ?? null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category: result.rows[0] });
  } catch (err) { next(err); }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { force } = req.query;
    const countRes = await pool.query('SELECT COUNT(*) FROM tickets WHERE category_id=$1 AND deleted_at IS NULL', [id]);
    const count = parseInt(countRes.rows[0].count);
    if (count > 0 && force !== 'true') {
      return res.status(409).json({ success: false, inUse: true, count, message: `${count} ticket${count > 1 ? 's' : ''} use this category` });
    }
    const result = await pool.query('DELETE FROM categories WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function resetFields(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    if (userRes.rows.length === 0) return res.status(401).json({ success: false, message: 'User not found' });

    const valid = await argon2.verify(userRes.rows[0].password_hash, password);
    if (!valid) return res.status(401).json({ success: false, message: 'Incorrect password' });

    await pool.query('DELETE FROM ticket_fields');
    await pool.query(`
      INSERT INTO ticket_fields (field_key, label, field_type, is_required, is_system, is_active, field_order, placeholder, options)
      VALUES
        ('customer_name',    'Customer / Client',   'text',     true,  true, true, 10, 'e.g. TechCorp Inc.',           '[]'::jsonb),
        ('module_text',      'Module',              'text',     true,  true, true, 20, 'e.g. Cloud, Storage, Network', '[]'::jsonb),
        ('category_id',      'Category',            'category', true,  true, true, 30, '',                             '[]'::jsonb),
        ('status',           'Status',              'dropdown', true,  true, true, 40, '',
          '[{"label":"New","value":"NEW"},{"label":"Open","value":"OPEN"},{"label":"In Progress","value":"IN_PROGRESS"},{"label":"Work In Progress","value":"WORK_IN_PROGRESS"},{"label":"Pending","value":"PENDING"},{"label":"On Hold","value":"ON_HOLD"},{"label":"Resolved","value":"RESOLVED"},{"label":"Closed","value":"CLOSED"},{"label":"Reopened","value":"REOPENED"},{"label":"Cancelled","value":"CANCELLED"}]'::jsonb),
        ('priority',         'Priority',            'dropdown', true,  true, true, 50, '',
          '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"},{"label":"Critical","value":"CRITICAL"}]'::jsonb),
        ('impact',           'Impact',              'dropdown', false, true, true, 60, '',
          '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"}]'::jsonb),
        ('urgency',          'Urgency',             'dropdown', false, true, true, 70, '',
          '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"}]'::jsonb),
        ('short_description','Short Description',   'text',     true,  true, true, 80, 'Brief summary of the issue',   '[]'::jsonb),
        ('description',      'Detailed Description','textarea', true,  true, true, 90, 'Provide full details...',      '[]'::jsonb)
    `);

    res.json({ success: true, message: 'Fields reset to defaults successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  getModules, getCategories, getUsers,
  getFields, getAdminFields, createField, updateField, deleteField,
  createCategory, updateCategory, deleteCategory, resetFields,
};
