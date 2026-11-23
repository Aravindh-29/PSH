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
      WHERE u.deleted_at IS NULL AND g.is_active=true AND EXISTS(
SELECT 1 FROM assignment_groups scope WHERE scope.id=ANY($1::uuid[])
AND (g.id=scope.id OR g.parent_id=scope.id OR g.id=scope.parent_id))
      GROUP BY u.id,r.name ORDER BY u.full_name,u.id`, [req.access.managedGroups]);
    res.json({ success: true, users: rows });
  } catch (error) { next(error); }
}

async function create(req,res,next){
  return require('./departmentController').add(req,res,next);
}

module.exports = { list, create };
