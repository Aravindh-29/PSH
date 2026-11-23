const fail=message=>{throw Object.assign(new Error(message),{status:400})};
async function mailbox(db,address){
 const row=(await db.query('SELECT * FROM email_automation_mailboxes WHERE address=$1 AND is_active',[address.toLowerCase()])).rows[0];
 if(!row)fail('This mailbox is not configured or is disabled.');return row;
}
async function context(db,box){
 const groups=(await db.query(`SELECT g.id,g.parent_id,g.name,g.description,p.name AS parent_name,r.name AS region_name,c.name AS country_name
 FROM assignment_groups g LEFT JOIN assignment_groups p ON p.id=g.parent_id
 LEFT JOIN organization_regions r ON r.id=g.region_id LEFT JOIN organization_countries c ON c.id=g.country_id
 WHERE g.is_active AND (g.parent_id IS NULL OR p.is_active)
 AND (cardinality($1::uuid[])=0 OR g.id=ANY($1::uuid[]) OR g.parent_id=ANY($1::uuid[])) ORDER BY g.name`,[box.allowed_department_ids])).rows;
 // Findings are untrusted reference data, never instructions or executable content.
 const findings=(await db.query('SELECT id,department_id,content,updated_at FROM department_findings WHERE department_id=ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id',[groups.map(g=>g.id)])).rows;
 const requiredFields=(await db.query('SELECT field_key,label,field_type,is_required,options FROM ticket_fields WHERE is_active ORDER BY field_order')).rows;
 const categories=(await db.query('SELECT id,name,type_id FROM categories WHERE is_active ORDER BY name')).rows;
 const ticketTypes=(await db.query('SELECT id,name,prefix FROM ticket_types WHERE is_active ORDER BY name')).rows;
 const subcategories=(await db.query('SELECT id,name,category_id FROM subcategories WHERE is_active ORDER BY name')).rows;
 return {groups,findings,requiredFields,categories,ticketTypes,subcategories,defaults:{},fallbackDepartmentId:box.fallback_department_id,fallbackSubdepartmentId:box.fallback_subdepartment_id};
}
const words=value=>(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(w=>!new Set(['this','that','with','from','your','have','please','support','department','customer','issue','problem','team','request','email','help']).has(w));
function contains(text,phrase){
 const letter=c=>c&&/[\p{L}\p{N}_]/u.test(c);
 let pos=text.indexOf(phrase);while(pos>=0){if(!letter(text[pos-1])&&!letter(text[pos+phrase.length]))return true;pos=text.indexOf(phrase,pos+1);}return false;
}
function destination(ctx,id,reason){
 const group=ctx.groups.find(g=>g.id===id);if(!group)fail('The routing destination is outside the active mailbox scope.');
 const parent=group.parent_id||group.id;
 // A child-only grant does not require its parent to be exposed as a destination.
 return {departmentId:parent,subdepartmentId:group.parent_id?group.id:null,reason};
}
function choose(ctx,email){
 const text=(email.subject+'\n'+email.body).toLowerCase(),scores=new Map();
 for(const finding of ctx.findings){
  for(let phrase of finding.content.split(/[,\n;]+/)){
   phrase=phrase.trim().replace(/^[-*•]\s*/,'').toLowerCase();
   phrase=phrase.replace(/^(?:e-?mail|sender|customer|name|reference|keywords?|topics?)\s*:\s*/,'').trim();
   if(phrase.length<3||phrase.length>300)continue;
   const score=phrase===email.sender.toLowerCase()?100:phrase.startsWith('@')&&email.sender.toLowerCase().endsWith(phrase)?90:contains(text,phrase)?Math.min(70,20+phrase.length):0;
   if(score>0)scores.set(finding.department_id,Math.max(score,scores.get(finding.department_id)||0));
  }
 }
 function winner(entries,reason){
  const top=entries.sort((a,b)=>b[1]-a[1]);if(!top.length)return null;
  const tied=top.filter(x=>x[1]===top[0][1]).map(x=>ctx.groups.find(g=>g.id===x[0])).filter(Boolean);
  const leaves=tied.filter(g=>!tied.some(child=>child.parent_id===g.id));
  if(leaves.length!==1)return {needsReview:true,reason:'More than one department matches; select a destination for review.'};
  return destination(ctx,leaves[0].id,reason);
 }
 const matched=winner([...scores],'Department findings match');
 // Conflicting findings require review; a caller may explicitly resolve them.
 const {labels,normalize}=require('./emailStructured'),labelled=labels(email.body);
 const departments=labelled.get('department'),children=labelled.get('sub department')||labelled.get('subdepartment');
 if(departments||children){
  if(departments?.length>1||children?.length>1)return {needsReview:true,reason:'Conflicting labelled department values require Admin review.'};
  const child=children?.[0],parent=departments?.[0];
  const matches=ctx.groups.filter(g=>child?g.parent_id&&normalize(g.name)===normalize(child)&&(!parent||normalize(g.parent_name||ctx.groups.find(p=>p.id===g.parent_id)?.name||'')===normalize(parent)):!g.parent_id&&normalize(g.name)===normalize(parent));
  if(matches.length===1){
   const exact=destination(ctx,matches[0].id,'Exact labelled department/sub department in email');
   if(matched&&!matched.needsReview){
    if(matched.departmentId!==exact.departmentId||matched.subdepartmentId&&exact.subdepartmentId&&matched.subdepartmentId!==exact.subdepartmentId)return {needsReview:true,reason:'Labelled destination conflicts with department findings. Admin review is required.'};
    if(matched.subdepartmentId&&!exact.subdepartmentId)return matched;
   }
   return exact;
  }
  return {needsReview:true,reason:'Labelled department/sub department is ambiguous, inactive or outside mailbox scope. Admin review is required.'};
 }
 if(matched&&!matched.needsReview)return matched;
 if(email.routingDecision){
  const d=email.routingDecision,g=ctx.groups.find(g=>g.id===(d.subdepartmentId||d.departmentId));
  if(!g||(g.parent_id||g.id)!==d.departmentId)fail('Select a valid scoped department/sub department.');
  return destination(ctx,g.id,'Reviewed routing decision: '+d.reason);
 }
 if(matched)return matched;
 const inputWords=new Set(words(text));
 const inferred=ctx.groups.map(g=>[g.id,[...new Set(words(g.name+' '+g.description))].filter(w=>inputWords.has(w)).length]).filter(([,score])=>score>=2);
 const described=winner(inferred,'Department description keyword match (Stage 1 rules, not live AI)');
 if(described)return described;
 // An unmatched email belongs in Admin review, never an assumed department.
 // Retain legacy fallback settings as data, but do not use them to guess a route.
 return {needsReview:true,reason:'No clear department match. Admin review is required.'};
}
module.exports={mailbox,context,choose};
