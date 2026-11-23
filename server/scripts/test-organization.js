// Real routes + authentication middleware + PostgreSQL; disposable schema only.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const express=require('express'),{Client}=require('pg');
const{migrate,connectionConfig}=require('../../database/migrate');
const email=require('../src/services/emailService');for(const key of Object.keys(email))if(key.startsWith('notify'))email[key]=async()=>{};
const pool=require('../src/db/pool'),{scopedSQL}=require('../src/access/context');
let checks=0;
function pass(message){checks++;console.log('PASS: '+message)}
async function main(){
 const db=new Client(connectionConfig());await db.connect();const schema='org_test_'+randomUUID().replaceAll('-','');
 const original={query:pool.query,rawQuery:pool.rawQuery,connect:pool.connect};let server;
 try{
 await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);
 const admin=(await db.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('admin','admin@example.test','Admin','unused','admin') RETURNING id")).rows[0].id;
 const manager=(await db.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('siva','siva@example.test','Siva','unused','manager') RETURNING id")).rows[0].id;
 const ids={admin,manager};
 pool.rawQuery=(...args)=>db.query(...args);pool.query=(sql,...args)=>db.query(typeof sql==='string'?scopedSQL(sql):sql,...args);pool.connect=async()=>({query:(...args)=>db.query(...args),release(){}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={userId:ids[req.headers['x-test-user']||'admin'],destroy(){}};next()});
 app.use('/api/roles',require('../src/routes/roles'));app.use('/api/groups',require('../src/routes/groups'));app.use('/api/departments',require('../src/routes/departments'));app.use('/api/users',require('../src/routes/users'));app.use('/api/tickets',require('../src/routes/tickets'));app.use('/api/dashboard',require('../src/routes/dashboard'));app.use('/api/config',require('../src/routes/config'));app.use('/api/attachments',require('../src/routes/attachments'));app.use('/api/reports',require('../src/routes/reports'));app.use('/api/sla',require('../src/routes/sla'));
 for(const [prefix,file] of [['auth','auth'],['kb','kb'],['audit','audit'],['admin-audit','adminAudit'],['notifications','notifications'],['subcategories','subcategories']])app.use('/api/'+prefix,require('../src/routes/'+file));
 app.use((err,req,res,next)=>res.status(err.status||(['23514','23505','23503','22P02'].includes(err.code)?400:500)).json({message:err.message}));
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const root='http://127.0.0.1:'+server.address().port;
 async function request(path,method='GET',body,who='admin'){const r=await fetch(root+'/api'+path,{method,headers:{'Content-Type':'application/json','x-test-user':who},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()}}
 async function ok(path,method,body,who){const r=await request(path,method,body,who);assert(r.status<300,JSON.stringify({path,...r}));return r.data}
 async function rejected(path,method,body,who='manager'){const r=await request(path,method,body,who);assert([400,403,404,405].includes(r.status),JSON.stringify({path,...r}));return r}
 const geo=await ok('/departments/geography'),apac=geo.regions.find(r=>r.name==='Asia Pacific').id,europe=geo.regions.find(r=>r.name==='Europe').id;
 const my=geo.countries.find(c=>c.name==='Malaysia').id,sg=geo.countries.find(c=>c.name==='Singapore').id,fr=geo.countries.find(c=>c.name==='France').id;
 const hr=(await ok('/departments','POST',{name:'HR',regionId:apac})).group.id,finance=(await ok('/departments','POST',{name:'Finance',regionId:europe})).group.id;
 await rejected('/departments','POST',{name:'hr',regionId:apac},'admin');
 await ok('/departments','POST',{name:'HR',regionId:europe});pass('Department names unique within a region; same name allowed in another region');
 const aia=(await ok('/departments','POST',{name:'AIA',parentId:hr,countryId:my})).group.id,kier=(await ok('/departments','POST',{name:'KIER',parentId:hr,countryId:sg})).group.id;
 await rejected('/departments','POST',{name:'aia',parentId:hr,countryId:sg},'admin');await rejected('/departments','POST',{name:'Wrong country',parentId:hr,countryId:fr},'admin');pass('Subgroup uniqueness and region/country relationship enforced at API');
 await db.query('INSERT INTO user_managed_groups VALUES($1,$2)',[manager,hr]);
 await rejected('/departments','POST',{name:'Unauthorized department',regionId:apac});
 await rejected('/departments/'+hr,'PUT',{name:'Rename HR',regionId:apac});
 const future=(await ok('/departments','POST',{name:'New HR',parentId:hr,countryId:my},'manager')).group.id;
 await rejected('/departments','POST',{name:'Outside',parentId:finance,countryId:fr});pass('Whole-department Manager creates subgroups only within their department; cannot create or edit departments');
 let r=await ok('/departments/tree',undefined,undefined,'manager');assert(r.groups.some(g=>g.id===future)&&!r.groups.some(g=>g.id===finance));pass('Manager tree excludes outside departments');
 async function employee(name){const u=(await ok('/users','POST',{username:name,email:name+'@example.test',fullName:name,password:'Test!'+randomUUID(),role:'employee',groupIds:[],managedGroupIds:[],mfaRequired:true})).user;ids[name]=u.id;return u.id}
 const swathi=await employee('swathi'),saranya=await employee('saranya'),supriya=await employee('supriya'),karthik=await employee('karthik');

 let availability=await ok('/users/check-availability','POST',{username:'  SWATHI ',email:'unused@example.test'});assert.equal(availability.availability.username.available,false);assert.equal(availability.availability.email.available,true);
 availability=await ok('/users/check-availability','POST',{email:'SARANYA@EXAMPLE.TEST'});assert.equal(availability.availability.email.available,false);
 pass('Live account availability checks username and email case-insensitively without returning account details');
 await db.query('UPDATE users SET is_active=false WHERE id=$1',[swathi]);availability=await ok('/users/check-availability','POST',{username:'swathi'});assert.equal(availability.availability.username.available,false);await db.query('UPDATE users SET is_active=true WHERE id=$1',[swathi]);
 const deletedAccount=await employee('deleted_availability');await db.query('UPDATE users SET deleted_at=NOW() WHERE id=$1',[deletedAccount]);availability=await ok('/users/check-availability','POST',{username:'deleted_availability',email:'deleted_availability@example.test'});assert(availability.availability.username.available&&availability.availability.email.available);
 pass('Inactive accounts reserve their details; soft-deleted accounts do not block reuse');
 await rejected('/users/check-availability','POST',{} ,'admin');await rejected('/users/check-availability','POST',{username:['swathi']},'admin');await rejected('/users/check-availability','POST',{username:'bad name'},'admin');await rejected('/users/check-availability','POST',{email:'bad-email'},'admin');
 await rejected('/users/check-availability','POST',{username:'swathi'},'manager');await rejected('/users/check-availability','POST',{username:'swathi'},'saranya');
 await db.query("UPDATE access_roles SET permissions=permissions||'{\"users.create\":\"all\"}'::jsonb WHERE key='manager'");await rejected('/users/check-availability','POST',{username:'swathi'},'manager');await db.query("UPDATE access_roles SET permissions=permissions-'users.create' WHERE key='manager'");
 pass('Account checks reject malformed inputs and are restricted to Admin');
 const accountBody={username:'SWATHI',email:'different@example.test',fullName:'Someone else',password:'Test!'+randomUUID(),role:'employee'};
 let conflict=await request('/users','POST',accountBody);assert.equal(conflict.status,409);assert(conflict.data.message.includes('Username'));
 conflict=await request('/users','POST',{...accountBody,username:'different',email:'SWATHI@EXAMPLE.TEST'});assert.equal(conflict.status,409);assert(conflict.data.message.includes('Email'));
 pass('Saving an existing username or email is rejected by the server, including uppercase variants');
 availability=await ok('/users/check-availability','POST',{username:'claimed_after_check'});assert(availability.availability.username.available);await employee('claimed_after_check');conflict=await request('/users','POST',{...accountBody,username:'claimed_after_check'});assert.equal(conflict.status,409);
 await ok('/users','POST',{...accountBody,username:'same_full_name',email:'same-full-name@example.test',fullName:'swathi'});
 pass('Stale availability cannot create a duplicate; different people may share a full name');
 await rejected('/users','POST',{username:'hacker',email:'hacker@example.test',fullName:'Hacker',password:'Test!12345',role:'employee'});pass('Manager cannot create accounts');
 await ok('/departments/members','POST',{userIds:[swathi],groupIds:[aia]},'manager');
 await rejected('/departments/members','POST',{userIds:[swathi],groupIds:[kier]});
 await rejected('/departments/members','POST',{userIds:[saranya],groupIds:[finance]});pass('Manager adds only completely unassigned existing users, within managed scope');
 await ok('/departments/members','POST',{userIds:[saranya],groupIds:[aia,kier]},'manager');
 await ok('/departments/members','POST',{userIds:[karthik],groupIds:[finance]});
 await ok('/departments/members','POST',{userIds:[supriya],groupIds:[hr]});
 await ok('/departments/members','POST',{userIds:[swathi],groupIds:[hr]});
 await ok(`/departments/${hr}/members/${swathi}`,'DELETE');
 assert.deepEqual((await db.query('SELECT group_id FROM user_groups WHERE user_id=$1',[swathi])).rows.map(r=>r.group_id),[aia]);pass('Removing department grant preserves independent subgroup membership');
 await ok('/departments/members','POST',{userIds:[swathi],groupIds:[hr]});await ok(`/departments/${aia}/members/${swathi}`,'DELETE');
 assert((await db.query('SELECT 1 FROM user_groups WHERE user_id=$1 AND group_id=$2',[swathi,hr])).rowCount);pass('Removing subgroup grant preserves department grant');

 const unused=(await ok('/departments','POST',{name:'Unused department',regionId:apac})).group.id;
 await ok('/departments/'+unused,'DELETE');await rejected('/departments/'+unused,'GET',undefined,'admin');
 const blockedDepartment=await rejected('/departments/'+hr,'DELETE',undefined,'admin');assert(blockedDepartment.data.message.includes('sub departments')&&blockedDepartment.data.message.includes('memberships')&&blockedDepartment.data.message.includes('management assignments'));
 pass('Unused departments can be deleted; in-use departments return actionable linked-record counts without losing data');
 const tickets=[];
 for(const [number,department,subgroup,assignee]of[['HR-AIA',hr,aia,saranya],['HR-KIER',hr,kier,null],['HR-DIRECT',hr,null,null],['HR-FUTURE',hr,future,null],['FINANCE',finance,null,karthik]]){
   tickets.push((await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id,subgroup_id) VALUES($1,'Example',$1,'Details',$2,$3,$4,$5) RETURNING *",[number,department===hr?manager:admin,assignee,department,subgroup])).rows[0]);
 }


 const blockedWithTickets=await rejected('/departments/'+hr,'DELETE',undefined,'admin');assert(blockedWithTickets.data.message.includes('tickets'));assert.equal(Number((await db.query('SELECT COUNT(*) FROM tickets WHERE assignment_group_id=$1',[hr])).rows[0].count),4);
 pass('Deleting a department with tickets is blocked and preserves every ticket');
 let directory=await ok('/users?scope=with_tickets',undefined,undefined,'manager');
 assert(directory.users.some(u=>u.id===saranya)&&directory.users.some(u=>u.id===swathi)&&directory.users.some(u=>u.id===supriya));
 assert(!directory.users.some(u=>u.id===karthik||u.id===admin));
 const userSummary=await ok('/users/'+saranya+'?scope=with_tickets',undefined,undefined,'manager');
 let bucket=await ok('/tickets?userTickets='+saranya,undefined,undefined,'manager');
 assert.equal(Number(userSummary.user.ticket_count),bucket.pagination.total);assert.deepEqual(bucket.tickets.map(t=>t.id),[tickets[0].id]);
 await rejected('/users/'+karthik+'?scope=with_tickets','GET',undefined,'manager');
 await rejected('/users/'+karthik,'GET',undefined,'manager');
 await rejected('/tickets?userTickets='+karthik,'GET',undefined,'manager');
 await rejected('/users?scope=with_tickets','GET',undefined,'saranya');
 await rejected('/tickets?userTickets='+saranya,'GET',undefined,'saranya');
 pass('Manager Tickets by User lists managed-team members; counts match drilldown and outside user URLs are denied');
 // A historical ticket for a now-shared user must not leak through an All ticket-reading permission.
 await db.query("UPDATE access_roles SET permissions=jsonb_set(permissions,'{tickets.view}','\"all\"') WHERE key='manager'");
 const outsideSharedTicket=(await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id) VALUES('OTHER-DEPARTMENT','Example','Other department','Outside team',$1,$2,$3) RETURNING id",[admin,saranya,finance])).rows[0].id;
 directory=await ok('/users?scope=with_tickets',undefined,undefined,'manager');assert.equal(Number(directory.users.find(u=>u.id===saranya).ticket_count),1);
 bucket=await ok('/tickets?userTickets='+saranya,undefined,undefined,'manager');assert.equal(bucket.pagination.total,1);assert(!bucket.tickets.some(t=>t.id===outsideSharedTicket));
 const adminDirectory=await ok('/users?scope=with_tickets');assert(adminDirectory.users.some(u=>u.id===karthik));assert.equal(Number(adminDirectory.users.find(u=>u.id===saranya).ticket_count),2);
 await db.query('DELETE FROM tickets WHERE id=$1',[outsideSharedTicket]);
 await db.query("UPDATE access_roles SET permissions=jsonb_set(permissions,'{tickets.view}','\"groups\"') WHERE key='manager'");
 pass('Directory counts and tickets exclude other Departments even with All ticket permission; Admin retains global access');
 let list=await ok('/tickets',undefined,undefined,'swathi');assert.equal(list.tickets.length,4);pass('Whole-department Employee sees direct and every subgroup ticket, including new subgroups');
 list=await ok('/tickets',undefined,undefined,'saranya');assert.equal(list.tickets.length,2);pass('Multiple subgroup membership shows only selected subgroups');
 await rejected('/tickets/'+tickets.find(t=>t.ticket_number==='FINANCE').id,'GET',undefined,'saranya');
 const attachment=(await db.query("INSERT INTO ticket_attachments(ticket_id,file_name,file_data,mime_type,file_size,uploaded_by) VALUES($1,'x.txt','not-read','text/plain',1,$2) RETURNING id",[tickets[4].id,admin])).rows[0].id;
 await rejected('/attachments/'+attachment,'GET',undefined,'saranya');pass('Direct ticket and attachment requests cannot bypass department access');
 await rejected('/tickets/'+tickets[4].id+'/comments','POST',{body:'Outside comment'},'saranya');await rejected('/sla/ticket/'+tickets[4].id,'GET',undefined,'saranya');
 await ok('/reports',undefined,undefined,'manager');
 pass('Comment and SLA direct URLs enforce access; Manager scoped reports remain available');
 let team=await ok('/dashboard?team=true',undefined,undefined,'manager');assert.equal(Number(team.stats.total),4);
 // Siva created HR tickets, but the only assigned one belongs to Saranya.
 await db.query('UPDATE tickets SET ticket_owner=$1 WHERE assignment_group_id=$2',[manager,hr]);
 let personal=await ok('/dashboard?personal=true',undefined,undefined,'manager');assert.equal(Number(personal.stats.total),0);assert.equal(personal.recentTickets.length,0);
 assert(personal.chartData.every(d=>['Open','InProgress','Pending','Resolved','Closed'].every(k=>d[k]===0)));
 let mine=await ok('/tickets?myTickets=true',undefined,undefined,'manager');assert.equal(mine.pagination.total,0);
 mine=await ok('/tickets?myTickets=true',undefined,undefined,'saranya');assert.deepEqual(mine.tickets.map(t=>t.id),[tickets[0].id]);
 const saranyaDashboard=await ok('/dashboard?personal=true',undefined,undefined,'saranya');assert.equal(saranyaDashboard.stats.total,1);
 pass('Creator and owner are excluded from My Tickets/My Dashboard; assignee sees the ticket');
 // Another person creates a ticket assigned to Siva: every personal widget must include it.
 await db.query("UPDATE tickets SET created_by=$1,assigned_to=$2,priority='CRITICAL',created_at=NOW()-INTERVAL '1 day' WHERE id=$3",[admin,manager,tickets[2].id]);
 personal=await ok('/dashboard?personal=true',undefined,undefined,'manager');assert.equal(personal.stats.total,1);assert.deepEqual(personal.recentTickets.map(t=>t.id),[tickets[2].id]);assert.equal(personal.stats.critical,1);assert.equal(personal.slaBreaches.length,1);assert(personal.chartData.reduce((sum,d)=>sum+d.Open,0)===1);assert.equal(personal.trends.total.change,100);
 mine=await ok('/tickets?myTickets=true',undefined,undefined,'manager');assert.deepEqual(mine.tickets.map(t=>t.id),[tickets[2].id]);
 const adminPersonal=await ok('/dashboard?personal=true');assert.equal(adminPersonal.stats.total,0);
 team=await ok('/dashboard?team=true',undefined,undefined,'manager');assert.equal(team.stats.total,4);assert.equal(team.chartData.reduce((sum,d)=>sum+d.Open,0),4);
 pass('Personal counts, charts, priorities, SLA and recent tickets use assignment only; team includes unassigned tickets');
 // Reassignment must remove it from Siva immediately, without changing creator/owner.
 await db.query('UPDATE tickets SET assigned_to=$1 WHERE id=$2',[saranya,tickets[2].id]);
 mine=await ok('/tickets?myTickets=true',undefined,undefined,'manager');assert.equal(mine.pagination.total,0);
 personal=await ok('/dashboard?personal=true',undefined,undefined,'manager');assert.equal(personal.stats.total,0);
 team=await ok('/dashboard?team=true',undefined,undefined,'manager');assert.equal(team.stats.total,4);
 pass('Reassignment removes tickets from personal views while retaining them in Team Dashboard');
 // Even an All scope on the Team Dashboard permission is limited to managed Departments.
 await db.query("UPDATE access_roles SET permissions=jsonb_set(jsonb_set(permissions,'{dashboard.team}','\"all\"'),'{tickets.view}','\"all\"') WHERE key='manager'");
 await db.query('INSERT INTO user_groups(user_id,group_id) VALUES($1,$2)',[manager,finance]);
 team=await ok('/dashboard?team=true',undefined,undefined,'manager');assert.equal(team.stats.total,4);
 await db.query("UPDATE access_roles SET permissions=jsonb_set(jsonb_set(permissions,'{dashboard.team}','\"groups\"'),'{tickets.view}','\"groups\"') WHERE key='manager'");
 await db.query('DELETE FROM user_groups WHERE user_id=$1 AND group_id=$2',[manager,finance]);
 pass('Team Dashboard excludes unmanaged Departments even with All dashboard scope');
 await db.query('INSERT INTO user_managed_groups VALUES($1,$2)',[manager,finance]);
 team=await ok('/dashboard?team=true',undefined,undefined,'manager');assert.equal(Number(team.stats.total),5);pass('Admin can later add Finance management while preserving HR');
 team=await ok('/dashboard?team=true&departmentId='+hr,undefined,undefined,'manager');assert.equal(Number(team.stats.total),4);pass('Team dashboard department filter preserves authorization');
 await db.query('DELETE FROM user_managed_groups WHERE user_id=$1 AND group_id=$2',[manager,finance]);
 const aiaTicket=tickets[0];await rejected('/tickets/'+aiaTicket.id,'PUT',{assignedTo:karthik,workNote:'Attempt'},'manager');
 await ok('/tickets/'+aiaTicket.id,'PUT',{assignedTo:swathi,workNote:'Assign whole HR member'},'manager');pass('Assignment accepts department-inherited membership and rejects outside users');

 const category=(await db.query("INSERT INTO categories(name) VALUES('Test Category') RETURNING id")).rows[0].id;
 const payload={customerName:'Example',moduleText:'HR',categoryId:category,shortDescription:'Created through API',description:'Subgroup creation scenario',assignmentGroupId:hr,subgroupId:aia,assignedTo:swathi};
 const created=await ok('/tickets','POST',payload,'manager');assert(created.ticket.subgroup_id===aia);
 const detail=await ok('/tickets/'+created.ticket.id,undefined,undefined,'manager');assert.equal(detail.ticket.subgroup_name,'AIA');
 await rejected('/tickets','POST',{...payload,assignmentGroupId:finance},'manager');
 await rejected('/tickets','POST',{...payload,assignedTo:karthik},'manager');
 await rejected('/tickets','POST',{...payload,subgroupId:hr},'manager');
 await ok('/tickets','POST',{...payload,assignedTo:null},'saranya');
 await db.query("UPDATE users SET role='employee' WHERE id=$1",[saranya]);
 pass('User can create tickets within their department membership');
 pass('Real ticket creation persists Department/Subgroup and rejects invalid combinations and assignees');
 const subgroupList=await ok('/tickets?departmentId='+hr+'&subgroupId='+aia,undefined,undefined,'manager');assert(subgroupList.tickets.every(t=>t.assignment_group_id===hr&&t.subgroup_id===aia));
 const adminFilter=await ok('/tickets?departmentId='+finance);assert(adminFilter.tickets.length===1&&adminFilter.tickets[0].assignment_group_id===finance);
 await rejected('/tickets?subgroupId=bad','GET',undefined,'manager');
 pass('Department and subgroup filters work for Admin and Manager without widening access');
 await rejected('/departments/settings','PUT',{allow_multiple:false},'admin');
 assert.equal((await ok('/departments/settings')).settings.allow_multiple,true);
 await assert.rejects(db.query('UPDATE organization_settings SET allow_multiple=false WHERE id=1'),e=>e.code==='23514');
 pass('Multiple membership is always enabled; neither old APIs nor database writes can switch it OFF');
 await ok('/users/'+saranya,'PUT',{groupIds:[aia,kier]});
 assert.deepEqual((await db.query('SELECT group_id FROM user_groups WHERE user_id=$1 ORDER BY group_id',[saranya])).rows.map(g=>g.group_id),[aia,kier].sort());
 pass('Checking two subgroups saves membership in both');
 await ok('/users/'+saranya,'PUT',{groupIds:[aia]});
 assert.deepEqual((await db.query('SELECT group_id FROM user_groups WHERE user_id=$1',[saranya])).rows.map(g=>g.group_id),[aia]);
 pass('Unchecking one subgroup removes only that membership');
 await ok('/users/'+saranya,'PUT',{groupIds:[hr,finance]});
 const multiDepartmentTickets=await ok('/tickets?groupView=true','GET',undefined,'saranya');
 assert(multiDepartmentTickets.tickets.some(t=>t.assignment_group_id===hr)&&multiDepartmentTickets.tickets.some(t=>t.assignment_group_id===finance));
 pass('Whole-department checkboxes grant access across multiple departments and their subgroups');
 await ok('/users/'+manager,'PUT',{managedGroupIds:[hr,finance]});
 pass('Manager oversight remains independent from ordinary membership');
 await ok('/users/'+saranya,'PUT',{groupIds:[aia,kier]});
 // Narrow Manager to one subgroup: no sibling creation or broader user/ticket visibility.
 await ok('/users/'+manager,'PUT',{managedGroupIds:[aia]});
 await rejected('/departments','POST',{name:'Sibling attempt',parentId:hr,countryId:my});
 await rejected('/departments/'+kier,'GET');await rejected('/tickets/'+tickets[1].id,'GET');pass('Subgroup-only manager cannot create siblings or read sibling tickets/subgroups');
 await ok('/departments/'+aia,'PUT',{name:'AIA',countryId:my},'manager');pass('Subgroup-only Manager can edit their own subgroup');

 const siblingUser=await employee('sibling_member');await ok('/users/'+siblingUser,'PUT',{groupIds:[kier]});
 directory=await ok('/users?scope=with_tickets',undefined,undefined,'manager');assert(!directory.users.some(u=>u.id===siblingUser));assert(directory.users.some(u=>u.id===swathi));
 bucket=await ok('/tickets?userTickets='+saranya,undefined,undefined,'manager');assert(bucket.tickets.every(t=>t.subgroup_id===aia));
 await rejected('/users/'+siblingUser+'?scope=with_tickets','GET',undefined,'manager');
 pass('Subgroup-only ticket directory includes inherited members but excludes sibling users and tickets');
 r=await ok('/departments/'+aia+'/members',undefined,undefined,'manager');assert(r.users.some(u=>u.id===swathi&&u.assignments.some(a=>a.inherited&&!a.removable)));pass('Subgroup members show inherited department grants without allowing their removal');
 const candidate=await employee('unassigned');r=await ok('/departments/candidates',undefined,undefined,'manager');assert(r.users.some(u=>u.id===candidate)&&!r.users.some(u=>u.id===swathi));pass('Manager picker excludes already assigned users');
 await ok('/departments/members','POST',{userIds:[candidate],groupIds:[aia]},'manager');
 r=await ok('/users/team',undefined,undefined,'manager');assert(r.users.some(u=>u.id===candidate)&&!r.users.some(u=>u.id===karthik));pass('Membership changes immediately appear in Manager Users');
 await rejected('/departments/settings','PUT',{allow_multiple:false});await rejected('/departments/geography','POST',{kind:'region',name:'Bad'});pass('Only Admin manages geography; Managers cannot change the fixed membership policy');

 await ok('/users/'+manager,'PUT',{managedGroupIds:[]});directory=await ok('/users?scope=with_tickets',undefined,undefined,'manager');assert.equal(directory.users.length,0);
 await rejected('/users/'+saranya+'?scope=with_tickets','GET',undefined,'manager');
 await ok('/users/'+manager,'PUT',{managedGroupIds:[aia]});
 pass('Removing Manager assignments immediately removes directory access');

 // Every default role: no membership, member-only, and managed access where allowed.
 const {isManager}=require('../src/access/managedAccess');
 const {recordAllowed,scopePredicate}=require('../src/access/context');
 const fs=require('node:fs'),path=require('node:path');
 const ui=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../../client/src/utils/ticketAccess.js'),'utf8')).toString('base64'));
 const roleRows=(await db.query('SELECT * FROM access_roles WHERE is_active ORDER BY key')).rows;
 let matrixChecks=0;
 for(const role of roleRows){
   const tag='matrix_'+role.key;
   const person=(await db.query('INSERT INTO users(username,email,full_name,password_hash,role) VALUES($1,$2,$1,\'unused\',$3) RETURNING id',[tag,tag+'@example.test',role.key])).rows[0].id;ids[tag]=person;
   const ownTicket=(await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id) VALUES($1,'Matrix','Assigned','Detail',$2,$3,$4) RETURNING *",[tag.slice(0,20),admin,person,finance])).rows[0];
   const peerTicket=tickets[1];
   for(const membership of [[],[hr]]){
     await db.query('DELETE FROM user_groups WHERE user_id=$1',[person]);for(const g of membership)await db.query('INSERT INTO user_groups VALUES($1,$2)',[person,g]);
     const personalPage=await request('/tickets?myTickets=true','GET',undefined,tag);
     if(role.permissions['tickets.view']||role.key==='admin'){
       assert.equal(personalPage.status,200,tag);assert.deepEqual(personalPage.data.tickets.map(t=>t.id),[ownTicket.id],tag+' assigned-only');
       const ownDetail=await request('/tickets/'+ownTicket.id,'GET',undefined,tag);assert.equal(ownDetail.status,200,tag+' own ticket');
       const peerDetail=await request('/tickets/'+peerTicket.id,'GET',undefined,tag);
       const allowed=role.key==='admin'||membership.length&&role.permissions['tickets.view']==='related';
       assert.equal(peerDetail.status,allowed?200:403,tag+' no unintended team access');
     }else assert.equal(personalPage.status,403,tag+' no ticket permission');
     if(role.permissions['dashboard.view']||role.key==='admin'){
       const d=await ok('/dashboard?personal=true','GET',undefined,tag);assert.equal(d.stats.total,1,tag+' personal dashboard');
     }
     if(role.permissions['dashboard.team']||role.key==='admin'){
       const d=await ok('/dashboard?team=true','GET',undefined,tag);assert.equal(Number(d.stats.total),0,tag+' no managed grants');
     }
     const create=await request('/tickets','POST',{...payload,assignedTo:null},tag);
     const allowedCreate=role.key==='admin'||!!role.permissions['tickets.create']&&membership.length;
     assert.equal(create.status,allowedCreate?201:403,tag+' create within membership only');
     const edit=await request('/tickets/'+ownTicket.id,'PUT',{description:'Personal role matrix edit'},tag);
     assert.equal(edit.status,role.key==='admin'||role.permissions['tickets.edit']&&role.permissions['tickets.view']?200:403,tag+' edit permission');
     const ctx={userId:person,role:role.key,admin:role.key==='admin',permissions:role.permissions,managedGroups:[],memberGroups:membership};
     for(const ticket of [ownTicket,peerTicket])for(const key of ['tickets.view','tickets.edit','tickets.assign','comments.add','attachments.download']){
       const sql=await db.query('SELECT id FROM tickets t WHERE id=$1 AND ('+scopePredicate(ctx,key)+')',[ticket.id]);
       assert.equal(recordAllowed(ctx,key,ticket),!!sql.rowCount,tag+' SQL / backend parity');
       assert.equal(ui.canAccessTicket({id:person,...ctx},key,ticket),!!sql.rowCount,tag+' UI parity');
     }
     matrixChecks++;
   }
   if(isManager(role)){
     await ok('/users/'+person,'PUT',{managedGroupIds:[hr]});
     if(role.permissions['tickets.view']||role.key==='admin')await ok('/tickets/'+peerTicket.id,'GET',undefined,tag);
     if(role.permissions['dashboard.team']||role.key==='admin'){
       const team=await ok('/dashboard?team=true','GET',undefined,tag);assert.equal((await db.query('SELECT 1 FROM tickets WHERE id=ANY($1::uuid[]) AND assignment_group_id<>$2',[team.recentTickets.map(t=>t.id),hr])).rowCount,0);assert(team.stats.total>0);
     }
     await ok('/users/'+person,'PUT',{managedGroupIds:[]});
   }else if(role.key!=='admin'){
     await rejected('/users/'+person,'PUT',{managedGroupIds:[hr]},'admin');
     // Historical invalid grants are inert, including form lookups and direct URLs.
     await db.query('INSERT INTO user_managed_groups VALUES($1,$2)',[person,finance]);
     const lookup=await ok('/groups/mine','GET',undefined,tag);assert(!lookup.groups.some(g=>g.group_id===finance));
     const unrelated=tickets.find(t=>t.assignment_group_id===finance);
     if(role.permissions['tickets.view'])await rejected('/tickets/'+unrelated.id,'GET',undefined,tag);
     await db.query('DELETE FROM user_managed_groups WHERE user_id=$1',[person]);
   }
   pass(role.name+': no managed grants, membership-only, assignment, role actions and oversight eligibility checked');
 }
 pass(matrixChecks+' default-role/membership combinations agree across SQL, API and UI permissions');
 // Bittu reproduction: Manager, ordinary HR membership, no managed access.
 const bittu=ids.matrix_manager;
 await ok('/users/'+bittu,'PUT',{groupIds:[hr,finance],managedGroupIds:[]});
 let bittuPersonal=await ok('/tickets?myTickets=true','GET',undefined,'matrix_manager');assert(bittuPersonal.tickets.every(t=>t.assigned_to===bittu));assert.equal(bittuPersonal.pagination.total,1);
 const bittuTeam=await ok('/dashboard?team=true','GET',undefined,'matrix_manager');assert.equal(bittuTeam.stats.total,0);
 await ok('/tickets/'+bittuPersonal.tickets[0].id,'PUT',{description:'Manager personal work without oversight'},'matrix_manager');
 const noTeamCandidates=await ok('/departments/candidates','GET',undefined,'matrix_manager');assert.equal(noTeamCandidates.users.length,0);
 pass('Bittu reproduction: two memberships, no managed grants; personal work succeeds and team access stays empty');
 const downgrade=ids.matrix_manager;
 await ok('/users/'+downgrade,'PUT',{managedGroupIds:[hr]});
 await rejected('/users/'+downgrade,'PUT',{role:'employee'},'admin');
 assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[downgrade])).rows[0].role,'manager');
 await ok('/users/'+downgrade,'PUT',{role:'employee',managedGroupIds:[]});
 assert.equal((await db.query('SELECT 1 FROM user_managed_groups WHERE user_id=$1',[downgrade])).rowCount,0);
 pass('Role downgrade requires explicit removal of managed access and is atomic');
 const available=await ok('/roles/assignable');assert.deepEqual(available.roles.map(r=>r.name),['Admin','User','Manager']);
 await rejected('/roles','POST',{name:'Fourth role',permissions:{}},'admin');
 await rejected('/roles/manager','PUT',{name:'Changed'},'admin');
 await rejected('/roles/manager','DELETE',undefined,'admin');
 pass('Exactly three roles can be selected; creating, editing and deleting roles is disabled');
 await migrate(db);await migrate(db);assert((await db.query('SELECT 1 FROM user_groups WHERE user_id=$1 AND group_id=$2',[candidate,aia])).rowCount);pass('Repeated migrations preserve departments, subgroups and access grants');
 await db.query("UPDATE access_roles SET permissions=permissions-'users.tickets' WHERE key='manager'");await migrate(db);assert((await db.query("SELECT permissions FROM access_roles WHERE key='manager'")).rows[0].permissions['users.tickets']);pass('Migration restores the fixed Manager responsibilities');

 // My Query inbox: durable, per-person opened receipts and assignment episodes.
 const inboxUser=await employee('inbox_reader'),inboxPeer=await employee('inbox_peer');
 await ok('/users/'+inboxUser,'PUT',{groupIds:[finance]});await ok('/users/'+inboxPeer,'PUT',{groupIds:[finance]});
 const inboxTickets=[];for(const state of ['NEW','OPEN','ON_HOLD'])inboxTickets.push((await ok('/tickets','POST',{...payload,assignmentGroupId:finance,subgroupId:null,assignedTo:inboxUser,status:state})).ticket);
 const inboxBadge=async who=>(await ok('/dashboard/query/badge','GET',undefined,who)).unopened;
 assert.equal(await inboxBadge('inbox_reader'),3);
 let inbox=await ok('/dashboard/query?view=mine','GET',undefined,'inbox_reader');assert.equal(inbox.total,3);assert.equal(inbox.summary.mine,3);assert.equal(inbox.counts.ON_HOLD,1);
 await ok('/dashboard/query','GET',undefined,'inbox_reader');assert.equal(await inboxBadge('inbox_reader'),3);
 pass('Three arrivals produce badge 3; My Query lists all states without marking anything opened');
 await ok('/tickets/'+inboxTickets[0].id,'GET',undefined,'inbox_reader');assert.equal(await inboxBadge('inbox_reader'),3);
 for(const t of inboxTickets.slice(0,2))await ok('/tickets/'+t.id+'/opened','POST',{revision:t.inbox_revision},'inbox_reader');
 assert.equal(await inboxBadge('inbox_reader'),1);
 await ok('/tickets/'+inboxTickets[0].id+'/opened','POST',{revision:inboxTickets[0].inbox_revision},'inbox_reader');assert.equal(await inboxBadge('inbox_reader'),1);
 pass('Opening exactly two of three tickets leaves badge 1; duplicate acknowledgement is idempotent');
 await ok('/tickets/'+inboxTickets[2].id+'/opened','POST',{revision:inboxTickets[2].inbox_revision,userId:inboxUser},'inbox_peer');assert.equal(await inboxBadge('inbox_reader'),1);
 await rejected('/tickets/'+tickets[0].id+'/opened','POST',{revision:'1'},'inbox_reader');
 await rejected('/tickets/'+inboxTickets[2].id+'/opened','POST',{revision:'999999'},'inbox_reader');
 pass('Opening records is authorized; clients cannot clear another user or acknowledge a future revision');
 const episode=inboxTickets[2];
 await ok('/tickets/'+episode.id,'PUT',{assignedTo:inboxPeer,workNote:'Reassign episode'},'admin');assert.equal(await inboxBadge('inbox_reader'),0);assert.equal(await inboxBadge('inbox_peer'),1);
 await ok('/tickets/'+episode.id,'PUT',{assignedTo:inboxUser,workNote:'Return episode'},'admin');assert.equal(await inboxBadge('inbox_reader'),1);
 await ok('/tickets/'+episode.id+'/opened','POST',{revision:'1'},'inbox_reader');assert.equal(await inboxBadge('inbox_reader'),1);
 const latestEpisode=(await ok('/tickets/'+episode.id,'GET',undefined,'inbox_reader')).ticket;
 await ok('/tickets/'+episode.id+'/opened','POST',{revision:latestEpisode.inbox_revision},'inbox_reader');assert.equal(await inboxBadge('inbox_reader'),0);
 pass('Reassignment removes the old inbox item; return assignment is new and stale acknowledgements cannot clear it');
 const queueTicket=(await ok('/tickets','POST',{...payload,assignmentGroupId:finance,subgroupId:null,assignedTo:null,status:'PENDING'})).ticket;
 assert.equal(await inboxBadge('inbox_reader'),1);assert.equal(await inboxBadge('inbox_peer'),1);
 inbox=await ok('/dashboard/query?view=unassigned&status=PENDING','GET',undefined,'inbox_reader');assert(inbox.tickets.some(t=>t.id===queueTicket.id));assert(inbox.tickets.every(t=>!t.assigned_to&&t.assignment_group_id===finance));
 await ok('/tickets/'+queueTicket.id+'/opened','POST',{revision:queueTicket.inbox_revision},'inbox_reader');assert.equal(await inboxBadge('inbox_reader'),0);assert.equal(await inboxBadge('inbox_peer'),1);
 pass('Permitted unassigned tickets appear in all states; each person must open their own copy');
 await ok('/tickets/'+queueTicket.id,'PUT',{priority:'HIGH'},'admin');assert.equal(await inboxBadge('inbox_reader'),0);
 const openedCount=await db.query('SELECT COUNT(*)::int AS count FROM ticket_inbox_receipts WHERE user_id=$1',[inboxUser]);assert(openedCount.rows[0].count>=4);
 await migrate(db);assert.equal(await inboxBadge('inbox_reader'),0);
 pass('Open receipts survive ordinary edits, reload-style requests and repeated database migrations');
 await ok('/users/'+inboxUser,'PUT',{groupIds:[]});inbox=await ok('/dashboard/query','GET',undefined,'inbox_reader');assert.equal(inbox.summary.unassigned,0);assert.equal(inbox.summary.mine,3);
 pass('Removing department membership removes queue access while keeping personally assigned work');
 for(const path of ['/dashboard/query?view=invalid','/dashboard/query?page=-1','/dashboard/query?limit=1000','/dashboard/query?startDate=2026-02-31','/dashboard/query?startDate=2026-12-31&endDate=2026-01-01'])await rejected(path,'GET',undefined,'inbox_reader');
 inbox=await ok('/dashboard/query?search=does-not-exist','GET',undefined,'inbox_reader');assert.equal(inbox.total,0);assert.equal(inbox.tickets.length,0);
 inbox=await ok('/dashboard/query?view=mine&limit=1&page=2','GET',undefined,'inbox_reader');assert.equal(inbox.pagination.pages,3);assert.equal(inbox.tickets.length,1);
 pass('Inbox search, paging, state filters and date validation work without widening access');

 const statesUser=await employee('all_states');
 for(const state of ['NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED'])await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id,status) VALUES($1,'States','All states','Details',$2,$3,$4,$5)",[('S_'+state).slice(0,20),admin,statesUser,finance,state]);
 const everyState=await ok('/dashboard/query?view=mine','GET',undefined,'all_states');assert.equal(everyState.total,11);assert.equal(Object.keys(everyState.counts).length,11);
 for(const count of Object.values(everyState.counts))assert.equal(count,1);
 pass('Every one of the eleven ticket states is included in My Query');
 // Normal User directory: parent-department coworkers only, no admin rights.
 const directoryReader=await employee('directory_reader'),directoryDeleted=await employee('directory_deleted');
 await ok('/users/'+directoryReader,'PUT',{groupIds:[aia]});await ok('/users/'+directoryDeleted,'PUT',{groupIds:[aia]});await db.query('UPDATE users SET deleted_at=NOW() WHERE id=$1',[directoryDeleted]);
 await ok('/users/'+manager,'PUT',{managedGroupIds:[hr]});
 await ok('/users/'+saranya,'PUT',{groupIds:[aia,finance]});
 let contacts=await ok('/users/directory','GET',undefined,'directory_reader');
 assert.deepEqual(contacts.departments.map(d=>d.id),[hr]);assert(contacts.users.some(u=>u.id===siblingUser));assert(contacts.users.some(u=>u.id===manager));
 assert(!contacts.users.some(u=>[karthik,inboxPeer,directoryDeleted].includes(u.id)));
 assert(contacts.users.every(u=>u.memberships.every(m=>m.department_id===hr)));
 assert(contacts.users.every(u=>!['password_hash','mfa_secret','permissions','managed_group_ids'].some(key=>key in u)));
 pass('User directory includes same-department coworkers across sub departments and managers, without outside users or security data');
 await rejected('/users/directory?departmentId='+finance,'GET',undefined,'directory_reader');
 await rejected('/users/'+swathi,'PUT',{fullName:'Forbidden'},'directory_reader');await rejected('/users/'+swathi,'GET',undefined,'directory_reader');
 await rejected('/users','POST',{username:'no_account'},'directory_reader');
 await rejected('/tickets/'+tickets[1].id,'GET',undefined,'directory_reader');
 pass('Directory is read-only; knowing coworkers never grants user administration or sibling ticket access');
 contacts=await ok('/users/directory?search=directory_reader&limit=1','GET',undefined,'directory_reader');assert.equal(contacts.pagination.total,1);assert.equal(contacts.users[0].id,directoryReader);
 await ok('/users/'+directoryReader,'PUT',{groupIds:[aia,finance]});contacts=await ok('/users/directory','GET',undefined,'directory_reader');assert.equal(contacts.departments.length,2);assert(contacts.users.some(u=>u.id===karthik));
 await ok('/users/'+directoryReader,'PUT',{groupIds:[]});contacts=await ok('/users/directory','GET',undefined,'directory_reader');assert.equal(contacts.users.length,0);assert.equal(contacts.departments.length,0);
 pass('Directory search, paging, multiple-department membership and immediate access removal work');

 // Shared ticket work is limited to the User's effective department membership.
 const editor=await employee('department_editor'),coworker=await employee('department_coworker');
 await ok('/users/'+editor,'PUT',{groupIds:[aia]});await ok('/users/'+coworker,'PUT',{groupIds:[aia]});
 const shared=(await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,ticket_owner,assignment_group_id,subgroup_id) VALUES('SHARED_EDIT','Shared','Team work','Details',$1,$1,$2,$3) RETURNING *",[admin,hr,aia])).rows[0];
 await ok('/tickets/'+shared.id,'PUT',{description:'Updated by a department member',priority:'HIGH'},'department_editor');
 await rejected('/tickets/'+shared.id,'PUT',{assignedTo:editor},'department_editor');
 await ok('/tickets/'+shared.id,'PUT',{assignedTo:editor,workNote:'Taking this ticket'},'department_editor');
 await ok('/tickets/'+shared.id,'PUT',{assignedTo:coworker,workNote:'Handing to a coworker'},'department_editor');
 await ok('/tickets/'+shared.id,'PUT',{description:'Still editable after reassignment',status:'IN_PROGRESS',workNote:'Started team work'},'department_editor');
 pass('Users edit unassigned and coworker tickets, self-assign and reassign within membership; work notes remain required');
 await rejected('/tickets/'+shared.id,'PUT',{assignedTo:karthik,workNote:'Outside department'},'department_editor');
 await rejected('/tickets/'+shared.id,'PUT',{ticketOwner:editor},'department_editor');
 await rejected('/tickets/'+shared.id,'DELETE',undefined,'department_editor');
 await rejected('/tickets/'+queueTicket.id,'PUT',{description:'Outside department'},'department_editor');
 const siblingTicket=(await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assignment_group_id,subgroup_id) VALUES('SIBLING_EDIT','Shared','Sibling','Details',$1,$2,$3) RETURNING *",[admin,hr,kier])).rows[0];
 await rejected('/tickets/'+siblingTicket.id,'PUT',{description:'Outside sub department'},'department_editor');
 pass('Shared editing cannot change ownership, delete coworkers tickets, use outside assignees or edit outside sub departments');
 await ok('/users/'+editor,'PUT',{groupIds:[hr]});
 await ok('/tickets/'+siblingTicket.id,'PUT',{description:'Whole department can edit child tickets'},'department_editor');
 await ok('/users/'+editor,'PUT',{groupIds:[]});
 await rejected('/tickets/'+shared.id,'PUT',{description:'Access removed'},'department_editor');
 pass('Whole-department membership includes child ticket editing; removing membership removes shared editing');

 const managementFixtures=[];
 for(const [name,grants] of [['overview_whole',[hr]],['overview_child',[aia]],['overview_sibling',[kier]]]){
  const id=(await db.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES($1,$2,$1,'unused','manager') RETURNING id",[name,name+'@example.test'])).rows[0].id;
  for(const group of grants)await db.query('INSERT INTO user_managed_groups(user_id,group_id) VALUES($1,$2)',[id,group]);
  managementFixtures.push(id);
 }
 let overview=await ok('/departments/'+hr);assert(managementFixtures.every(id=>overview.managers.some(m=>m.id===id)));
 assert(overview.managers.find(m=>m.id===managementFixtures[0]).responsibilities.some(r=>r.whole_department));
 assert(overview.managers.every(m=>!('password_hash' in m)&&!('mfa_secret' in m)));
 overview=await ok('/departments/'+aia);assert(overview.managers.some(m=>m.id===managementFixtures[0]&&m.responsibilities.some(r=>r.inherited)));
 assert(overview.managers.some(m=>m.id===managementFixtures[1]));assert(!overview.managers.some(m=>m.id===managementFixtures[2]));
 pass('Department overview lists whole-department and child managers; child overview includes inherited management without sibling leakage');
 await ok('/users/'+manager,'PUT',{managedGroupIds:[aia]});
 overview=await ok('/departments/'+hr,'GET',undefined,'manager');assert(overview.managers.some(m=>m.id===managementFixtures[0]));assert(!overview.managers.some(m=>m.id===managementFixtures[2]));
 await db.query('UPDATE users SET deleted_at=NOW() WHERE id=$1',[managementFixtures[1]]);
 overview=await ok('/departments/'+hr);assert(!overview.managers.some(m=>m.id===managementFixtures[1]));
 await db.query("UPDATE users SET role='employee' WHERE id=$1",[managementFixtures[2]]);
 overview=await ok('/departments/'+hr);assert(!overview.managers.some(m=>m.id===managementFixtures[2]));
 pass('Partial managers see only relevant management grants; deleted accounts and users without Manager role are excluded');

 // Reports use current assignments consistently across totals, charts and exports.
 const reportReader=await employee('report_reader');await ok('/users/'+reportReader,'PUT',{groupIds:[hr]});
 const reportTickets=[];
 for(const [num,created,assignee,status,date] of [
  ['RPT_ASSIGNED_1',admin,reportReader,'IN_PROGRESS','2026-01-31T12:00:00Z'],
  ['RPT_ASSIGNED_2',admin,reportReader,'RESOLVED','2026-02-02T12:00:00Z'],
  ['RPT_CREATED_ONLY',reportReader,coworker,'NEW','2026-02-01T12:00:00Z'],
  ['RPT_OTHER',admin,coworker,'NEW','2026-02-01T12:00:00Z']]){
   reportTickets.push((await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,ticket_owner,assigned_to,assignment_group_id,status,created_at,updated_at) VALUES($1,'Reports','Report fixture','Details',$2,$2,$3,$4,$5,$6,$6::timestamptz+interval '2 hours') RETURNING *",[num,created,assignee,hr,status,date])).rows[0]);
 }
 let report=await ok('/reports','GET',undefined,'report_reader');assert.equal(report.summary.total,2);assert.equal(report.summary.inProgress,1);assert.equal(report.summary.resolved,1);assert.equal(report.allTickets.length,2);assert.equal(report.byStatus.reduce((n,r)=>n+r.value,0),2);assert.equal(report.byPriority.reduce((n,r)=>n+r.value,0),2);
 assert(report.allTickets.every(t=>t.ticket_number.startsWith('RPT_ASSIGNED')));
 pass('Personal report totals, status, priority and ticket rows include assigned work and exclude created-only or coworkers tickets');
 report=await ok('/reports?startDate=2026-01-31&endDate=2026-02-02','GET',undefined,'report_reader');assert.equal(report.summary.total,2);assert.equal(report.monthly.length,2);assert.equal(report.weekly.length,2);assert.equal(report.monthly.reduce((n,r)=>n+r.Created,0),2);assert.equal(report.weekly.reduce((n,r)=>n+r.Created,0),2);
 const exported=await ok('/reports?export=true&startDate=2026-02-02&endDate=2026-02-02','GET',undefined,'report_reader');assert.equal(exported.summary.total,1);assert.deepEqual(exported.allTickets.map(t=>t.ticket_number),['RPT_ASSIGNED_2']);
 pass('Report date filtering and export match, including partial months/weeks across calendar boundaries');
 await db.query('UPDATE tickets SET assigned_to=$1 WHERE id=$2',[coworker,reportTickets[0].id]);report=await ok('/reports','GET',undefined,'report_reader');assert.equal(report.summary.total,1);
 await db.query('UPDATE tickets SET deleted_at=NOW() WHERE id=$1',[reportTickets[1].id]);report=await ok('/reports','GET',undefined,'report_reader');assert.equal(report.summary.total,0);assert.equal(report.allTickets.length,0);assert.equal(report.monthly.length,12);assert(report.monthly.every(r=>r.Created===0));
 for(const query of ['startDate=2026-02-31&endDate=2026-03-03','startDate=2026-03-03&endDate=2026-02-01','startDate=2026-01-01'])await rejected('/reports?'+query,'GET',undefined,'report_reader');
 pass('Reassignment and deletion update reports immediately; empty reports retain zero-filled charts and invalid ranges are rejected');
 const workload=await ok('/reports/global?startDate=2026-01-31&endDate=2026-02-02');assert.equal(workload.employees.find(u=>u.id===reportReader).total,0);assert.equal(workload.employees.find(u=>u.id===coworker).total,3);pass('Global employee workload counts assignees consistently with personal reports, not ticket creators');

 for(const path of ['/auth/me','/dashboard','/dashboard?personal=true','/users/me','/config/fields','/config/modules','/config/categories','/config/users','/config/ticket-types','/config/templates','/config/branding','/kb','/notifications','/reports'])await ok(path,'GET',undefined,'report_reader');
 for(const path of ['/users','/roles/assignable','/departments/tree','/departments/geography','/config/admin/fields','/config/admin/ticket-types','/config/admin/sso','/config/admin/email','/config/admin/email/deliveries','/sla/definitions','/sla/settings','/sla/qa','/sla/drill','/audit','/admin-audit','/audit/retention','/kb/admin/all','/reports/global'])await ok(path);
 for(const path of ['/config/admin/email','/config/admin/sso','/audit','/admin-audit','/reports/global','/sla/qa'])await rejected(path,'GET',undefined,'report_reader');
 pass('All main User/Admin page reads are wired to live routes, with administrative endpoints blocked for User');
 const customField=(await ok('/config/admin/fields','POST',{label:'Binding Field',field_type:'text',is_required:false})).field;
 assert((await ok('/config/fields')).fields.some(f=>f.id===customField.id));await ok('/config/admin/fields/'+customField.id,'PUT',{...customField,label:'Renamed Binding Field'});
 await ok('/config/admin/fields/'+customField.id,'DELETE');assert(!(await ok('/config/fields')).fields.some(f=>f.id===customField.id));
 const templFields=['text','integer','dropdown','toggle'].map(type=>({id:randomUUID(),label:type,type,required:true,options:type==='dropdown'?['Alpha','Beta']:[]}));
 const templ=(await ok('/config/admin/templates','POST',{name:'Binding Template',fields:templFields})).template;
 const vals=Object.fromEntries(templFields.map(f=>[f.id,f.type==='text'?'Multiline\nLong details':f.type==='integer'?42:f.type==='toggle'?false:'Alpha']));
 const templTicket=(await ok('/tickets','POST',{...payload,assignmentGroupId:hr,subgroupId:aia,templateId:templ.id,templateValues:vals})).ticket;
 let templDetail=(await ok('/tickets/'+templTicket.id)).ticket;assert.equal(templDetail.template_snapshot.name,'Binding Template');assert.deepEqual(templDetail.template_values,vals);
 await ok('/config/admin/templates/'+templ.id,'PUT',{name:'Renamed Binding Template',fields:templFields});templDetail=(await ok('/tickets/'+templTicket.id)).ticket;assert.equal(templDetail.template_snapshot.name,'Binding Template');
 pass('Configuration fields bind to ticket forms; every template field type saves and historical ticket snapshots survive template renaming');
 const markdown='# Guide\n\n| Person | Role |\n| --- | --- |\n| David | Manager |\n\n```mermaid\npie\n  title Tickets\n  "Open" : 3\n```';
 const article=(await ok('/kb','POST',{title:'Binding Guide',content:markdown,category:'General',status:'PUBLISHED'})).article;
 assert.equal((await ok('/kb/'+article.id,'GET',undefined,'report_reader')).article.content,markdown);
 await ok('/kb/'+article.id,'PUT',{title:'Binding Guide Updated',content:markdown+'\nUpdated',category:'General',status:'PUBLISHED'});assert((await ok('/kb?search=Binding%20Guide','GET',undefined,'report_reader')).articles.some(a=>a.id===article.id));
 await rejected('/kb/'+article.id,'PUT',{title:'Forbidden'},'report_reader');await ok('/kb/'+article.id,'DELETE');
 pass('Knowledge articles preserve Markdown tables and chart syntax through create/read/edit/search; User cannot edit articles');
 await ok('/config/admin/branding','PUT',{customize:true,organization_name:'Binding Org',service_desk_name:'Binding Desk',accent_color:'#1768AC',logo_data:''});assert.equal((await ok('/config/branding')).branding.organization_name,'Binding Org');
 await ok('/config/admin/branding','PUT',{customize:false,organization_name:'Binding Org',service_desk_name:'Binding Desk',accent_color:'#1768AC',logo_data:''});assert.equal((await ok('/config/branding')).branding.customize,false);
 pass('Branding save and customization toggle bind to persisted configuration');
 await db.query("INSERT INTO notifications(user_id,type,title,message) SELECT $1,'TEST','Binding','Notification' FROM generate_series(1,35)",[reportReader]);
 let notices=await ok('/notifications','GET',undefined,'report_reader');assert.equal(notices.unread,35);assert.equal(notices.notifications.length,30);
 await ok('/notifications/'+notices.notifications[0].id+'/read','PATCH',{},'report_reader');assert.equal((await ok('/notifications','GET',undefined,'report_reader')).unread,34);
 await ok('/notifications/read-all','PATCH',{},'report_reader');assert.equal((await ok('/notifications','GET',undefined,'report_reader')).unread,0);
 pass('Bell unread count includes notifications beyond the latest 30, and individual/read-all actions persist');
 // More than the displayed global report limit must still be exported.
 await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id,created_at) SELECT 'GLOBAL_'||n,'Export','Bulk export','Details',$1,$1,$2,'2025-01-31T12:00:00Z' FROM generate_series(1,501) n",[admin,hr]);
 const gr=await ok('/reports/global?startDate=2025-01-31&endDate=2025-02-02&export=true');assert.equal(gr.summary.total,501);assert.equal(gr.allTickets.length,501);assert.equal(gr.monthly.reduce((n,r)=>n+r.Created,0),501);assert.equal(gr.weekly.reduce((n,r)=>n+r.Created,0),501);
 for(const who of ['manager','report_reader'])await rejected('/reports/global?export=true','GET',undefined,who);
 pass('Global Excel data includes all 501 matching records and chart totals agree across partial calendar boundaries');
 const slaDef=(await ok('/sla/definitions','POST',{name:'Binding SLA',start_status:'NEW',duration_minutes:60})).definition;
 await db.query("INSERT INTO ticket_sla_instances(ticket_id,sla_definition_id,target_at) SELECT $1,$2,NOW()+interval '1 hour' FROM generate_series(1,201)",[shared.id,slaDef.id]);
 const qa=await ok('/sla/qa?export=true');assert(qa.summary.total>=201);assert.equal(qa.instances.length,qa.summary.total);
 pass('QA detail/export rows are not silently truncated after 200 instances');

 await db.query("INSERT INTO ticket_sla_instances(ticket_id,sla_definition_id,target_at) VALUES($1,$2,NOW()+interval '1 hour')",[reportTickets[1].id,slaDef.id]);
 const qaWithoutDeleted=await ok('/sla/qa');assert.equal(qaWithoutDeleted.summary.total,qa.summary.total);assert.equal(qaWithoutDeleted.byDefinition.reduce((n,r)=>n+r.total,0),qaWithoutDeleted.summary.total);
 pass('QA summary, definition totals and exported detail consistently exclude soft-deleted tickets');
 const fixturePassword='Test!'+randomUUID();await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await require('argon2').hash(fixturePassword),admin]);
 const batch=[{username:'bulk_binding_user',email:'bulk_binding_user@example.test',fullName:'Bulk Binding User',password:'Test!'+randomUUID(),role:'employee',groupIds:[aia],managedGroupIds:[],mfaRequired:true}];
 await rejected('/users/bulk','POST',{adminPassword:'incorrect',users:batch},'admin');
 const bulkResult=await ok('/users/bulk','POST',{adminPassword:fixturePassword,users:batch});assert.equal(bulkResult.created,1);assert.equal(bulkResult.failed.length,0);
 const bulkRow=(await db.query("SELECT id FROM users WHERE username='bulk_binding_user'")).rows[0];assert((await db.query('SELECT 1 FROM user_groups WHERE user_id=$1 AND group_id=$2',[bulkRow.id,aia])).rowCount);
 await rejected('/users/bulk','POST',{adminPassword:fixturePassword,users:batch},'report_reader');
 pass('Bulk user creation validates Admin password and persists selected role/membership; User cannot import');
 for(const path of ['/dashboard?team=true','/users/team','/departments/tree','/reports','/sla/qa'])await ok(path,'GET',undefined,'manager');
 for(const path of ['/config/admin/email','/config/admin/sso','/audit','/reports/global'])await rejected(path,'GET',undefined,'manager');
 pass('Manager page connections work within assigned access and cannot enter global/admin settings');

 // Managers may receive tickets through managed responsibility alone.
 const wholeManager=managementFixtures[0];ids.assignment_manager=wholeManager;
 assert.equal((await db.query('SELECT 1 FROM user_groups WHERE user_id=$1',[wholeManager])).rowCount,0);
 await ok('/users/'+manager,'PUT',{groupIds:[],managedGroupIds:[aia]});
 let assignmentGroups=(await ok('/groups/with-members','GET',undefined,'assignment_manager')).groups;
 assert(assignmentGroups.find(g=>g.id===hr).members.some(u=>u.id===wholeManager));
 assert(assignmentGroups.find(g=>g.id===aia).members.some(u=>u.id===wholeManager));
 assert(!assignmentGroups.find(g=>g.id===hr).members.some(u=>u.id===manager));
 assert(assignmentGroups.find(g=>g.id===aia).members.some(u=>u.id===manager));
 assert(!assignmentGroups.find(g=>g.id===kier).members.some(u=>u.id===manager));
 let assignmentUsers=await ok('/config/users','GET',undefined,'department_coworker');assert(assignmentUsers.users.some(u=>u.id===wholeManager)&&assignmentUsers.users.some(u=>u.id===manager));
 const selfAssigned=(await ok('/tickets','POST',{...payload,assignmentGroupId:hr,subgroupId:null,assignedTo:wholeManager},'assignment_manager')).ticket;
 assert.equal(selfAssigned.assigned_to,wholeManager);
 assert((await ok('/tickets?myTickets=true','GET',undefined,'assignment_manager')).tickets.some(t=>t.id===selfAssigned.id));
 await ok('/tickets/'+shared.id,'PUT',{assignedTo:wholeManager,workNote:'Assign to department Manager'},'department_coworker');
 pass('Whole-department Managers appear in create/edit assignee pickers, receive department and child tickets, and self-assigned work appears in My Tickets without ordinary membership');
 await ok('/tickets/'+shared.id,'PUT',{assignedTo:manager,workNote:'Assign to sub department Manager'},'department_coworker');
 await rejected('/tickets/'+selfAssigned.id,'PUT',{assignedTo:manager,workNote:'Child-only manager cannot receive parent-only work'},'assignment_manager');
 await rejected('/tickets','POST',{...payload,assignmentGroupId:finance,subgroupId:null,assignedTo:wholeManager},'admin');
 await db.query('UPDATE users SET is_active=FALSE WHERE id=$1',[wholeManager]);
 await rejected('/tickets/'+shared.id,'PUT',{assignedTo:wholeManager,workNote:'Inactive manager'},'admin');
 assert(!(await ok('/groups/with-members')).groups.find(g=>g.id===aia).members.some(u=>u.id===wholeManager));
 await db.query('UPDATE users SET is_active=TRUE WHERE id=$1',[wholeManager]);
 await ok('/users/'+wholeManager,'PUT',{managedGroupIds:[]});
 await rejected('/tickets/'+shared.id,'PUT',{assignedTo:wholeManager,workNote:'Management access removed'},'admin');
 assert.equal((await db.query('SELECT 1 FROM user_groups WHERE user_id=$1',[wholeManager])).rowCount,0);
 pass('Sub department, outside-department, inactive-account and removed-management restrictions match both picker and server checks; no ordinary membership is added');

 await ok('/users/'+wholeManager,'PUT',{managedGroupIds:[hr]});
 const managerDirectory=await ok('/users?scope=with_tickets','GET',undefined,'assignment_manager');
 assert(managerDirectory.users.some(u=>u.id===wholeManager));assert(managerDirectory.users.some(u=>u.id===manager));assert(!managerDirectory.users.some(u=>u.id===karthik));
 await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id) VALUES('MGR_SELF_HR','Example','Manager own work','Details',$1,$2,$3),('MGR_SELF_OUTSIDE','Example','Historical outside work','Details',$1,$2,$4)",[admin,wholeManager,hr,finance]);
 const managerCard=await ok('/users/'+wholeManager+'?scope=with_tickets','GET',undefined,'assignment_manager');
 const managerBucket=await ok('/tickets?userTickets='+wholeManager,'GET',undefined,'assignment_manager');
 assert.equal(Number(managerCard.user.ticket_count),managerBucket.pagination.total);assert(managerBucket.tickets.some(t=>t.ticket_number==='MGR_SELF_HR'));assert(!managerBucket.tickets.some(t=>t.ticket_number==='MGR_SELF_OUTSIDE'));
 pass('Tickets by User includes the viewing Manager and other Managers through management grants; self-card counts match scoped drilldown and never leak outside tickets');
 const partialDirectory=await ok('/users?scope=with_tickets','GET',undefined,'manager');assert(partialDirectory.users.some(u=>u.id===manager));assert(partialDirectory.users.some(u=>u.id===wholeManager));
 await rejected('/users/'+karthik+'?scope=with_tickets','GET',undefined,'manager');
 await ok('/users/'+wholeManager,'PUT',{managedGroupIds:[]});
 const removedManagerDirectory=await ok('/users?scope=with_tickets','GET',undefined,'manager');assert(!removedManagerDirectory.users.some(u=>u.id===wholeManager));
 pass('Sub department Managers see responsible parent Managers; removed management and outside users do not remain in the directory');

 const subdeptExportUser=await employee('subdepartment_export');await ok('/users/'+subdeptExportUser,'PUT',{groupIds:[hr]});
 await db.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id,subgroup_id) VALUES('EXPORT_CHILD','Example','Child ticket','Details',$1,$2,$3,$4),('EXPORT_PARENT','Example','Parent ticket','Details',$1,$2,$3,NULL)",[admin,subdeptExportUser,hr,aia]);
 const departmentExport=await ok('/reports?export=true','GET',undefined,'subdepartment_export');
 assert.equal(departmentExport.allTickets.find(t=>t.ticket_number==='EXPORT_CHILD').assignment_group,'HR');assert.equal(departmentExport.allTickets.find(t=>t.ticket_number==='EXPORT_CHILD').sub_department_name,'AIA');assert.equal(departmentExport.allTickets.find(t=>t.ticket_number==='EXPORT_PARENT').sub_department_name,null);
 const globalDepartmentExport=await ok('/reports/global?export=true');assert.equal(globalDepartmentExport.allTickets.find(t=>t.ticket_number==='EXPORT_CHILD').sub_department_name,'AIA');
 const teamDepartmentExport=await ok('/reports?export=true','GET',undefined,'manager');assert.equal(teamDepartmentExport.allTickets.find(t=>t.ticket_number==='EXPORT_CHILD').sub_department_name,'AIA');
 pass('Personal, team and global report exports include linked Department/Sub Department names and preserve null for department-only tickets');
 const listedDepartments=await ok('/tickets?myTickets=true','GET',undefined,'subdepartment_export');assert.equal(listedDepartments.tickets.find(t=>t.ticket_number==='EXPORT_CHILD').department_name,'HR');assert.equal(listedDepartments.tickets.find(t=>t.ticket_number==='EXPORT_CHILD').sub_department_name,'AIA');assert.equal(listedDepartments.tickets.find(t=>t.ticket_number==='EXPORT_PARENT').sub_department_name,null);pass('Ticket list returns Department/Sub Department display names for child and department-only tickets');

 const uploadTicket=(await ok('/tickets','POST',{...payload,assignmentGroupId:hr,subgroupId:aia},'subdepartment_export')).ticket;
 async function uploadFiles(files,who='subdepartment_export',ticket=uploadTicket.id){const form=new FormData();for(const [name,type,content] of files)form.append('files',new Blob([content],{type}),name);const response=await fetch(root+'/api/tickets/'+ticket+'/attachments',{method:'POST',headers:{'x-test-user':who},body:form});return{status:response.status,data:await response.json()}}
 const uploadedBatch=await uploadFiles([['notes.txt','text/plain','first'],['notes.txt','text/plain','second'],['notes(2).txt','text/plain','third'],['guide.pdf','application/pdf','%PDF-1.4 fixture'],['pixel.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE8sAAAAASUVORK5CYII=','base64')]]);
 assert.equal(uploadedBatch.status,201);assert.equal(uploadedBatch.data.attachments.length,5);assert.deepEqual(uploadedBatch.data.errors,[]);
 const textAttachment=uploadedBatch.data.attachments[0];const download=await fetch(root+'/api/attachments/'+textAttachment.id+'/download',{headers:{'x-test-user':'subdepartment_export'}});assert.equal(download.status,200);assert.equal(await download.text(),'first');assert(download.headers.get('content-disposition').startsWith('attachment'));
 const preview=await fetch(root+'/api/attachments/'+textAttachment.id+'/download?preview=true',{headers:{'x-test-user':'subdepartment_export'}});assert.equal(preview.status,200);assert(preview.headers.get('content-disposition').startsWith('inline'));assert.equal(await preview.text(),'first');
 let uploadDetail=await ok('/tickets/'+uploadTicket.id,'GET',undefined,'subdepartment_export');assert.equal(uploadDetail.attachments.length,5);
 pass('Actual multipart uploads persist text, PDF and PNG files; ticket detail reload, byte-exact download and safe inline preview work');
 const zipResponse=await fetch(root+'/api/tickets/'+uploadTicket.id+'/attachments/zip',{headers:{'x-test-user':'subdepartment_export'}});assert.equal(zipResponse.status,200);const zip=await require('../../client/node_modules/jszip').loadAsync(await zipResponse.arrayBuffer());assert.equal(Object.keys(zip.files).length,5);assert.deepEqual((await Promise.all(Object.values(zip.files).filter(f=>f.name.endsWith('.txt')).map(f=>f.async('string')))).sort(),['first','second','third']);
 pass('Download-all ZIP retains every file even when duplicate names collide with an existing numbered filename');
 const mixedBatch=await uploadFiles([['allowed.txt','text/plain','accepted'],['blocked.exe','application/x-msdownload','not accepted']]);assert.equal(mixedBatch.status,201);assert.equal(mixedBatch.data.attachments.length,1);assert.equal(mixedBatch.data.errors.length,1);
 const allRejected=await uploadFiles([['blocked.exe','application/x-msdownload','rejected']]);assert.equal(allRejected.status,400);assert.equal(allRejected.data.success,false);assert.equal(allRejected.data.attachments.length,0);
 const none=await uploadFiles([]);assert.equal(none.status,400);
 const oversized=await uploadFiles([['too-large.txt','text/plain',Buffer.alloc(25*1024*1024+1)]]);assert.equal(oversized.status,413);
 const tooMany=await uploadFiles(Array.from({length:11},(_,i)=>['file'+i+'.txt','text/plain','small']));assert.equal(tooMany.status,400);
 pass('Partial acceptance reports precise file errors; empty, unsupported, oversized and over-count uploads fail without false success');
 const outsideUpload=await uploadFiles([['outside.txt','text/plain','denied']],'karthik');assert.equal(outsideUpload.status,403);
 const outsideDownload=await fetch(root+'/api/attachments/'+textAttachment.id+'/download',{headers:{'x-test-user':'karthik'}});assert.equal(outsideDownload.status,403);
 const svgUpload=await uploadFiles([['diagram.svg','image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg"/>']]);assert.equal(svgUpload.status,201);const svgPreview=await fetch(root+'/api/attachments/'+svgUpload.data.attachments[0].id+'/download?preview=true',{headers:{'x-test-user':'subdepartment_export'}});assert(svgPreview.headers.get('content-disposition').startsWith('attachment'));
 await ok('/attachments/'+textAttachment.id,'DELETE',{},'subdepartment_export');assert(!(await ok('/tickets/'+uploadTicket.id,'GET',undefined,'subdepartment_export')).attachments.some(a=>a.id===textAttachment.id));
 pass('Attachment upload/download enforce department access; deletion persists and active SVG content is downloaded rather than opened inline');
 const originalAttachmentQuery=pool.connect;pool.connect=async()=>({query:(sql,...args)=>{if(sql.includes('INSERT INTO ticket_audit_logs')&&sql.includes('ATTACHMENT_ADDED'))throw Error('Simulated attachment audit failure');return db.query(sql,...args)},release(){}});
 try{const failed=await uploadFiles([['atomic.txt','text/plain','rollback']]);assert.equal(failed.status,500);assert.equal((await db.query("SELECT 1 FROM ticket_attachments WHERE ticket_id=$1 AND file_name='atomic.txt'",[uploadTicket.id])).rowCount,0)}finally{pool.connect=originalAttachmentQuery}
 pass('Attachment data and audit history commit together; database failure leaves no partly saved upload');
 const stagedUpload=await uploadFiles([['staged.txt','text/plain','keep until save']],'manager');assert.equal(stagedUpload.status,201);const stagedId=stagedUpload.data.attachments[0].id;
 // Staging is local UI state: ordinary reload/download must retain the file until PUT.
 assert((await ok('/tickets/'+uploadTicket.id,'GET',undefined,'manager')).attachments.some(a=>a.id===stagedId));
 await rejected('/tickets/'+uploadTicket.id,'PUT',{removeAttachmentIds:[stagedId]},'karthik');
 const foreignTicket=(await ok('/tickets','POST',{...payload,assignmentGroupId:hr,subgroupId:aia},'subdepartment_export')).ticket;
 const wrongTicketRemoval=await request('/tickets/'+foreignTicket.id,'PUT',{removeAttachmentIds:[stagedId]},'admin');assert.equal(wrongTicketRemoval.status,400);
 const invalidRemoval=await request('/tickets/'+uploadTicket.id,'PUT',{removeAttachmentIds:['invalid']},'admin');assert.equal(invalidRemoval.status,400);
 assert((await ok('/tickets/'+uploadTicket.id,'GET',undefined,'manager')).attachments.some(a=>a.id===stagedId));
 await ok('/tickets/'+uploadTicket.id,'PUT',{removeAttachmentIds:[stagedId]},'manager');
 assert(!(await ok('/tickets/'+uploadTicket.id,'GET',undefined,'manager')).attachments.some(a=>a.id===stagedId));
 assert.equal((await db.query("SELECT 1 FROM ticket_audit_logs WHERE ticket_id=$1 AND action='ATTACHMENT_DELETED' AND old_value='staged.txt'",[uploadTicket.id])).rowCount,1);
 pass('Manager saves attachment-only removals in editable department scope; staged files persist before save, outside users and cross-ticket IDs are rejected');
 const atomicRemoval=await uploadFiles([['keep-on-failure.txt','text/plain','must survive']]);const keepId=atomicRemoval.data.attachments[0].id;
 const beforeRemoval=await ok('/tickets/'+uploadTicket.id,'GET',undefined,'subdepartment_export');
 pool.connect=async()=>({query:(sql,...args)=>{if(sql.includes('INSERT INTO ticket_audit_logs')&&args[0]?.includes('ATTACHMENT_DELETED'))throw Error('Simulated removal audit failure');return db.query(sql,...args)},release(){}});
 try{const failedSave=await request('/tickets/'+uploadTicket.id,'PUT',{shortDescription:'Must roll back',removeAttachmentIds:[keepId]},'subdepartment_export');assert.equal(failedSave.status,500)}finally{pool.connect=originalAttachmentQuery}
 const afterRemoval=await ok('/tickets/'+uploadTicket.id,'GET',undefined,'subdepartment_export');assert(afterRemoval.attachments.some(a=>a.id===keepId));assert.equal(afterRemoval.ticket.short_description,beforeRemoval.ticket.short_description);
 await ok('/tickets/'+uploadTicket.id,'PUT',{removeAttachmentIds:[keepId]},'subdepartment_export');assert(!(await ok('/tickets/'+uploadTicket.id,'GET',undefined,'subdepartment_export')).attachments.some(a=>a.id===keepId));
 pass('Failed saves roll back both ticket edits and attachment removal; successful User save permanently removes the file');
 const recentDepartment=(await ok('/dashboard')).recentTickets.find(t=>t.id===uploadTicket.id);assert(recentDepartment);assert.equal(recentDepartment.department_name,'HR');assert.equal(recentDepartment.sub_department_name,'AIA');
 const personalDepartment=(await ok('/dashboard?personal=true','GET',undefined,'subdepartment_export')).recentTickets.find(t=>t.ticket_number==='EXPORT_PARENT');assert(personalDepartment);assert.equal(personalDepartment.department_name,'HR');assert.equal(personalDepartment.sub_department_name,null);
 pass('Dashboard recent ticket tables return linked department/sub department names and preserve department-only values');


 }finally{if(server)await new Promise(r=>server.close(r));Object.assign(pool,original);await pool.end();await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end()}
 console.log(checks+' organization scenario checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
