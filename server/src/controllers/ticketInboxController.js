const pool=require('../db/pool');
const {scopePredicate}=require('../access/context');
const bad=message=>{throw Object.assign(new Error(message),{status:400})};

// Deliberately explicit ticket-read scope: a permitted unassigned department
// queue is not an assignment to the current user. Do not broaden other views.
function base(req,filters=true){
 const params=[req.access.userId],conditions=['t.deleted_at IS NULL',
  '(t.assigned_to=$1 OR t.assigned_to IS NULL)',`(${scopePredicate(req.access,'tickets.view')})`];
 const add=(value,expression)=>{params.push(value);conditions.push(expression.replaceAll('?', '$'+params.length))};
 if(filters){
  const {search,startDate,endDate}=req.query;
  if(search){if(typeof search!=='string'||search.length>200)bad('Search must be up to 200 characters.');add('%'+search+'%', '(t.ticket_number ILIKE ? OR t.short_description ILIKE ? OR t.customer_name ILIKE ?)')}
  for(const date of [startDate,endDate])if(date!==undefined&&(typeof date!=='string'||date<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))bad('Choose a valid date range.');
  if(startDate&&endDate&&startDate>endDate)bad('The start date must be before the end date.');
  if(startDate)add(startDate,'t.created_at>=?::date');
  if(endDate)add(endDate,"t.created_at<(?::date+INTERVAL '1 day')");
 }
 return{params,sql:`SELECT t.*,COALESCE(r.seen_revision,0)<t.inbox_revision AS is_unopened
 FROM tickets t LEFT JOIN ticket_inbox_receipts r ON r.ticket_id=t.id AND r.user_id=$1
 WHERE ${conditions.join(' AND ')}`};
}
async function badge(req,res,next){try{
 const b=base(req,false);
 const {rows}=await pool.rawQuery(`SELECT COUNT(*)::int AS unopened FROM (${b.sql}) inbox WHERE is_unopened`,b.params);
 res.json({success:true,unopened:rows[0].unopened});
}catch(e){next(e)}}
async function list(req,res,next){try{
 const b=base(req),view=req.query.view||'all',page=Number(req.query.page||1),limit=Number(req.query.limit||20),status=req.query.status||'';
 if(!['all','mine','unassigned','unopened'].includes(view))bad('Choose a valid inbox view.');
 if(!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(limit)||limit<1||limit>100)bad('Choose a valid page.');
 if(typeof status!=='string'||status.length>50)bad('Choose a valid ticket state.');
 const viewSQL={all:'TRUE',mine:'assigned_to=$1',unassigned:'assigned_to IS NULL',unopened:'is_unopened'}[view];
 const summary=(await pool.rawQuery(`SELECT COUNT(*)::int AS total,
 COUNT(*) FILTER(WHERE assigned_to=$1)::int AS mine,
 COUNT(*) FILTER(WHERE assigned_to IS NULL)::int AS unassigned,
 COUNT(*) FILTER(WHERE is_unopened)::int AS unopened FROM (${b.sql}) inbox`,b.params)).rows[0];
 const statuses=(await pool.rawQuery(`SELECT status,COUNT(*)::int AS count FROM (${b.sql}) inbox WHERE ${viewSQL} GROUP BY status`,b.params)).rows;
 const counts=Object.fromEntries(statuses.map(row=>[row.status,row.count]));
 const total=status?(counts[status]||0):statuses.reduce((sum,row)=>sum+row.count,0);
 const params=[...b.params];let statusSQL='';
 if(status){params.push(status);statusSQL=`AND i.status=$${params.length}`}
 params.push(limit,(page-1)*limit);
 const {rows}=await pool.rawQuery(`WITH inbox AS (${b.sql})
 SELECT i.id,i.ticket_number,i.short_description,i.customer_name,i.priority,i.status,i.assigned_to,
 i.assignment_group_id,i.subgroup_id,i.created_at,i.updated_at,i.inbox_revision,i.is_unopened,
 d.name AS department_name,s.name AS sub_department_name,u.full_name AS assigned_to_name
 FROM inbox i LEFT JOIN assignment_groups d ON d.id=i.assignment_group_id
 LEFT JOIN assignment_groups s ON s.id=i.subgroup_id LEFT JOIN users u ON u.id=i.assigned_to
 WHERE ${viewSQL.replace(/\bassigned_to\b/g,'i.assigned_to').replace(/\bis_unopened\b/g,'i.is_unopened')} ${statusSQL}
 ORDER BY i.is_unopened DESC,i.updated_at DESC,i.id
 LIMIT $${params.length-1} OFFSET $${params.length}`,params);
 res.json({success:true,summary,counts,total,tickets:rows,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}catch(e){next(e)}}
async function opened(req,res,next){try{
 const revision=String(req.body.revision??'');
 if(!/^[1-9]\d{0,18}$/.test(revision)||BigInt(revision)>BigInt(req.authorizedTicket.inbox_revision))bad('Reload the ticket before marking it opened.');
 // Save exactly the revision actually rendered. A concurrent reassignment must
 // remain unopened, and duplicate/out-of-order acknowledgements never regress.
 await pool.query(`INSERT INTO ticket_inbox_receipts(user_id,ticket_id,seen_revision)
 VALUES($1,$2,$3) ON CONFLICT(user_id,ticket_id) DO UPDATE
 SET seen_revision=GREATEST(ticket_inbox_receipts.seen_revision,EXCLUDED.seen_revision),opened_at=NOW()`,
 [req.access.userId,req.params.id,revision]);
 res.json({success:true});
}catch(e){next(e)}}
module.exports={badge,list,opened};
