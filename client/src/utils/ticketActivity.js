export const activityFieldLabels={ticket_owner:'Ticket Owner',assigned_to:'Assigned To',category_id:'Category',type_id:'Type',status:'Status',priority:'Priority',impact:'Impact',urgency:'Urgency',short_description:'Short Description',description:'Description',customer_name:'Customer',module_text:'Module',assignment_group:'Department',assignment_group_id:'Department',subgroup_id:'Sub Department',classification:'Classification',attachment:'Attachment',template:'Template',template_id:'Template',template_snapshot:'Template Definition',template_values:'Template Fields',work_note:'Work Note',email_message:'Email Reference',department_findings:'Routing'};
export const activityLabel=entry=>activityFieldLabels[entry.field_name]||entry.field_name?.replaceAll('_',' ')||entry.action.replaceAll('_',' ');
const status=value=>String(value||'Not set').toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

export function groupTicketActivity(entries=[]){
 const grouped=new Map();
 // Server keys retain PostgreSQL microsecond precision. Different saves are
 // never merged merely because they were displayed in the same minute.
 for(const entry of [...entries].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||(b.activity_order||'').localeCompare(a.activity_order||''))){
  const key=entry.activity_group||`${entry.user_id||entry.user_name||'system'}:${entry.created_at||entry.id}`;
  if(!grouped.has(key))grouped.set(key,{id:key,created_at:entry.created_at,user_name:entry.user_name||'System',entries:[]});
  grouped.get(key).entries.push(entry);
 }
 return [...grouped.values()].map(group=>{
  const rows=group.entries,has=action=>rows.some(e=>e.action===action),added=rows.filter(e=>e.action==='ATTACHMENT_ADDED').length,removed=rows.filter(e=>e.action==='ATTACHMENT_DELETED').length;
  const note=rows.some(e=>e.field_name==='work_note'),change=rows.find(e=>e.field_name==='status'&&e.old_value),assigned=rows.find(e=>e.field_name==='assigned_to'&&e.action==='UPDATED');
  let title=has('CREATED')?(has('EMAIL_RECEIVED')?'Ticket created from email':'Ticket created'):has('EMAIL_RECEIVED')?(has('REOPENED')?'Email received · Ticket reopened':'Email received'):has('REOPENED')?'Ticket reopened':has('DELETED')?'Ticket deleted':has('UPDATED')?'Ticket updated':added?'Attachments added':removed?'Attachments removed':note?'Work note added':has('COMMENT_ADDED')?'Comment added':'Ticket activity';
  const parts=[];
  if(change)parts.push(`${status(change.old_value)} → ${status(change.new_value)}`);
  if(assigned)parts.push(`Assigned to ${assigned.new_value||'Unassigned'}`);
  if(has('EMAIL_ROUTED'))parts.push('Department routing recorded');
  if(added)parts.push(`${added} attachment${added===1?'':'s'} added`);
  if(removed)parts.push(`${removed} attachment${removed===1?'':'s'} removed`);
  if(note)parts.push(rows.length===1?String(rows[0].new_value||'Work note added'):'Work note added');
  const fieldChanges=rows.filter(e=>e.action==='UPDATED'&&!['status','assigned_to'].includes(e.field_name)).length;
  if(fieldChanges)parts.push(`${fieldChanges} field${fieldChanges===1?'':'s'} updated`);
  if(!parts.length){const detail=rows.find(e=>e.new_value||e.old_value);parts.push(detail?String(detail.new_value||detail.old_value):`${rows.length} activity record${rows.length===1?'':'s'}`);}
  return {...group,title,summary:parts.join(' · ')};
 });
}

export function groupTicketActivityByDate(entries=[],timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
 const days=new Map();
 const formatter=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone});
 for(const group of groupTicketActivity(entries)){
  const date=new Date(group.created_at);
  const label=Number.isNaN(date.getTime())?'Unknown date':formatter.format(date).replaceAll(' ','-');
  if(!days.has(label))days.set(label,{id:label,label,groups:[],recordCount:0});
  const day=days.get(label);
  day.groups.push(group);
  day.recordCount+=group.entries.length;
 }
 return [...days.values()];
}
