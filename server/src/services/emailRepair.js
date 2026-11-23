// Operator-only repair of an untouched legacy email intake. Never called by
// delivery retries: processed Message IDs must remain strictly idempotent.
const pool=require('../db/pool');
const routing=require('./emailRouting');
const {fields}=require('./emailStructured');
const {fieldsError,systemUser}=require('./emailProcessing');
const audit=require('./ticketAudit');
async function repairCapturedEmail(ticketId){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const before=(await db.query('SELECT * FROM tickets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[ticketId])).rows[0];
  if(!before||before.source!=='EMAIL')throw Error('Select an existing email ticket.');
  if(!/^PSH\d+$/.test(before.ticket_number)){await db.query('COMMIT');return {changed:false,ticket:before};}
  if(before.updated_by!==before.created_by||before.assignment_group_id)throw Error('This ticket has been manually changed or routed. Review it before repairing.');
  const original=(await db.query("SELECT m.*,b.address FROM incoming_email_messages m JOIN email_automation_mailboxes b ON b.id=m.mailbox_id WHERE m.ticket_id=$1 AND m.status='processed' ORDER BY m.received_at,m.id LIMIT 1",[ticketId])).rows[0];
  if(!original)throw Error('The original processed email is unavailable.');
  const box=await routing.mailbox(db,original.address),ctx=await routing.context(db,box),incident=ctx.ticketTypes.find(t=>t.name.toLowerCase()==='incident'&&t.prefix==='INC');
  if(!incident)throw Error('Configure an active Incident type with INC prefix.');
  ctx.categories=ctx.categories.filter(c=>!c.type_id||c.type_id===incident.id);
  const email={sender:original.sender,subject:original.subject,body:original.body},decision=routing.choose(ctx,email);
  if(decision.needsReview)throw Error(decision.reason);
  const extracted=fields(ctx,email),mapping={customerName:'customer_name',moduleText:'module_text',categoryId:'category_id',subcategoryId:'subcategory_id',priority:'priority',impact:'impact',urgency:'urgency'};
  const body={...extracted,typeId:incident.id,status:before.status,shortDescription:before.short_description,description:before.description,assignmentGroupId:decision.departmentId,customData:{...extracted.customData}};
  for(const [key,column] of Object.entries(mapping))if(before[column]!==null&&before[column]!=='')body[key]=before[column];
  for(const [key,value] of Object.entries(before.custom_data||{}))if(value!==null&&value!=='')body.customData[key]=value;
  const invalid=await fieldsError(db,body,{allowMissing:true});if(invalid)throw Error(invalid);
  const count=(await db.query(`INSERT INTO ticket_type_counters(type_id,counter)
   SELECT $1,COALESCE(MAX(SUBSTRING(ticket_number FROM 4)::integer),0)+1 FROM tickets WHERE ticket_number ~ '^INC[0-9]+$'
   ON CONFLICT(type_id) DO UPDATE SET counter=GREATEST(ticket_type_counters.counter,EXCLUDED.counter-1)+1 RETURNING counter`,[incident.id])).rows[0].counter;
  const number='INC'+String(count).padStart(6,'0'),actor=await systemUser(db);
  const ticket=(await db.query(`UPDATE tickets SET ticket_number=$2,type_id=$3,assignment_group_id=$4,subgroup_id=$5,
   assignment_group=(SELECT name FROM assignment_groups WHERE id=$4),assigned_to=NULL,
   customer_name=$6,module_text=$7,category_id=$8,subcategory_id=$9,priority=$10,impact=$11,urgency=$12,custom_data=$13,
   updated_by=$14,updated_at=NOW() WHERE id=$1 RETURNING *`,[ticketId,number,incident.id,decision.departmentId,decision.subdepartmentId||null,
   body.customerName||null,body.moduleText||null,body.categoryId||null,body.subcategoryId||null,body.priority||null,body.impact||null,body.urgency||null,body.customData,actor])).rows[0];
  for(const column of ['ticket_number','type_id','assignment_group_id','subgroup_id','assigned_to',...Object.values(mapping),'custom_data']){
   const old=typeof before[column]==='object'?JSON.stringify(before[column]):before[column],next=typeof ticket[column]==='object'?JSON.stringify(ticket[column]):ticket[column];
   if(old!==next)await audit(db,ticketId,actor,'EMAIL_INTAKE_CORRECTED',column,old,next,null);
  }
  await db.query('UPDATE notifications SET ticket_number=$2 WHERE ticket_id=$1',[ticketId,number]);
  await db.query("INSERT INTO ticket_comments(ticket_id,user_id,body,type) VALUES($1,$2,$3,'WORK_NOTE')",[ticketId,actor,`Corrected email intake: ${before.ticket_number} → ${number}. Set Incident type and routed from the original email's exact department/sub department labels. Filled explicitly labelled missing details; preserved the original conversation, email comments and attachments.`]);
  await db.query('COMMIT');return {changed:true,previousNumber:before.ticket_number,ticket};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={repairCapturedEmail};
