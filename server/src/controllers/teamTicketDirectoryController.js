const pool=require('../db/pool');
const {managedMembership,requireManagedUser}=require('../access/managedUsers');

async function directory(req,res,next){
  try{
    const id=req.params.id;
    if(id)await requireManagedUser(req,pool,id);
    const params=[req.access.managedGroups];
    if(id)params.push(id);
    const result=await pool.query(`SELECT u.id,u.username,u.full_name,u.email,u.role,u.is_active,u.created_at,u.deleted_at,r.name AS role_name,
      COUNT(t.id) AS ticket_count,
      COUNT(t.id) FILTER(WHERE t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
      COUNT(t.id) FILTER(WHERE t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
      COUNT(t.id) FILTER(WHERE t.priority='CRITICAL') AS critical_count
      FROM users u JOIN access_roles r ON r.key=u.role
      LEFT JOIN tickets t ON (t.assigned_to=u.id OR (t.assigned_to IS NULL AND t.created_by=u.id)) AND t.deleted_at IS NULL
      WHERE u.deleted_at IS NULL AND ${managedMembership('u','$1')} ${id?'AND u.id=$2':''}
      GROUP BY u.id,r.name ORDER BY u.full_name,u.id`,params);
    res.json({success:true,...(id?{user:result.rows[0]}:{users:result.rows})});
  }catch(error){next(error)}
}
module.exports={directory};
