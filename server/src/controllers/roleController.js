const pool=require('../db/pool');
const {randomUUID}=require('node:crypto');
const {catalog,keys}=require('../access/catalog');
const {need,forbidden}=require('../access/policy');
const {lock,fail}=require('../access/users');
const {logAdminAudit}=require('./adminAuditController');
function validate(body) {
  if(typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>150) fail('Role name is required (up to 150 characters).');
  if(typeof body.responsibility!=='string' || body.responsibility.length>2000) fail('Responsibility must be text up to 2000 characters.');
  if(!body.permissions || typeof body.permissions!=='object' || Array.isArray(body.permissions)) fail('Select role permissions.');
  for(const [key,value] of Object.entries(body.permissions)) {
    const p=catalog.find(p=>p.key===key);
    if(!p || !(p.scoped?['own','groups','all','related']:['all']).includes(value)) fail('Invalid permission or record scope.');
  }
  for(const p of catalog.filter(p=>body.permissions[p.key])) for(const dependency of p.requires||[]) if(!body.permissions[dependency]) fail(`${p.label} requires ${catalog.find(p=>p.key===dependency)?.label||dependency}.`);
  if(!Array.isArray(body.assignable_roles) || body.assignable_roles.some(k=>typeof k!=='string' || k.length>64)) fail('Choose valid assignable roles.');
  for(const p of catalog.filter(p=>p.scoped && body.permissions[p.key] && !p.key.startsWith('tickets.'))) if(!body.permissions['tickets.view']) fail(`${p.label} requires View tickets.`);
  for(const key of Object.keys(body.permissions).filter(k=>k.startsWith('tickets.') && k!=='tickets.view' && k!=='tickets.create')) if(!body.permissions['tickets.view']) fail('Ticket actions require View tickets.');
  if(body.permissions['roles.permissions'] && !body.permissions['roles.view']) fail('Changing permissions requires View roles.');
}
function delegate(req,permissions,assignable) {
  if(req.access.admin) return;
  for(const [key,value] of Object.entries(permissions)) {
    const own=req.access.permissions[key];
    if(!own || own!== 'all' && value!==own) throw forbidden();
  }
  if(assignable.includes('admin') || assignable.some(k=>!req.access.assignableRoles.includes(k))) throw forbidden();
}
async function list(req,res,next) {
  try {
    const {rows}=await pool.query(`SELECT r.*,COUNT(u.id) FILTER(WHERE u.deleted_at IS NULL)::int AS user_count FROM access_roles r LEFT JOIN users u ON u.role=r.key GROUP BY r.key ORDER BY r.is_system DESC,LOWER(r.name)`);
    const filtered=req.path==='/assignable' ? rows.filter(r=>r.is_active && (req.access.admin || req.access.assignableRoles.includes(r.key) && r.key!=='admin')) : rows;
    res.json({success:true,roles:filtered,catalog});
  } catch(e){next(e)}
}
async function save(req,res,next) {
  const client=await pool.connect();
  try {
    validate(req.body);
    await client.query('BEGIN'); await lock(client);
    const key=req.params.key || randomUUID();
    const prior=(await client.query('SELECT * FROM access_roles WHERE key=$1 FOR UPDATE',[key])).rows[0];
    if(req.params.key && !prior) throw Object.assign(new Error('Role not found'),{status:404});
    if(key==='admin') fail('The built-in Admin role is protected.');
    if(prior && !req.access.admin && (key===req.access.role || prior.is_system)) throw forbidden();
    if(prior && req.body.version!==prior.version) throw Object.assign(new Error('This role changed in another session. Reload before saving.'),{status:409});
    if(prior) delegate(req,prior.permissions,prior.assignable_roles);
    const permissions=req.body.permissions, assignable=[...new Set(req.body.assignable_roles)];
    delegate(req,permissions,assignable);
    if(prior) {
      if(prior.name!==req.body.name.trim()||prior.responsibility!==req.body.responsibility.trim()) need(req,'roles.edit');
      if(JSON.stringify(prior.permissions)!==JSON.stringify(permissions) || JSON.stringify(prior.assignable_roles)!==JSON.stringify(assignable)) need(req,'roles.permissions');
      if(prior.is_active!==(req.body.is_active!==false)) need(req,'roles.status');
    } else if(Object.keys(permissions).length) need(req,'roles.permissions');
    if(assignable.length) {
      const found=await client.query('SELECT key FROM access_roles WHERE key=ANY($1::varchar[]) AND is_active=true',[assignable]);
      if(found.rowCount!==assignable.length) fail('An assignable role no longer exists or is inactive.');
    }
    if(req.body.is_active===false) {
      if(prior?.is_system) fail('Built-in roles cannot be deactivated.');
      const count=await client.query('SELECT COUNT(*) FROM users WHERE role=$1 AND deleted_at IS NULL',[key]);
      if(Number(count.rows[0].count)) fail('Reassign users before deactivating their role.');
    }
    const args=[key,req.body.name.trim(),req.body.responsibility.trim(),JSON.stringify(permissions),JSON.stringify(assignable),req.body.is_active!==false];
    const result=prior ? await client.query('UPDATE access_roles SET name=$2,responsibility=$3,permissions=$4,assignable_roles=$5,is_active=$6,version=version+1,updated_at=NOW() WHERE key=$1 RETURNING *',args) : await client.query('INSERT INTO access_roles(key,name,responsibility,permissions,assignable_roles,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',args);
    await client.query('INSERT INTO access_role_history(role_key,actor_id,before_value,after_value) VALUES($1,$2,$3,$4)',[key,req.access.userId,prior?JSON.stringify(prior):null,JSON.stringify(result.rows[0])]);
    await client.query('COMMIT');
    await logAdminAudit(req.access.userId,prior?'ROLE_UPDATED':'ROLE_CREATED','role',key,req.body.name,{permission_count:Object.keys(permissions).length},req.ip);
    res.status(prior?200:201).json({success:true,role:result.rows[0]});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); if(e.code==='23505') e=Object.assign(new Error('Role name already exists.'),{status:409}); next(e); }
  finally {client.release()}
}
async function remove(req,res,next) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await lock(client);
    const role=(await client.query('SELECT * FROM access_roles WHERE key=$1 FOR UPDATE',[req.params.key])).rows[0];
    if(!role) throw Object.assign(new Error('Role not found'),{status:404});
    if(role.is_system || role.key===req.access.role) fail('This role is protected.');
    delegate(req,role.permissions,role.assignable_roles);
    const count=await client.query('SELECT COUNT(*) FROM users WHERE role=$1',[role.key]);
    if(Number(count.rows[0].count)) fail('Roles referenced by user accounts cannot be deleted. Deactivate an unused role instead.');
    await client.query('DELETE FROM access_roles WHERE key=$1',[role.key]);
    await client.query('INSERT INTO access_role_history(role_key,actor_id,before_value) VALUES($1,$2,$3)',[role.key,req.access.userId,JSON.stringify(role)]);
    await client.query('COMMIT');res.json({success:true});
  } catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
}
async function history(req,res,next) {
  try{const {rows}=await pool.query('SELECT h.*,u.full_name AS actor_name FROM access_role_history h LEFT JOIN users u ON u.id=h.actor_id WHERE role_key=$1 ORDER BY h.created_at DESC LIMIT 100',[req.params.key]);res.json({success:true,history:rows})}catch(e){next(e)}
}
module.exports={list,save,remove,history};
