const pool = require('../db/pool');
const { definition, uuid } = require('../services/templateService');
const { logAdminAudit } = require('./adminAuditController');

async function list(req, res, next) {
  try {
    const adminView = (req.access.admin || req.access.permissions['templates.view']) && req.query.all === 'true';
    const { rows } = await pool.query(`SELECT id, name, fields, is_active, updated_at FROM ticket_templates ${adminView ? '' : 'WHERE is_active = true'} ORDER BY LOWER(name)`);
    res.json({ success: true, templates: rows });
  } catch (error) { next(error); }
}
async function save(req, res, next) {
  try {
    const data = definition(req.body);
    const id = req.params.id;
    if (id && !uuid(id)) return res.status(400).json({ success: false, message: 'Invalid template identifier.' });
    const args = [data.name, JSON.stringify(data.fields), req.body.is_active !== false, req.session.userId];
    let result;
    if (id) {
      result = await pool.query('UPDATE ticket_templates SET name=$1, fields=$2, is_active=$3, updated_by=$4, updated_at=NOW() WHERE id=$5 RETURNING *', [...args, id]);
    } else {
      result = await pool.query('INSERT INTO ticket_templates (name,fields,is_active,created_by,updated_by) VALUES ($1,$2,$3,$4,$4) RETURNING *', args);
    }
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found.' });
    const template = result.rows[0];
    await logAdminAudit(req.session.userId, id ? 'TEMPLATE_UPDATED' : 'TEMPLATE_CREATED', 'ticket_template', template.id, template.name, { fields: template.fields.length, is_active: template.is_active }, req.ip);
    res.status(id ? 200 : 201).json({ success: true, template });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A template with this name already exists.' });
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
}
module.exports = { list, save };
