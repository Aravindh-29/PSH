// Exercise real HTTP routes, controllers and PostgreSQL in a disposable schema.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const argon2 = require('argon2');
const { Client } = require('pg');
const { migrate, connectionConfig } = require('../../database/migrate');
const pool = require('../src/db/pool');
const { authorize } = require('../src/access/policy');
const { scopePredicate } = require('../src/access/context');
const managerRole = require('../src/access/defaultRoles').find(role=>role.key==='manager');
let checks=0;
function check(name,value=true){assert(value,name);console.log('PASS: '+name);checks++}
async function main(){
  const client=new Client(connectionConfig());await client.connect();
  const schema='team_test_'+randomUUID().replaceAll('-','');
  const original={query:pool.query,rawQuery:pool.rawQuery,connect:pool.connect};
  let server;
  try{
    await client.query('CREATE SCHEMA '+schema);await client.query('SET search_path TO '+schema);await migrate(client);
    // Existing installations may have a custom-key Manager created before defaults.
    await client.query("DELETE FROM access_roles WHERE key='manager'");
    await client.query("INSERT INTO access_roles(key,name,responsibility,permissions) VALUES('existing_manager','Manager','Keep responsibility',$1)",[JSON.stringify({'tickets.view':'groups'})]);
    await client.query("DELETE FROM access_migrations WHERE key='manager-team-users-v1'");await migrate(client);
    let upgraded=(await client.query("SELECT * FROM access_roles WHERE key='existing_manager'")).rows[0];
    check('Upgrade adds team permissions to existing Manager without replacing its key or responsibilities',upgraded.permissions['users.team_create']==='all'&&upgraded.permissions['tickets.view']==='groups'&&upgraded.responsibility==='Keep responsibility');
    await client.query("UPDATE access_roles SET permissions=permissions-'users.team_create' WHERE key='existing_manager'");await migrate(client);
    check('Repeated update preserves later administrator permission changes',!(await client.query("SELECT permissions FROM access_roles WHERE key='existing_manager'")).rows[0].permissions['users.team_create']);
    await client.query("UPDATE access_roles SET permissions=$1 WHERE key='existing_manager'",[JSON.stringify(managerRole.permissions)]);
    const groups=(await client.query("INSERT INTO assignment_groups(name) VALUES('HR'),('Finance') RETURNING id,name")).rows;
    const hr=groups.find(g=>g.name==='HR').id, finance=groups.find(g=>g.name==='Finance').id;
    async function user(name,role){return(await client.query('INSERT INTO users(username,email,full_name,password_hash,role) VALUES($1,$2,$1,\'unused\',$3) RETURNING id',[name,name+'@example.test',role])).rows[0].id}
    const manager=await user('siva','existing_manager'),swathi=await user('swathi','employee'),karthik=await user('karthik','employee');
    await client.query('INSERT INTO user_groups VALUES($1,$4),($2,$4),($3,$5)',[manager,swathi,karthik,hr,finance]);
    await client.query('INSERT INTO user_managed_groups VALUES($1,$2)',[manager,hr]);
    pool.query=(...args)=>client.query(...args);pool.rawQuery=pool.query;
    pool.connect=async()=>({query:(...args)=>client.query(...args),release(){}});
    const baseAccess={admin:false,custom:true,userId:manager,role:'existing_manager',permissions:managerRole.permissions,managedGroups:[hr],memberGroups:[hr],assignableRoles:[]};
    const app=express();app.use(express.json());
    app.use((req,res,next)=>{req.access={...baseAccess};req.session={userId:manager};next()});
    app.use('/api/users',(req,res,next)=>authorize(req,pool).then(()=>next(),next),require('../src/routes/users'));
    app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});
    const root='http://127.0.0.1:'+server.address().port;
    async function request(url,method='GET',body){const response=await fetch(root+'/api/users'+url,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()}}
    let response=await request('/team');
    assert.deepEqual(response.data.users.map(u=>u.username).sort(),['siva','swathi']);
    check('Manager Users endpoint lists HR members and excludes Finance');
    await client.query('INSERT INTO user_groups VALUES($1,$2)',[swathi,finance]);
    response=await request('/team');
    check('Shared team member does not expose other group memberships',response.data.users.find(u=>u.username==='swathi').groups.every(g=>g.id===hr));
    await client.query('DELETE FROM user_groups WHERE user_id=$1 AND group_id=$2',[swathi,finance]);
    for(const [url,method] of [['/','GET'],['/'+karthik,'GET'],['/'+swathi,'PUT'],['/'+swathi+'/reset-password','POST'],['/'+swathi,'DELETE']]){
      assert.equal((await request(url,method,method==='GET'?undefined:{})).status,403);
    }
    check('Team permissions cannot access global directory, direct account administration, password reset or deletion');
    const password='Test!'+randomUUID();
    const body={username:'new_hr',fullName:'New HR User',email:'new_hr@example.test',password,role:'employee',groupIds:[hr],managedGroupIds:[],mfaRequired:true};
    response=await request('/team','POST',body);assert.equal(response.status,201,JSON.stringify(response.data));
    const created=(await client.query('SELECT * FROM users WHERE id=$1',[response.data.user.id])).rows[0];
    check('Manager creates Employee account through real HTTP endpoint',created.role==='employee'&&await argon2.verify(created.password_hash,password));
    check('New team user retains required MFA and HR membership',created.mfa_required&&(await client.query('SELECT 1 FROM user_groups WHERE user_id=$1 AND group_id=$2',[created.id,hr])).rowCount===1);
    check('New team user receives no Managed Groups',(await client.query('SELECT 1 FROM user_managed_groups WHERE user_id=$1',[created.id])).rowCount===0);
    const attacks=[{role:'admin'},{role:'existing_manager'},{groupIds:[finance]},{groupIds:[hr,finance]},{managedGroupIds:[hr]},{mfaRequired:false}];
    for(const attack of attacks)assert.equal((await request('/team','POST',{...body,username:'attack',email:'attack@example.test',...attack})).status,403);
    check('Server rejects role escalation, outside groups, management delegation and disabled MFA');
    assert.equal((await request('/team','POST',{...body,groupIds:[]})).status,400);
    check('Team creation requires at least one Managed Group membership');
    await client.query('DELETE FROM user_managed_groups WHERE user_id=$1',[manager]);
    assert.equal((await request('/team','POST',body)).status,400);
    check('Creation rechecks group authority and rejects stale permissions after Admin revokes a team');
    await client.query('INSERT INTO user_managed_groups VALUES($1,$2)',[manager,hr]);
    await client.query("UPDATE access_roles SET permissions=permissions-'users.team_create' WHERE key='existing_manager'");
    assert.equal((await request('/team','POST',body)).status,403);
    check('Creation rechecks role permissions after Admin revokes team creation');
    await client.query('UPDATE access_roles SET permissions=$1 WHERE key=$2',[JSON.stringify(managerRole.permissions),'existing_manager']);
    check('Rejected creation attempts leave no accounts behind',(await client.query("SELECT 1 FROM users WHERE username='attack'")).rowCount===0);
    for(const [number,group]of[['HR-TEST',hr],['FIN-TEST',finance]])await client.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assignment_group_id) VALUES($1,'Test','Test','Test',$2,$3)",[number,manager,group]);
    const tickets=(await client.query('SELECT * FROM tickets ORDER BY ticket_number')).rows;
    const hrTicket=tickets.find(t=>t.ticket_number==='HR-TEST'),financeTicket=tickets.find(t=>t.ticket_number==='FIN-TEST');
    const visible=await client.query('SELECT ticket_number FROM tickets t WHERE '+scopePredicate(baseAccess,'tickets.view'));
    assert.deepEqual(visible.rows.map(t=>t.ticket_number),['HR-TEST']);check('HR Manager sees HR tickets and excludes Finance even for tickets they created');
    const assignment=(ticket,assignee,access=baseAccess)=>({baseUrl:'/api/tickets',path:'/'+ticket.id,method:'PUT',body:{assignedTo:assignee,workNote:'Scenario assignment'},query:{},access:{...access}});
    await authorize(assignment(hrTicket,swathi),pool);await authorize(assignment(hrTicket,created.id),pool);
    check('Manager may assign HR tickets to existing and newly created HR users');
    await assert.rejects(authorize(assignment(hrTicket,karthik),pool),{status:403});
    await assert.rejects(authorize(assignment(hrTicket,karthik,{...baseAccess,managedGroups:[hr,finance]}),pool),{status:403});
    check('Assignee must belong to the ticket destination group, even when Manager oversees multiple groups');
    await assert.rejects(authorize(assignment(financeTicket,swathi),pool),{status:403});
    check('Manager cannot change or assign an outside team ticket');
    await client.query('UPDATE users SET is_active=false WHERE id=$1',[created.id]);
    await assert.rejects(authorize(assignment(hrTicket,created.id),pool),{status:403});
    check('Manager cannot assign tickets to inactive team accounts');
    const employee = require('../src/access/catalog').employee;
    await authorize(assignment(hrTicket,manager,{...baseAccess,role:'employee',permissions:employee,managedGroups:[]}),pool);
    check('Existing Employee self-assignment on their own ticket remains permitted');
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    Object.assign(pool,original);await pool.end();
    await client.query('SET search_path TO public');await client.query('DROP SCHEMA '+schema+' CASCADE');await client.end();
  }
  console.log(checks+' Manager team-access checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
