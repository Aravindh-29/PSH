const {uuid}=require('./context');
const fail=message=>{throw Object.assign(new Error(message),{status:400})};
const deny=()=>{throw Object.assign(new Error("You don't have permission to access this department or sub department."),{status:403})};
async function lock(client){await client.query('SELECT pg_advisory_xact_lock(73642011)')}
async function fresh(client,req){
 if(req.access.admin)return req.access;
 const row=(await client.query(`SELECT u.id,u.role,u.is_active,u.deleted_at,r.is_active AS active,r.role_kind,r.permissions,
 ARRAY(SELECT group_id FROM user_managed_groups WHERE user_id=u.id) AS managed
 FROM users u JOIN access_roles r ON r.key=u.role WHERE u.id=$1 FOR SHARE OF u,r`,[req.access.userId])).rows[0];
 if(!row||!row.is_active||row.deleted_at||!row.active)deny();
 return {...req.access,role:row.role,roleKind:row.role_kind,permissions:row.permissions,managedGroups:require('./managedAccess').canManage(row)?row.managed:[]};
}
async function node(client,id){
 if(!uuid(id))fail('Invalid department or sub department.');
 const result=await client.query(`SELECT g.*,r.name AS region_name,c.name AS country_name,p.name AS department_name
 FROM assignment_groups g LEFT JOIN organization_regions r ON r.id=g.region_id
 LEFT JOIN organization_countries c ON c.id=g.country_id LEFT JOIN assignment_groups p ON p.id=g.parent_id WHERE g.id=$1`,[id]);
 if(!result.rowCount)throw Object.assign(new Error('Department or sub department not found.'),{status:404});return result.rows[0];
}
function covers(access,g){return access.admin||access.managedGroups.includes(g.id)||!!g.parent_id&&access.managedGroups.includes(g.parent_id)}
async function checkGroups(client,ids){
 if(!Array.isArray(ids)||ids.length>200||ids.some(id=>!uuid(id))||new Set(ids).size!==ids.length)fail('Select valid unique departments and sub departments.');
 const rows=(await client.query(`SELECT g.* FROM assignment_groups g LEFT JOIN assignment_groups p ON p.id=g.parent_id
 WHERE g.id=ANY($1::uuid[]) AND g.is_active AND (g.parent_id IS NULL OR p.is_active)`,[ids])).rows;
 if(rows.length!==ids.length)fail('One or more departments or sub departments are inactive or missing.');return rows;
}
async function validateMembership(client,ids){
 return checkGroups(client,ids);
}
async function addMembers(client,req,ids,userIds){
 const access=await fresh(client,req);
 if(!access.admin&&!access.permissions['departments.members']&&!access.permissions['users.team_add'])deny();
 if(!Array.isArray(userIds)||!userIds.length||userIds.length>200||userIds.some(id=>!uuid(id))||new Set(userIds).size!==userIds.length)fail('Select valid users.');
 const targets=await checkGroups(client,ids);if(!targets.length)fail('Select at least one department or sub department.');
 if(targets.some(g=>!covers(access,g)))deny();
 // Lock user IDs in a consistent order. Every membership writer takes the same access lock.
 const users=(await client.query('SELECT id,role FROM users WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL AND is_active ORDER BY id FOR UPDATE',[userIds])).rows;
 if(users.length!==userIds.length)fail('One or more users are inactive or missing.');
 for(const user of users){
   const prior=(await client.query('SELECT group_id FROM user_groups WHERE user_id=$1',[user.id])).rows.map(g=>g.group_id);
   if(!access.admin){
     if(user.role==='admin'||prior.length)deny();
     if((await client.query('SELECT 1 FROM user_managed_groups WHERE user_id=$1',[user.id])).rowCount)deny();
   }
   await validateMembership(client,[...new Set([...prior,...ids])]);
   for(const id of ids)await client.query('INSERT INTO user_groups(user_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,id]);
 }
}
module.exports={fail,deny,lock,fresh,node,covers,checkGroups,validateMembership,addMembers};
