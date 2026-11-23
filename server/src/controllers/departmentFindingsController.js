const pool=require('../db/pool');
const org=require('../access/organization');
const {canManage}=require('../access/managedAccess');

async function list(req,res,next){try{
 if(!req.access.admin&&!req.access.permissions['departments.view'])org.deny();
 const group=await org.node(pool,req.params.id);
 if(!org.covers(req.access,group)){
  const children=(await pool.query('SELECT id,parent_id FROM assignment_groups WHERE parent_id=$1',[group.id])).rows;
  if(!children.some(child=>org.covers(req.access,child)))org.deny();
 }
 const findings=(await pool.query(`SELECT f.id,f.content,f.created_at,f.updated_at,u.full_name AS author_name,v.full_name AS updated_by_name
 FROM department_findings f LEFT JOIN users u ON u.id=f.created_by LEFT JOIN users v ON v.id=f.updated_by
 WHERE f.department_id=$1 AND f.deleted_at IS NULL ORDER BY f.updated_at DESC,f.id`,[group.id])).rows;
 res.json({success:true,findings});
}catch(e){next(e)}}

async function save(req,res,next){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await org.lock(client);
  const access=await org.fresh(client,req),group=await org.node(client,req.params.id);
  if(!access.admin&&(!canManage(access)||!access.permissions['departments.view']||!org.covers(access,group)))org.deny();
  const deleting=req.method==='DELETE',findingId=req.params.findingId;
  if(findingId&&!require('../access/context').uuid(findingId))org.fail('Invalid finding.');
  const prior=findingId?(await client.query('SELECT * FROM department_findings WHERE id=$1 AND department_id=$2 AND deleted_at IS NULL FOR UPDATE',[findingId,group.id])).rows[0]:null;
  if(findingId&&!prior)throw Object.assign(new Error('Finding not found in this department.'),{status:404});
  if(!deleting&&(typeof req.body.content!=='string'||!req.body.content.trim()||req.body.content.length>20000))org.fail('Enter findings text between 1 and 20,000 characters.');
  const content=deleting?prior.content:req.body.content;
  const finding=deleting?(await client.query('UPDATE department_findings SET deleted_at=NOW(),updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING id',[findingId,access.userId])).rows[0]
   :prior?(await client.query('UPDATE department_findings SET content=$2,updated_by=$3,updated_at=NOW() WHERE id=$1 RETURNING *',[findingId,content,access.userId])).rows[0]
   :(await client.query('INSERT INTO department_findings(department_id,content,created_by,updated_by) VALUES($1,$2,$3,$3) RETURNING *',[group.id,content,access.userId])).rows[0];
  await client.query(`INSERT INTO admin_audit_logs(user_id,action,entity_type,entity_id,entity_name,details,ip_address) VALUES($1,$2,'department_finding',$3,$4,$5,$6)`,
   [access.userId,deleting?'DEPARTMENT_FINDING_DELETED':prior?'DEPARTMENT_FINDING_UPDATED':'DEPARTMENT_FINDING_CREATED',finding.id,group.name,JSON.stringify({departmentId:group.id,before:prior?.content||null,after:deleting?null:content}),req.ip]);
  await client.query('COMMIT');res.status(!prior?201:200).json({success:true,finding});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
}
module.exports={list,save};
