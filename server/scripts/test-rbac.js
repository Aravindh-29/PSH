// Integration regression suite. Run against a local test instance with
// TEST_USERNAME and TEST_PASSWORD for an administrator; fixtures are cleaned up.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
require('dotenv').config({path:require('path').join(__dirname,'../../.env')});
const pool=require('../src/db/pool');
const {scopedSQL,context}=require('../src/access/context');
const roles=[],users=[],tickets=[],groups=[],sessions=[],fields=[];
const url=process.env.TEST_API_URL||'http://localhost:5000/api';
let adminCookie,adminId,checks=0;
async function api(path,method='GET',body,expected=200,cookie=adminCookie){
  const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={text:text.slice(0,200)}}
  assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data).slice(0,600)}`);checks++;
  return {response,data};
}
async function role(name,permissions,assignable_roles=[]){const {data}=await api('/roles','POST',{name,responsibility:'Temporary RBAC integration fixture',permissions,assignable_roles,is_active:true},201);roles.push(data.role.key);return data.role}
async function user(roleKey,groupIds=[]){const tag=randomUUID().slice(0,8);const {data}=await api('/users','POST',{username:'rbac_'+tag,email:`rbac_${tag}@example.invalid`,fullName:'RBAC Fixture '+tag,password:'Rbac-Test!4482',role:roleKey,mfaRequired:false,managedGroupIds:groupIds,groupIds},201);users.push(data.user.id);return data.user}
async function login(username,password){const {data,response}=await api('/auth/login','POST',{username,password},200,'');assert(data.user,'MFA must be disabled on the local test account');return response.headers.get('set-cookie').split(';')[0]}
async function fixtureSession(user){const sid=randomUUID(),session={cookie:{expires:new Date(Date.now()+600000),maxAge:600000},userId:user.id,username:user.username,role:user.role};await pool.query('INSERT INTO session(sid,sess,expire) VALUES($1,$2,NOW()+INTERVAL \'10 minutes\')',[sid,JSON.stringify(session)]);sessions.push(sid);return 'psh.sid='+encodeURIComponent('s:'+require('cookie-signature').sign(sid,process.env.SESSION_SECRET))}
async function ticket(groupId){const c=(await api('/config/categories')).data.categories[0];const types=(await api('/config/ticket-types')).data.types;const {data}=await api('/tickets','POST',{customerName:'RBAC fixture',moduleText:'General',categoryId:c.id,typeId:types[0].id,shortDescription:'Temporary RBAC verification',description:'Removed after verification',assignmentGroupId:groupId},201);tickets.push(data.ticket.id);return data.ticket}
async function run(){
  try{
    assert(process.env.TEST_USERNAME&&process.env.TEST_PASSWORD,'Supply TEST_USERNAME and TEST_PASSWORD');
    adminCookie=await login(process.env.TEST_USERNAME,process.env.TEST_PASSWORD);adminId=(await api('/auth/me')).data.user.id;
    const groupA=randomUUID(),groupB=randomUUID();groups.push(groupA,groupB);
    for(const id of groups)await pool.query('INSERT INTO assignment_groups(id,name) VALUES($1,$2)',[id,'RBAC '+id]);
    const prefix='RBAC '+randomUUID().slice(0,8);
    const perms={'tickets.view':'groups','tickets.group_view':'groups','tickets.edit':'groups','tickets.create':'own','tickets.status':'groups','tickets.resolve':'groups','tickets.assign':'groups','tickets.priority':'groups','comments.view':'groups','comments.work_note':'groups','attachments.download':'groups','attachments.zip':'groups','sla.view':'groups','dashboard.view':'groups','query.view':'groups','reports.view':'groups','qa.view':'groups','qa.drill':'groups','profile.view':'all','notifications.view':'all','notifications.read':'all'};
    let manager=await role(prefix+' Manager',perms);
    const employee=(await api('/roles')).data.roles.find(r=>r.key==='employee');assert(employee);
    const actor=await user(manager.key,[groupA]);const member=await user('employee',[groupA]);const outsider=await user('employee',[groupB]);
    const cookie=await login(actor.username,'Rbac-Test!4482');
    const allowed=await ticket(groupA),denied=await ticket(groupB);
    const viewed=(await api('/tickets/'+allowed.id,'GET',undefined,200,cookie)).data.ticket;assert.equal(viewed.id,allowed.id);
    await api('/tickets/'+denied.id,'GET',undefined,403,cookie);
    const listed=(await api('/tickets','GET',undefined,200,cookie)).data.tickets;assert(listed.some(t=>t.id===allowed.id));assert(!listed.some(t=>t.id===denied.id));assert.equal(listed.length,1);
    const dash=(await api('/dashboard','GET',undefined,200,cookie)).data;assert.equal(dash.stats.total,1);assert(dash.recentTickets.every(t=>t.id===allowed.id));
    const report=(await api('/reports','GET',undefined,200,cookie)).data;assert.equal(report.summary.total,1);assert(report.allTickets.every(t=>t.ticket_number===allowed.ticket_number));
    const qa=(await api('/sla/qa','GET',undefined,200,cookie)).data;assert(qa.instances.every(t=>t.ticket_id===allowed.id));
    await api('/reports?export=true','GET',undefined,403,cookie);
    await api('/tickets/'+allowed.id,'PUT',{shortDescription:'Edited by scoped manager'},200,cookie);
    await api('/tickets/'+denied.id,'PUT',{shortDescription:'Attempted cross-group edit'},403,cookie);
    await api('/tickets/'+allowed.id,'DELETE',{},403,cookie);
    await api('/tickets/'+allowed.id,'PUT',{ticketOwner:actor.id},403,cookie);
    await api('/tickets/'+allowed.id,'PUT',{assignedTo:outsider.id,workNote:'Attempted cross-group assignment'},403,cookie);
    await api('/tickets/'+allowed.id,'PUT',{assignedTo:member.id,workNote:'Assign within managed team'},200,cookie);
    await api('/tickets/'+allowed.id,'PUT',{status:'RESOLVED'},400,cookie);
    await api('/tickets/'+allowed.id,'PUT',{status:'RESOLVED',workNote:'Resolved during RBAC verification'},200,cookie);
    await api('/tickets/'+allowed.id,'PUT',{status:'CLOSED',workNote:'Should be denied'},403,cookie);
    await api('/users','GET',undefined,403,cookie);
    await api('/config/admin/branding','PUT',{customize:false,organization_name:''},403,cookie);
    await api('/roles','POST',{name:'Privilege attempt',permissions:{},assignable_roles:[],responsibility:''},403,cookie);
    await api('/tickets','GET',undefined,401,'');
    console.log('PASS: record boundaries, scoped lists/dashboards/reports/QA, denied exports and actions');
    // Real file routes must enforce the same record scope (including ZIP).
    const attachmentId=randomUUID();await pool.query("INSERT INTO ticket_attachments(id,ticket_id,file_name,mime_type,file_size,file_data,uploaded_by) VALUES($1,$2,'test.txt','text/plain',4,$3,$4)",[attachmentId,denied.id,Buffer.from('test'),adminId]);
    await api('/attachments/'+attachmentId+'/download','GET',undefined,403,cookie);
    await api('/tickets/'+denied.id+'/attachments/zip','GET',undefined,403,cookie);
    // Changing the stored role is effective immediately on the SAME session.
    const updated={...manager,permissions:{...perms}};delete updated.permissions['tickets.edit'];
    manager=(await api('/roles/'+manager.key,'PUT',updated)).data.role;
    await api('/tickets/'+allowed.id,'PUT',{shortDescription:'Revoked edit'},403,cookie);
    assert(!(await api('/auth/me','GET',undefined,200,cookie)).data.user.permissions['tickets.edit']);
    await api('/roles/'+manager.key,'PUT',updated,409);
    await api('/roles/'+manager.key,'PUT',{...manager,is_active:false},400);
    await api('/roles','POST',{name:prefix+' Manager',responsibility:'Duplicate',permissions:{},assignable_roles:[]},409);
    await api('/roles','POST',{name:prefix+' Invalid',responsibility:'Invalid',permissions:{'made.up.permission':'all'},assignable_roles:[]},400);
    await api('/roles/admin','PUT',{...(await api('/roles')).data.roles.find(r=>r.key==='admin')},400);
    console.log('PASS: immediate revocation, optimistic locking, protected roles, invalid/duplicate role validation');
    const userAdmin=await role(prefix+' User Admin',{'users.view':'all','users.create':'all','users.edit':'all','users.assign_role':'all','users.groups':'all','users.status':'all','users.bulk_validate':'all','users.bulk_create':'all','users.password':'all','profile.view':'all'},['employee',manager.key]);
    const operator=await user(userAdmin.key,[groupA]);const operatorCookie=await fixtureSession(operator);
    const options=(await api('/roles/assignable','GET',undefined,200,operatorCookie)).data.roles;assert(!options.some(r=>r.key==='admin'));assert(options.some(r=>r.key===manager.key));
    await api('/users','POST',{username:'denied_'+randomUUID().slice(0,8),email:'denied@example.invalid',fullName:'Denied',password:'Rbac-Test!4482',role:'admin'},403,operatorCookie);
    await api('/users/'+operator.id,'PUT',{role:manager.key},403,operatorCookie);
    await api('/users/'+adminId+'/reset-password','POST',{password:'Should-Never-Apply!4482'},403,operatorCookie);
    await api('/users/'+member.id+'/reset-mfa','POST',{},403,operatorCookie);
    await api('/users/'+member.id,'PUT',{mfaRequired:true});
    await api('/users/'+member.id,'PUT',{mfaRequired:false},403,operatorCookie);
    await api('/users/'+member.id,'PUT',{managedGroupIds:[groupB]},403,operatorCookie);
    await api('/users/'+adminId,'PUT',{isActive:false},400);
    await api('/users/'+member.id,'DELETE',{deleteTickets:true},403,operatorCookie);
    const bulk=(await api('/users/bulk','POST',{adminPassword:'Rbac-Test!4482',users:[{username:'rbac_bulk_'+randomUUID().slice(0,8),email:'bulk_'+randomUUID().slice(0,8)+'@example.invalid',fullName:'RBAC Bulk Fixture',password:'Rbac-Test!4482',role:'admin'}]},200,operatorCookie)).data;assert.equal(bulk.created,0);assert.equal(bulk.failed.length,1);
    const secondManager=await user(manager.key,[groupB]);const secondCookie=await fixtureSession(secondManager);
    const parallel=await Promise.all(Array.from({length:20},(_,i)=>api('/tickets','GET',undefined,200,i%2?secondCookie:cookie)));
    parallel.forEach((result,i)=>assert(result.data.tickets.every(t=>t.id===(i%2?denied.id:allowed.id))));
    console.log('PASS: 20 concurrent scoped requests remain isolated');
    await pool.query('UPDATE users SET is_active=false WHERE id=$1',[actor.id]);
    await api('/auth/me','GET',undefined,401,cookie);
    console.log('PASS: role assignment boundaries, account security, managed-group delegation, inactive-session rejection, bulk escalation denied');
    const field=(await api('/config/admin/fields','POST',{label:prefix+' Field',field_type:'text',is_required:false,options:[]},201)).data.field;fields.push(field.id);
    let reader=await role(prefix+' Field Reader',{'fields.view':'all'});
    const fieldUser=await user(reader.key);const fieldCookie=await fixtureSession(fieldUser);
    await api('/config/admin/fields','GET',undefined,200,fieldCookie);
    await api('/config/admin/fields/'+field.id,'PUT',{label:'Unauthorized rename'},403,fieldCookie);
    await api('/config/admin/fields/'+field.id,'PUT',{is_required:true},403,fieldCookie);
    reader=(await api('/roles/'+reader.key,'PUT',{...reader,permissions:{'fields.view':'all','fields.required':'all'}})).data.role;
    await api('/config/admin/fields/'+field.id,'PUT',{is_required:true},200,fieldCookie);
    await api('/config/admin/fields/'+field.id,'PUT',{is_active:false},403,fieldCookie);
    await api('/config/admin/fields/'+field.id,'DELETE',{},403,fieldCookie);
    await api('/config/admin/sso','POST',{issuerUrl:'https://example.invalid',clientId:'x',redirectUri:'https://example.invalid/callback',isEnabled:true},403,fieldCookie);
    const granular=await role(prefix+' Priority Only',{'tickets.view':'groups','tickets.priority':'groups'});
    const priorityUser=await user(granular.key,[groupA]);const priorityCookie=await fixtureSession(priorityUser);
    await api('/tickets/'+allowed.id,'PUT',{priority:'HIGH'},200,priorityCookie);
    await api('/tickets/'+allowed.id,'PUT',{description:'Must be denied'},403,priorityCookie);
    console.log('PASS: read-only configuration, integer field IDs, independent required/active settings, and priority-only ticket updates');
    const {authorize}=require('../src/access/policy');
    const ssoRequest={baseUrl:'/api/config',path:'/admin/sso',method:'POST',query:{},body:{issuerUrl:'https://example.invalid',clientId:'test',redirectUri:'https://example.invalid/callback',isEnabled:true},access:{admin:false,permissions:{'sso.edit':'all'},managedGroups:[],assignableRoles:[]}};
    await assert.rejects(()=>authorize(ssoRequest,{rawQuery:async()=>({rows:[{is_enabled:false,issuer_url:'https://example.invalid',client_id:'test',redirect_uri:'https://example.invalid/callback'}]})}),e=>e.status===403);
    console.log('PASS: SSO settings use separate edit and enable/disable permissions');
    const suiteKeys=(await api('/roles/catalog')).data.catalog.map(p=>p.key);assert(new Set(suiteKeys).size===suiteKeys.length);
    console.log(`RBAC integration passed: ${checks} HTTP checks.`);
  }finally{
    // Delete only the IDs registered by this test run. Existing accounts/tickets are not changed.
    if(tickets.length){await pool.query('DELETE FROM notifications WHERE ticket_id=ANY($1::uuid[])',[tickets]);await pool.query('DELETE FROM ticket_sla_instances WHERE ticket_id=ANY($1::uuid[])',[tickets]);await pool.query('DELETE FROM tickets WHERE id=ANY($1::uuid[])',[tickets]);}
    if(users.length){await pool.query('DELETE FROM notifications WHERE user_id=ANY($1::uuid[])',[users]);await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);}
    if(roles.length){await pool.query('DELETE FROM access_role_history WHERE role_key=ANY($1::varchar[])',[roles]);await pool.query('DELETE FROM admin_audit_logs WHERE entity_id=ANY($1::text[])',[roles]);await pool.query('DELETE FROM access_roles WHERE key=ANY($1::varchar[])',[roles]);}
    if(fields.length)await pool.query('DELETE FROM ticket_fields WHERE id=ANY($1::int[])',[fields]);
    if(groups.length)await pool.query('DELETE FROM assignment_groups WHERE id=ANY($1::uuid[])',[groups]);
    if(sessions.length)await pool.query('DELETE FROM session WHERE sid=ANY($1::text[])',[sessions]);
    if(adminCookie)await fetch(url+'/auth/logout',{method:'POST',headers:{Cookie:adminCookie}}).catch(()=>{});
    await pool.end();console.log('RBAC fixtures cleaned up.');
  }
}
run().catch(e=>{console.error(e);process.exitCode=1});
