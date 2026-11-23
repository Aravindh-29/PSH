const pool=require('../db/pool');
const org=require('../access/organization');
const {logAdminAudit}=require('./adminAuditController');
const allow=(req,key)=>{if(!req.access.admin&&!req.access.permissions[key])org.deny()};
const admin=req=>{if(!req.access.admin)org.deny()};
const error=e=>{if(['23505','23514','23503'].includes(e.code))return Object.assign(new Error(e.code==='23505'?'That name already exists in the selected region or department.':e.code==='23503'?'This record is still in use. Deactivate it instead.':e.message),{status:400});return e};
async function transaction(req,res,next,action){
 const c=await pool.connect();try{await c.query('BEGIN');await org.lock(c);const result=await action(c);await c.query('COMMIT');res.json({success:true,...result})}catch(e){await c.query('ROLLBACK').catch(()=>{});next(error(e))}finally{c.release()}
}
async function tree(req,res,next){try{
 if(!req.access.admin&&!['departments.view','tickets.view','tickets.create','users.view','users.team_view'].some(k=>req.access.permissions[k]))org.deny();
 const all=(await pool.query(`SELECT g.*,r.name AS region_name,c.name AS country_name,p.name AS department_name
 FROM assignment_groups g LEFT JOIN organization_regions r ON r.id=g.region_id LEFT JOIN organization_countries c ON c.id=g.country_id
 LEFT JOIN assignment_groups p ON p.id=g.parent_id ORDER BY LOWER(COALESCE(p.name,g.name)),g.parent_id NULLS FIRST,LOWER(g.name)`)).rows;
 const selected=req.query.ticket==='true'?(req.access.permissions['tickets.view']==='all'&&req.query.routing!=='true'?all.map(g=>g.id):[...req.access.managedGroups,...req.access.memberGroups]):req.access.admin?all.map(g=>g.id):req.access.managedGroups;
 const groups=all.filter(g=>req.access.admin||selected.includes(g.id)||selected.includes(g.parent_id)||!g.parent_id&&all.some(child=>child.parent_id===g.id&&selected.includes(child.id))).map(g=>({...g,full_control:org.covers(req.access,g),can_select:req.access.admin||selected.includes(g.id)||selected.includes(g.parent_id),label:(g.department_name?g.department_name+' / ':'')+g.name+(g.country_name?' — '+g.country_name:g.region_name?' ('+g.region_name+')':'' )}));
 const settings=(await pool.query('SELECT * FROM organization_settings WHERE id=1')).rows[0];res.json({success:true,groups,settings});
}catch(e){next(e)}}
async function geography(req,res,next){try{allow(req,'departments.view');const regions=(await pool.query('SELECT * FROM organization_regions ORDER BY name')).rows,countries=(await pool.query('SELECT * FROM organization_countries ORDER BY name')).rows;res.json({success:true,regions,countries})}catch(e){next(e)}}
async function saveGeography(req,res,next){return transaction(req,res,next,async c=>{
 admin(req);const {kind,id,name,regionId,is_active=true}=req.body;if(!['region','country'].includes(kind)||typeof name!=='string'||!name.trim()||name.length>150||typeof is_active!=='boolean')org.fail('Enter a valid name and status.');
 if(kind==='country'){
   if(!(await c.query('SELECT 1 FROM organization_regions WHERE id=$1 AND is_active',[regionId])).rowCount)org.fail('Select an active region.');
   if(id&&(await c.query('SELECT 1 FROM assignment_groups WHERE country_id=$1 AND region_id<>$2',[id,regionId])).rowCount)org.fail('This country is in use. Its region cannot be changed.');
 }
 const table=kind==='region'?'organization_regions':'organization_countries';
 const row=id?(await c.query(`UPDATE ${table} SET name=$2,is_active=$3${kind==='country'?',region_id=$4':''} WHERE id=$1 RETURNING *`,kind==='country'?[id,name.trim(),is_active,regionId]:[id,name.trim(),is_active])).rows[0]:(await c.query(`INSERT INTO ${table}(name,is_active${kind==='country'?',region_id':''}) VALUES($1,$2${kind==='country'?',$3':''}) RETURNING *`,kind==='country'?[name.trim(),is_active,regionId]:[name.trim(),is_active])).rows[0];
 if(!row)org.fail('Value not found.');return{value:row};
})}
async function settings(req,res,next){return transaction(req,res,next,async c=>{
 admin(req);if(req.method==='GET')return{settings:(await c.query('SELECT * FROM organization_settings WHERE id=1')).rows[0]};
 if(req.body.allow_multiple!==true)org.fail('Multiple membership is always enabled. Manage membership using department and sub department checkboxes.');
 return{settings:(await c.query('SELECT * FROM organization_settings WHERE id=1')).rows[0]};
})}
async function detail(req,res,next){try{
 allow(req,'departments.view');const g=await org.node(pool,req.params.id);
 const children=(await pool.query('SELECT * FROM assignment_groups WHERE parent_id=$1 ORDER BY name',[g.id])).rows;
 if(!org.covers(req.access,g)&&!children.some(child=>org.covers(req.access,child)))org.deny();
 const visibleChildren=children.filter(child=>org.covers(req.access,child));
 const managementIds=[g.id,...g.parent_id?[g.parent_id]:[],...visibleChildren.map(child=>child.id)];
 const managers=(await pool.rawQuery(`SELECT u.id,u.full_name,u.username,u.email,u.is_active,
  jsonb_agg(jsonb_build_object('group_id',mg.id,'name',mg.name,'whole_department',mg.parent_id IS NULL,'inherited',mg.id=$2::uuid) ORDER BY mg.name) AS responsibilities
  FROM user_managed_groups um JOIN users u ON u.id=um.user_id
  JOIN access_roles r ON r.key=u.role AND r.is_active AND r.role_kind='manager'
  JOIN assignment_groups mg ON mg.id=um.group_id
  WHERE um.group_id=ANY($1::uuid[]) AND u.deleted_at IS NULL
  GROUP BY u.id ORDER BY LOWER(u.full_name),u.id`,[managementIds,g.parent_id||null])).rows;
 res.json({success:true,group:{...g,full_control:org.covers(req.access,g)},children:visibleChildren,managers});
}catch(e){next(e)}}
async function save(req,res,next){return transaction(req,res,next,async c=>{
 const access=await org.fresh(c,req),body=req.body;const prior=req.params.id?await org.node(c,req.params.id):null;
 const parentId=prior?prior.parent_id:body.parentId||null;
 if(!parentId)admin(req);else{
   if(!access.admin&&!access.permissions['departments.subgroups'])org.deny();
   const parent=await org.node(c,parentId);if(parent.parent_id||!parent.is_active)org.fail('Select an active parent department.');
   if(!org.covers(access,prior||parent))org.deny();
 }
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>255)org.fail('Enter a name up to 255 characters.');
 const region=parentId?(await org.node(c,parentId)).region_id:body.regionId;
 if(!region||!(await c.query('SELECT 1 FROM organization_regions WHERE id=$1 AND is_active',[region])).rowCount)org.fail('Select an active department region before creating sub departments.');
 if(parentId&&!(await c.query('SELECT 1 FROM organization_countries WHERE id=$1 AND region_id=$2 AND is_active',[body.countryId,region])).rowCount)org.fail('Select an active country in the department region.');
 if(body.is_active!==undefined&&typeof body.is_active!=='boolean')org.fail('Invalid status.');
 const values=[body.name.trim(),body.description||'',parentId,region,parentId?body.countryId:null,body.is_active??prior?.is_active??true];
 const row=prior?(await c.query('UPDATE assignment_groups SET name=$1,description=$2,parent_id=$3,region_id=$4,country_id=$5,is_active=$6,updated_at=NOW() WHERE id=$7 RETURNING *',[...values,prior.id])).rows[0]:(await c.query('INSERT INTO assignment_groups(name,description,parent_id,region_id,country_id,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',values)).rows[0];
 await logAdminAudit(req.access.userId,prior?'DEPARTMENT_UPDATED':'DEPARTMENT_CREATED','department',row.id,row.name,{parentId},req.ip);return{group:row};
})}
async function remove(req,res,next){return transaction(req,res,next,async c=>{
 const access=await org.fresh(c,req),g=await org.node(c,req.params.id);
 if(!g.parent_id)admin(req);else if(!access.admin&&(!access.permissions['departments.subgroups']||!access.managedGroups.includes(g.parent_id)))org.deny();
 const used=(await c.query(`SELECT
  (SELECT COUNT(*)::int FROM assignment_groups WHERE parent_id=$1) AS subgroups,
  (SELECT COUNT(*)::int FROM user_groups WHERE group_id=$1) AS memberships,
  (SELECT COUNT(*)::int FROM user_managed_groups WHERE group_id=$1) AS management_assignments,
  (SELECT COUNT(*)::int FROM tickets WHERE assignment_group_id=$1 OR subgroup_id=$1) AS tickets`,[g.id])).rows[0];
 const linked=Object.entries(used).filter(([,count])=>count>0).map(([kind,count])=>count+' '+(kind==='subgroups'?'sub departments':kind.replaceAll('_',' ')));
 if(linked.length)org.fail('Cannot delete "'+g.name+'": linked to '+linked.join(', ')+'. Remove or reassign these links first, or deactivate this '+(g.parent_id?'sub department':'department')+'.');
 await c.query('DELETE FROM assignment_groups WHERE id=$1',[g.id]);return{};
})}
async function candidates(req,res,next){try{
 const access=req.access;if(!access.admin&&!access.permissions['departments.members']&&!access.permissions['users.team_add'])org.deny();
 if(!access.admin&&!access.managedGroups.length)return res.json({success:true,users:[]});
 const rows=(await pool.query(`SELECT u.id,u.username,u.full_name,u.email,r.name AS role_name FROM users u JOIN access_roles r ON r.key=u.role WHERE u.is_active AND u.deleted_at IS NULL
 ${access.admin?'':`AND u.role<>'admin' AND NOT EXISTS(SELECT 1 FROM user_groups WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM user_managed_groups WHERE user_id=u.id)`} ORDER BY u.full_name`)).rows;
 res.json({success:true,users:rows});
}catch(e){next(e)}}
async function add(req,res,next){return transaction(req,res,next,async c=>{
 const ids=req.body.groupIds||(req.params.id?[req.params.id]:[]);await org.addMembers(c,req,ids,req.body.userIds);
 return{};
})}
async function members(req,res,next){try{
 allow(req,'departments.view');const g=await org.node(pool,req.params.id),all=(await pool.query('SELECT * FROM assignment_groups')).rows;
 const scopes=(g.parent_id?[g]:[g,...all.filter(n=>n.parent_id===g.id)]).filter(n=>org.covers(req.access,n));
 if(!scopes.length)org.deny();const ids=[...new Set(scopes.flatMap(n=>[n.id,...n.parent_id?[n.parent_id]:[]]))];
 const rows=(await pool.query(`SELECT u.id,u.full_name,u.email,u.username,r.name AS role_name,json_agg(json_build_object('id',g.id,'name',g.name,'parent_id',g.parent_id)) AS assignments FROM users u JOIN user_groups ug ON ug.user_id=u.id JOIN assignment_groups g ON g.id=ug.group_id JOIN access_roles r ON r.key=u.role WHERE u.deleted_at IS NULL AND ug.group_id=ANY($1::uuid[]) GROUP BY u.id,r.name ORDER BY u.full_name`,[ids])).rows;
 res.json({success:true,users:rows.map(u=>({...u,assignments:u.assignments.map(a=>({...a,inherited:!scopes.some(n=>n.id===a.id),removable:req.access.admin||org.covers(req.access,a)}))}))});
}catch(e){next(e)}}
async function removeMember(req,res,next){return transaction(req,res,next,async c=>{
 const access=await org.fresh(c,req),g=await org.node(c,req.params.id);
 if(!access.admin&&(!access.permissions['departments.members']||!org.covers(access,g)))org.deny();
 if(!require('../access/context').uuid(req.params.userId))org.fail('Invalid user.');
 const prior=(await c.query('SELECT group_id FROM user_groups WHERE user_id=$1 AND group_id<>$2',[req.params.userId,g.id])).rows.map(r=>r.group_id);
 await org.validateMembership(c,prior);await c.query('DELETE FROM user_groups WHERE user_id=$1 AND group_id=$2',[req.params.userId,g.id]);return{};
})}
module.exports={tree,geography,saveGeography,settings,detail,save,remove,candidates,add,members,removeMember};
