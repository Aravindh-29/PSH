const pool   = require('../db/pool');
const argon2 = require('argon2');
const { logAdminAudit } = require('./adminAuditController');

async function verifyAdminPassword(userId, plain) {
  if (!plain) return false;
  const row = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!row.rows.length) return false;
  return argon2.verify(row.rows[0].password_hash, plain);
}

async function list(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT g.id, g.name, g.description, g.is_active, g.created_at, g.updated_at,
             COUNT(ug.user_id)::int AS member_count
      FROM assignment_groups g
      LEFT JOIN user_groups ug ON ug.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `);
    res.json({ success: true, groups: rows });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT g.id, g.name, g.description, g.is_active, g.created_at, g.updated_at
      FROM assignment_groups g WHERE g.id = $1
    `, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Group not found' });

    const { rows: members } = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.role, u.is_active
      FROM users u
      JOIN user_groups ug ON ug.user_id = u.id
      WHERE ug.group_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.full_name
    `, [id]);

    res.json({ success: true, group: rows[0], members });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, description = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Group name is required' });
    const { rows } = await pool.query(
      `INSERT INTO assignment_groups (name, description) VALUES ($1, $2) RETURNING *`,
      [name.trim(), description.trim()]
    );
    logAdminAudit(req.session?.userId, 'GROUP_CREATED', 'group', rows[0].id, rows[0].name, { description }, req.ip);
    res.status(201).json({ success: true, group: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Group name already exists' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;
    const { rows } = await pool.query(`
      UPDATE assignment_groups
      SET name        = COALESCE($1, name),
          description = COALESCE($2, description),
          is_active   = COALESCE($3, is_active),
          updated_at  = NOW()
      WHERE id = $4 RETURNING *
    `, [name?.trim() || null, description ?? null, is_active ?? null, id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Group not found' });
    logAdminAudit(req.session?.userId, 'GROUP_UPDATED', 'group', rows[0].id, rows[0].name, { name, description, is_active }, req.ip);
    res.json({ success: true, group: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Group name already exists' });
    next(err);
  }
}

async function remove(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { adminPassword } = req.body || {};
    const valid = await verifyAdminPassword(req.session.userId, adminPassword);
    if (!valid) return res.status(403).json({ success: false, message: 'Incorrect password' });

    await client.query('BEGIN');
    const nameRes = await client.query('SELECT name FROM assignment_groups WHERE id = $1', [id]);
    const groupName = nameRes.rows[0]?.name || id;
    // Detach tickets from this group before deleting
    await client.query(`UPDATE tickets SET assignment_group_id = NULL WHERE assignment_group_id = $1`, [id]);
    // Remove all member associations
    await client.query(`DELETE FROM user_groups WHERE group_id = $1`, [id]);
    // Now delete the group
    const { rowCount } = await client.query(`DELETE FROM assignment_groups WHERE id = $1`, [id]);
    await client.query('COMMIT');

    if (!rowCount) return res.status(404).json({ success: false, message: 'Group not found' });
    logAdminAudit(req.session?.userId, 'GROUP_DELETED', 'group', id, groupName, {}, req.ip);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Add / remove members (batch set)
async function setMembers(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { userIds = [] } = req.body;
    await client.query('BEGIN');
    const nameRes2 = await client.query('SELECT name FROM assignment_groups WHERE id = $1', [id]);
    const groupName2 = nameRes2.rows[0]?.name || id;
    await client.query(`DELETE FROM user_groups WHERE group_id = $1`, [id]);
    for (const uid of userIds) {
      await client.query(`INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [uid, id]);
    }
    await client.query('COMMIT');
    logAdminAudit(req.session?.userId, 'GROUP_MEMBERS_SET', 'group', id, groupName2, { userCount: userIds.length }, req.ip);
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
}

async function addMember(req, res, next) {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    await pool.query(`INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function removeMember(req, res, next) {
  try {
    const { id, userId } = req.params;
    await pool.query(`DELETE FROM user_groups WHERE group_id = $1 AND user_id = $2`, [id, userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// Get all users with their group memberships (for dropdowns)
async function listWithMembers(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT g.id, g.name, g.is_active,
             COALESCE(
               json_agg(json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email))
               FILTER (WHERE u.id IS NOT NULL),
               '[]'
             ) AS members
      FROM assignment_groups g
      LEFT JOIN user_groups ug ON ug.group_id = g.id
      LEFT JOIN users u ON u.id = ug.user_id AND u.deleted_at IS NULL
      WHERE g.is_active = TRUE
      GROUP BY g.id
      ORDER BY g.name
    `);
    res.json({ success: true, groups: rows });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, remove, setMembers, addMember, removeMember, listWithMembers };
