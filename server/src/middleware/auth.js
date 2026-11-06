const pool = require('../db/pool');
const { context } = require('../access/context');
const { authorize } = require('../access/policy');
async function requireAuth(req, res, next) {
  if (req.access) return next();
  if (!req.session?.userId) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const { rows } = await pool.rawQuery(`SELECT u.id,u.username,u.full_name,u.email,u.role,u.is_active,u.deleted_at,
      r.name AS role_name,r.permissions,r.assignable_roles,r.is_active AS role_active,r.version,
      ARRAY(SELECT group_id FROM user_managed_groups WHERE user_id=u.id) AS managed_groups, ARRAY(SELECT group_id FROM user_groups WHERE user_id=u.id) AS member_groups
      FROM users u JOIN access_roles r ON r.key=u.role WHERE u.id=$1`,[req.session.userId]);
    const user=rows[0];
    if (!user || !user.is_active || user.deleted_at || !user.role_active) {
      req.session.destroy(()=>{});
      return res.status(401).json({ success:false,message:'Your account or role is inactive. Please contact your administrator.' });
    }
    req.session.role=user.role;
    req.access={userId:user.id,admin:user.role==='admin',custom:user.role!=='admin' && user.role!=='employee',role:user.role,roleName:user.role_name,permissions:user.permissions,assignableRoles:user.assignable_roles,managedGroups:user.managed_groups,memberGroups:user.member_groups};
    req.authUser={id:user.id,username:user.username,fullName:user.full_name,email:user.email,role:user.role,roleName:user.role_name,permissions:user.permissions,managedGroups:user.managed_groups,memberGroups:user.member_groups,assignableRoles:user.assignable_roles,roleVersion:user.version};
    await authorize(req,pool);
    context.run(req,()=>next());
  } catch(error) {
    if(error.status) return res.status(error.status).json({success:false,code:error.code,message:error.message});
    next(error);
  }
}
// Compatibility wrapper: the centralized route policy now checks the precise action.
const requireAdmin = requireAuth;
module.exports={requireAuth,requireAdmin};
