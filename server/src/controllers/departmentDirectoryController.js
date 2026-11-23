const pool=require('../db/pool');
const {uuid}=require('../access/context');
const fail=message=>{throw Object.assign(new Error(message),{status:400})};

async function list(req,res,next){try{
 const departments=(await pool.query(`SELECT DISTINCT d.id,d.name,r.name AS region_name
 FROM assignment_groups d LEFT JOIN organization_regions r ON r.id=d.region_id
 WHERE d.parent_id IS NULL AND d.is_active ${req.access.admin?'':`AND EXISTS(
 SELECT 1 FROM user_groups own JOIN assignment_groups g ON g.id=own.group_id
 WHERE own.user_id=$1 AND g.is_active AND COALESCE(g.parent_id,g.id)=d.id)`}
 ORDER BY d.name,d.id`,req.access.admin?[]:[req.access.userId])).rows;
 const {departmentId,search=''}=req.query,page=Number(req.query.page||1),limit=Number(req.query.limit||50);
 if(typeof search!=='string'||search.length>200)fail('Search must be up to 200 characters.');
 if(!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('Choose a valid page.');
 if(departmentId&&(!uuid(departmentId)||!departments.some(d=>d.id===departmentId)))throw Object.assign(new Error("You don't have permission to view this department directory."),{status:403});
 const ids=departmentId?[departmentId]:departments.map(d=>d.id),params=[ids];
 let searchSQL='';if(search){params.push('%'+search+'%');searchSQL=`AND (u.full_name ILIKE $2 OR u.username ILIKE $2 OR u.email ILIKE $2 OR r.name ILIKE $2)`}
 // Directory access intentionally covers coworkers across the same parent
 // department. It grants no access to their tickets or account administration.
 const cte=`WITH memberships AS (
 SELECT ug.user_id,d.id AS department_id,g.id AS group_id,g.name AS group_name,g.parent_id,FALSE AS supervises
 FROM user_groups ug JOIN assignment_groups g ON g.id=ug.group_id
 JOIN assignment_groups d ON d.id=COALESCE(g.parent_id,g.id)
 WHERE d.id=ANY($1::uuid[]) AND g.is_active AND d.is_active
 UNION ALL
 SELECT mg.user_id,d.id,g.id,g.name,g.parent_id,TRUE FROM user_managed_groups mg
 JOIN users manager ON manager.id=mg.user_id JOIN access_roles mr ON mr.key=manager.role AND mr.role_kind='manager'
 JOIN assignment_groups g ON g.id=mg.group_id JOIN assignment_groups d ON d.id=COALESCE(g.parent_id,g.id)
 WHERE d.id=ANY($1::uuid[]) AND g.is_active AND d.is_active
 ), people AS (
 SELECT u.id,u.username,u.full_name,u.email,u.is_active,r.name AS role_name,
 jsonb_agg(DISTINCT jsonb_build_object('department_id',m.department_id,'group_id',m.group_id,
 'sub_department',CASE WHEN m.parent_id IS NOT NULL THEN m.group_name ELSE NULL END,'supervises',m.supervises)) AS memberships
 FROM memberships m JOIN users u ON u.id=m.user_id JOIN access_roles r ON r.key=u.role
 WHERE u.deleted_at IS NULL AND r.is_active ${searchSQL} GROUP BY u.id,r.name
 )`;
 const total=Number((await pool.query(cte+' SELECT COUNT(*)::int AS total FROM people',params)).rows[0].total);
 params.push(limit,(page-1)*limit);
 const users=(await pool.query(cte+` SELECT * FROM people ORDER BY LOWER(full_name),id LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
 res.json({success:true,departments,users,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}catch(e){next(e)}}
module.exports={list};
