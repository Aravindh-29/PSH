const { uuid } = require('./context');
const { need, forbidden } = require('./policy');
const fail = message => { throw Object.assign(new Error(message),{status:400}); };
async function lock(client) { await client.query('SELECT pg_advisory_xact_lock(73642011)'); }
async function assignRole(client, req, role) {
  if (typeof role !== 'string') fail('Select a valid role.');
  const row = await client.query("SELECT * FROM access_roles WHERE (key=$1 OR LOWER(name)=LOWER($1) OR ($1='User / Employee' AND role_kind='user')) AND is_active=true AND role_kind IS NOT NULL",[role]);
  if (!row.rowCount) fail('Role not found or inactive.');
  if (!req.access.admin && (!req.access.assignableRoles.includes(row.rows[0].key) || row.rows[0].key === 'admin')) throw forbidden();
  need(req,'users.assign_role');
  return row.rows[0];
}
async function groups(client, req, ids) {
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id=>!uuid(id)) || new Set(ids).size!==ids.length) fail('Select valid, unique departments.');
  if (!req.access.admin && ids.some(id=>!req.access.managedGroups.includes(id))) throw forbidden();
  const result=await client.query('SELECT id FROM assignment_groups WHERE id=ANY($1::uuid[]) AND is_active=true',[ids]);
  if(result.rowCount!==ids.length) fail('One or more selected departments are inactive or missing.');
}
async function setGroups(client,req,userId,body) {
  const role=(await client.query('SELECT r.* FROM users u JOIN access_roles r ON r.key=u.role WHERE u.id=$1',[userId])).rows[0];
  const selected=body.managedGroupIds===undefined
    ? (await client.query('SELECT group_id FROM user_managed_groups WHERE user_id=$1',[userId])).rows.map(r=>r.group_id)
    : body.managedGroupIds;
  if (!Array.isArray(selected)) fail('Select valid managed departments.');
  if (selected.length && !require('./managedAccess').isManager(role)) fail('Only Manager users can have managed departments. Remove managed assignments or select Manager.');
  for (const [field,table] of [['groupIds','user_groups'],['managedGroupIds','user_managed_groups']]) {
    if(body[field]===undefined) continue;
    if(!req.access.admin)throw forbidden();
    const existing=(await client.query(`SELECT group_id FROM ${table} WHERE user_id=$1`,[userId])).rows.map(r=>r.group_id).sort();
    if(Array.isArray(body[field])&&JSON.stringify(existing)===JSON.stringify([...body[field]].sort()))continue;
    await groups(client,req,body[field]);
    await require('./organization').checkGroups(client,body[field]);
    if(field==='groupIds')await require('./organization').validateMembership(client,body[field]);
    await client.query(`DELETE FROM ${table} WHERE user_id=$1`,[userId]);
    for(const id of body[field]) await client.query(`INSERT INTO ${table}(user_id,group_id) VALUES($1,$2)`,[userId,id]);
  }
}
async function target(client,req,id,body={}) {
  if(!uuid(id)) fail('Invalid user identifier.');
  const result=await client.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
  if(!result.rowCount) throw Object.assign(new Error('User not found'),{status:404});
  const user=result.rows[0];
  if(!req.access.admin && (user.role==='admin' || user.role===req.access.role || !req.access.assignableRoles.includes(user.role))) throw forbidden();
  if(id===req.access.userId && (body.role!==undefined && body.role!==user.role || body.isActive===false || body.deleting)) fail('You cannot change your own role, deactivate, or delete your own account.');
  if(user.role==='admin' && (body.role && body.role!=='admin' || body.isActive===false || body.deleting)) {
    const count=await client.query("SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=true AND deleted_at IS NULL AND id<>$1",[id]);
    if(Number(count.rows[0].count)===0) fail('The last active administrator must be retained.');
  }
  return user;
}
module.exports={lock,assignRole,groups,setGroups,target,fail};
