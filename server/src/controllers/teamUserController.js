const pool = require('../db/pool');
const { need, forbidden } = require('../access/policy');
const { lock, fail } = require('../access/users');
const { createAccount } = require('./userController');
const { logAdminAudit } = require('./adminAuditController');

async function list(req, res, next) {
  try {
    need(req, 'users.team_view');
    const { rows } = await pool.query(`SELECT u.id,u.username,u.full_name,u.email,u.role,u.is_active,
      r.name AS role_name,
      json_agg(json_build_object('id',g.id,'name',g.name) ORDER BY g.name) AS groups
      FROM users u JOIN user_groups ug ON ug.user_id=u.id
      JOIN assignment_groups g ON g.id=ug.group_id
      JOIN access_roles r ON r.key=u.role
      WHERE u.deleted_at IS NULL AND g.is_active=true AND g.id=ANY($1::uuid[])
      GROUP BY u.id,r.name ORDER BY u.full_name,u.id`, [req.access.managedGroups]);
    res.json({ success: true, users: rows });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  const client = await pool.connect();
  try {
    need(req, 'users.team_create'); need(req, 'users.team_view');
    await client.query('BEGIN'); await lock(client);
    // Re-read the manager's authority after acquiring the shared access lock.
    // This prevents a concurrent Admin change from leaving stale creation rights.
    const caller = (await client.query(`SELECT u.is_active,u.deleted_at,r.is_active AS role_active,r.permissions,
      ARRAY(SELECT group_id FROM user_managed_groups WHERE user_id=u.id) AS managed_groups
      FROM users u JOIN access_roles r ON r.key=u.role WHERE u.id=$1 FOR SHARE OF u,r`, [req.access.userId])).rows[0];
    if (!caller || !caller.is_active || caller.deleted_at || !caller.role_active ||
        !caller.permissions['users.team_create'] || !caller.permissions['users.team_view']) throw forbidden();
    const scopedReq = { ...req, access: { ...req.access, admin:false, permissions:caller.permissions, managedGroups:caller.managed_groups } };
    if (!caller.managed_groups.length) fail('Ask an administrator to select your Managed Groups before creating team users.');
    const user = await createAccount(client, scopedReq, req.body, { team:true });
    await client.query('COMMIT');
    await logAdminAudit(req.access.userId,'USER_CREATED','user',user.id,user.full_name,
      { role:user.role, groupIds:req.body.groupIds, created_via:'managed_team' },req.ip);
    res.status(201).json({ success:true, user });
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    if (error.code==='23505') error=Object.assign(new Error('Username or email already exists.'),{status:409});
    next(error);
  } finally { client.release(); }
}

module.exports = { list, create };
