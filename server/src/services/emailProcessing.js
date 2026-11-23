const crypto=require('node:crypto');
const pool=require('../db/pool');
const routing=require('./emailRouting');
const logAudit=require('./ticketAudit');
const {createTicketInTransaction}=require('./ticketWrites');
const {onStatusChange}=require('./slaService');
const {ALLOWED_MIME_TYPES,MAX_FILE_SIZE}=require('../controllers/attachmentController');
const fail=message=>{throw Object.assign(new Error(message),{status:400})};

async function systemUser(db){
 const prior=(await db.query('SELECT id FROM users WHERE is_system')).rows[0];if(prior)return prior.id;
 const uid=crypto.randomUUID();
 return (await db.query(`INSERT INTO users(username,email,full_name,password_hash,role,is_active,is_system,mfa_required)
 VALUES($1,$2,'System','!disabled-system-identity!','employee',FALSE,TRUE,TRUE)
 ON CONFLICT(is_system) WHERE is_system DO UPDATE SET full_name='System' RETURNING id`,['system_'+uid.slice(0,8),uid+'@system.servit.invalid'])).rows[0].id;
}
async function fieldsError(db,body,{allowMissing=false}={}){
 for(const [key,options] of Object.entries({priority:['LOW','MEDIUM','HIGH','CRITICAL'],impact:['LOW','MEDIUM','HIGH'],urgency:['LOW','MEDIUM','HIGH']}))if(body[key]&&!options.includes(body[key]))return `Invalid ${key}.`;
 if(!allowMissing&&(!body.customerName||!body.moduleText||!body.categoryId))return 'Configure customerName, moduleText and categoryId defaults, or supply reviewed ticketFields.';
 if(body.categoryId&&!require('../access/context').uuid(body.categoryId))return 'Select a valid category.';
 const cat=body.categoryId?(await db.query('SELECT id,is_active,type_id FROM categories WHERE id=$1',[body.categoryId])).rows[0]:null;
 if(body.categoryId&&!cat?.is_active)return 'The configured category is inactive or missing.';
 if(body.typeId){
  if(!require('../access/context').uuid(body.typeId))return 'Select a valid ticket type.';
  if(!(await db.query('SELECT 1 FROM ticket_types WHERE id=$1 AND is_active',[body.typeId])).rowCount)return 'The configured ticket type is inactive or missing.';
  if(cat?.type_id&&cat.type_id!==body.typeId)return 'Category does not belong to the configured ticket type.';
 }
 if(body.subcategoryId){
  if(!require('../access/context').uuid(body.subcategoryId)||!(await db.query('SELECT 1 FROM subcategories WHERE id=$1 AND category_id=$2 AND is_active',[body.subcategoryId,body.categoryId])).rowCount)return 'Select an active subcategory belonging to the category.';
 }
 const system=new Set(['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description','assignment_group']);
 const fields=(await db.query('SELECT field_key,label,field_type,options,is_required FROM ticket_fields WHERE is_active')).rows;
 for(const field of fields){
  const systemKeys={customer_name:'customerName',module_text:'moduleText',category_id:'categoryId',status:'status',priority:'priority',impact:'impact',urgency:'urgency',short_description:'shortDescription',description:'description',assignment_group:'assignmentGroupId'};
  const value=system.has(field.field_key)?body[systemKeys[field.field_key]]:body.customData?.[field.field_key];
  if((value===undefined||value===null||value==='')&&!field.is_required)continue;
  if((value===undefined||value===null||value==='')&&field.is_required){if(allowMissing)continue;return `Missing required field: ${field.label}. Configure a reviewed default; values are never invented.`;}
  if(field.field_type==='number'&&!Number.isFinite(Number(value)))return `Invalid number for ${field.label}.`;
  if(field.field_type==='dropdown'&&!['assignment_group','category_id'].includes(field.field_key)){
   const opts=Array.isArray(field.options)?field.options:[];
   if(opts.length&&!opts.some(o=>(typeof o==='object'?o.value:o)===value))return `Invalid option for ${field.label}.`;
  }
 }
 return null;
}
function gmailUrl(box,thread){return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(box.address)}#all/${encodeURIComponent(thread)}`;}
function validate(input){
 for(const key of ['mailbox','messageId','threadId','sender','body'])if(typeof input[key]!=='string'||!input[key].trim())fail(`Provide ${key}.`);
 if(input.messageId.length>512||input.threadId.length>512||/[\r\n]/.test(input.messageId+input.threadId))fail('Invalid message or thread identifier.');
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.mailbox)||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.sender))fail('Provide plain mailbox and sender email addresses.');
 if(input.body.length>200000||String(input.subject||'').length>2000)fail('Email body or subject exceeds the Stage 1 limit.');
 if(input.receivedAt&&!Number.isFinite(Date.parse(input.receivedAt)))fail('Invalid receivedAt timestamp.');
 if(!Array.isArray(input.attachments||[])||(input.attachments||[]).length>10)fail('Provide up to 10 attachments.');
 let size=0;for(const a of input.attachments||[]){if(typeof a.contentBase64!=='string')fail('Provide attachment bytes as base64.');size+=Math.floor(a.contentBase64.length*3/4)-(a.contentBase64.endsWith('==')?2:a.contentBase64.endsWith('=')?1:0);}
 if(size>MAX_FILE_SIZE)fail('Combined attachment data exceeds 25 MB per email processing call.');
}
async function receipt(db,box,input){
 await db.query(`INSERT INTO incoming_email_messages(mailbox_id,message_id,thread_id,sender,subject,body,received_at,external_case_reference)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(mailbox_id,message_id) DO NOTHING`,[box.id,input.messageId,input.threadId,input.sender,input.subject||'',input.body,input.receivedAt||new Date().toISOString(),input.externalCaseReference||null]);
 return (await db.query('SELECT * FROM incoming_email_messages WHERE mailbox_id=$1 AND message_id=$2 FOR UPDATE',[box.id,input.messageId])).rows[0];
}
async function processEmail(input){
 validate(input);
 const box=await routing.mailbox(pool,input.mailbox);
 if(box.sender_domains.length&&!box.sender_domains.includes(input.sender.split('@')[1].toLowerCase()))fail('The sender domain is not allowed for this mailbox.');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  // Same thread is serialized. The receipt row lock also serializes duplicate
  // Message IDs supplied with different Thread IDs. Both keys are mailbox-local.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[box.id+':'+input.threadId]);
  const message=await receipt(db,box,input);
  if(message.status==='processed'){await db.query('COMMIT');return {action:'duplicate',messageId:input.messageId,ticketId:message.ticket_id};}
  if(message.thread_id!==input.threadId||message.body!==input.body||message.sender!==input.sender)fail('Previously received email identity/content cannot be changed. Retry with the original email.');
  await db.query("UPDATE incoming_email_messages SET attempts=attempts+1,error=NULL,updated_at=NOW() WHERE id=$1",[message.id]);
  const link=(await db.query('SELECT ticket_id FROM incoming_email_threads WHERE mailbox_id=$1 AND thread_id=$2',[box.id,input.threadId])).rows[0];
  let ticket=link?(await db.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[link.ticket_id])).rows[0]:null;
  let decision,review;
  if(link&&(!ticket||ticket.deleted_at))review='The conversation ticket was deleted. Manual review is required; no replacement ticket was created.';
  let body;
  if(!link){
   const ctx=await routing.context(db,box);decision=routing.choose(ctx,input);
   // Mailbox defaults are retired. Old configuration never supplies hidden
   // business values; only reviewed/extracted values for this email are used.
   const incident=ctx.ticketTypes.find(t=>t.name.toLowerCase()==='incident'&&t.prefix==='INC');
   if(!incident)review='Configure an active Incident ticket type with prefix INC before processing new email conversations.';
   ctx.categories=ctx.categories.filter(c=>!c.type_id||c.type_id===incident?.id);
   const labelled=require('./emailStructured').fields(ctx,input);
   const provided={...input.ticketFields,...labelled,typeId:incident?.id,customData:{...input.ticketFields?.customData,...labelled.customData}};
   body={...provided,customerName:provided.customerName||null,moduleText:provided.moduleText||null,categoryId:provided.categoryId||null,priority:provided.priority||null,impact:provided.impact||null,urgency:provided.urgency||null,
    shortDescription:(input.subject||'Email support request').slice(0,500),description:input.body,
    assignmentGroupId:decision.departmentId,subgroupId:decision.subdepartmentId||null,assignedTo:null,status:'NEW',workNote:undefined};
   if(decision.needsReview){
    // Stable choice when several Admins exist. Never grant employee access or
    // invent a department to capture an email; no Admin still means safe capture.
    const admin=(await db.query("SELECT id FROM users WHERE role='admin' AND is_active AND deleted_at IS NULL AND NOT is_system ORDER BY created_at,id LIMIT 1 FOR SHARE")).rows[0];
    body.assignedTo=admin?.id||null;
    decision.reason+=' '+(admin?'Assigned to Admin for routing.':'No active Admin is available; retained in the Admin Needs routing queue.');
   }
   if(!review)review=await fieldsError(db,body,{allowMissing:true});
   if(!review&&decision.departmentId){
    const ids=[decision.departmentId,...decision.subdepartmentId?[decision.subdepartmentId]:[]];
    if((await db.query('SELECT id FROM assignment_groups WHERE id=ANY($1::uuid[]) AND is_active FOR SHARE',[ids])).rowCount!==ids.length)review='The routing destination is no longer active. Review the email.';
   }

  }
  if(review){
   await db.query("UPDATE incoming_email_messages SET status='needs_review',error=$2,routing_reason=$3,updated_at=NOW() WHERE id=$1",[message.id,review,decision?.reason||null]);
   await db.query('COMMIT');return {action:'needs_review',messageId:input.messageId,reason:review};
  }
  const actor=await systemUser(db),created=!ticket;
  if(created){
   ticket=await createTicketInTransaction(db,body,actor,{allowIncompleteEmail:true});
   await db.query("UPDATE tickets SET source='EMAIL',requester_email=$2,external_case_reference=$3,inbox_event='EMAIL_RECEIVED',inbox_event_at=NOW() WHERE id=$1",[ticket.id,input.sender,input.externalCaseReference||null]);
   await db.query('INSERT INTO incoming_email_threads(mailbox_id,thread_id,ticket_id) VALUES($1,$2,$3)',[box.id,input.threadId,ticket.id]);
   await logAudit(db,ticket.id,actor,'EMAIL_ROUTED','department_findings',null,decision.reason,null);
   if(decision.needsReview)await logAudit(db,ticket.id,actor,'ROUTING_REVIEW','assigned_to',null,body.assignedTo,null);
   if(input.aiMetadata)await logAudit(db,ticket.id,actor,'AI_ANALYZED','email_ai',null,JSON.stringify(input.aiMetadata),null);
   if(decision.needsReview)await db.query('UPDATE tickets SET routing_review_reason=$2 WHERE id=$1',[ticket.id,decision.reason]);
  }
  const comment=(await db.query("INSERT INTO ticket_comments(ticket_id,user_id,body,type) VALUES($1,$2,$3,'COMMENT') RETURNING id",[ticket.id,actor,input.body])).rows[0];
  await logAudit(db,ticket.id,actor,'EMAIL_RECEIVED','email_message',null,input.messageId,null);
  let reopened=false;
  if(!created&&ticket.status==='CLOSED'){
   reopened=true;
   await db.query("UPDATE tickets SET status='IN_PROGRESS',updated_by=$2,external_case_reference=COALESCE(external_case_reference,$3),updated_at=NOW() WHERE id=$1",[ticket.id,actor,input.externalCaseReference||null]);
   // The status trigger increments the shared unread revision; label that event
   // inside this same transaction so bell and My Query see the email source.
   await db.query("UPDATE tickets SET inbox_event='EMAIL_REOPENED' WHERE id=$1",[ticket.id]);
   await logAudit(db,ticket.id,actor,'REOPENED','status','CLOSED','IN_PROGRESS',null);
   await onStatusChange(db,ticket.id,'CLOSED','IN_PROGRESS');
  }else if(!created)await db.query("UPDATE tickets SET updated_by=$2,external_case_reference=COALESCE(external_case_reference,$3),updated_at=NOW(),inbox_revision=inbox_revision+1,inbox_event='EMAIL_RECEIVED',inbox_event_at=NOW() WHERE id=$1",[ticket.id,actor,input.externalCaseReference||null]);
  const attachmentErrors=[...(input.attachmentWarnings||[])];
  for(const file of input.attachments||[]){
   if(typeof file.name!=='string'||!file.name||file.name.length>500||!ALLOWED_MIME_TYPES.includes(file.mimeType)){attachmentErrors.push({name:String(file.name||'Unnamed'),reason:'Unsupported name or file type'});continue;}
   if(file.contentBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.contentBase64)){attachmentErrors.push({name:file.name,reason:'Invalid base64'});continue;}
   const bytes=Buffer.from(file.contentBase64,'base64');if(bytes.length>MAX_FILE_SIZE){attachmentErrors.push({name:file.name,reason:'Exceeds 25 MB'});continue;}
   const safeName=file.name.replace(/[^a-zA-Z0-9._\-()]/g,'_');
   await db.query('INSERT INTO ticket_attachments(ticket_id,file_name,mime_type,file_size,file_data,uploaded_by) VALUES($1,$2,$3,$4,$5,$6)',[ticket.id,safeName,file.mimeType,bytes.length,bytes,actor]);
   await logAudit(db,ticket.id,actor,'ATTACHMENT_ADDED','attachment',null,safeName,null);
  }
  await db.query(`UPDATE incoming_email_messages SET status='processed',ticket_id=$2,comment_id=$3,routing_reason=$4,attachment_errors=$5,error=NULL,updated_at=NOW() WHERE id=$1`,[message.id,ticket.id,comment.id,decision?.reason||'Existing mailbox + Thread ID',JSON.stringify(attachmentErrors)]);
  const completeness=(await db.query('SELECT details_incomplete,missing_details,routing_needs_review FROM tickets WHERE id=$1',[ticket.id])).rows[0];
  await db.query('COMMIT');
  return {action:created?'created':'updated',messageId:input.messageId,ticketId:ticket.id,ticketNumber:ticket.ticket_number,status:reopened?'IN_PROGRESS':ticket.status,reopened,departmentId:ticket.assignment_group_id,subdepartmentId:ticket.subgroup_id,assignedTo:ticket.assigned_to,detailsIncomplete:completeness.details_incomplete,missingDetails:completeness.missing_details,needsRouting:completeness.routing_needs_review,aiStatus:input.aiMetadata?.status||null,attachmentErrors,gmailUrl:gmailUrl(box,input.threadId)};
 }catch(error){
  await db.query('ROLLBACK').catch(()=>{});
  // Persist failures after rollback without downgrading a concurrently completed receipt.
  await pool.query(`INSERT INTO incoming_email_messages(mailbox_id,message_id,thread_id,sender,subject,body,received_at,status,error,attempts)
   VALUES($1,$2,$3,$4,$5,$6,$7,'failed',$8,1)
   ON CONFLICT(mailbox_id,message_id) DO UPDATE SET status='failed',error=EXCLUDED.error,attempts=incoming_email_messages.attempts+1,updated_at=NOW()
   WHERE incoming_email_messages.status<>'processed'`,[box.id,input.messageId,input.threadId,input.sender,input.subject||'',input.body,input.receivedAt||new Date().toISOString(),error.status?error.message:'Email processing failed; retry the original message.']).catch(()=>{});
  throw error;
 }finally{db.release()}
}
module.exports={processEmail,systemUser,fieldsError,gmailUrl};
