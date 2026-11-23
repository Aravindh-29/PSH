// Fixed-role upgrade and data-preservation tests. Disposable schemas only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {migrate,connectionConfig}=require('../../database/migrate');
const {isManager,canManage}=require('../src/access/managedAccess');
const {scopePredicate}=require('../src/access/context');
let checks=0;
const pass=name=>{checks++;console.log('PASS: '+name)};
async function main(){
 const c=new Client(connectionConfig());await c.connect();const schema='fixed_roles_'+randomUUID().replaceAll('-','');
 try{
  await c.query('CREATE SCHEMA '+schema);await c.query('SET search_path TO '+schema);
  const sql=fs.readFileSync(path.join(__dirname,'../../database/schema.sql'),'utf8');
  // Simulate the earlier application with dynamic roles and a custom Manager ID.
  await c.query(sql.split('-- BEGIN FIXED APPLICATION ROLES')[0]+'\nCOMMIT;');
  await c.query("DELETE FROM access_roles WHERE key='manager'");
  const managerKey=randomUUID();
  await c.query("INSERT INTO access_roles(key,name,permissions) VALUES($1,'Manager',$2),('knowledge_author','Knowledge Author','{\"kb.view\":\"all\"}')",[managerKey,JSON.stringify(require('../src/access/defaultRoles')[0].permissions)]);
  const manager=(await c.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('siva','siva@example.test','Siva','keep-manager-password',$1) RETURNING id",[managerKey])).rows[0].id;
  const author=(await c.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('author','author@example.test','Author','keep-author-password','knowledge_author') RETURNING id")).rows[0].id;
  const group=(await c.query("INSERT INTO assignment_groups(name) VALUES('HR') RETURNING id")).rows[0].id;
  for(const id of [manager,author]){await c.query('INSERT INTO user_groups VALUES($1,$2)',[id,group]);await c.query('INSERT INTO user_managed_groups VALUES($1,$2)',[id,group]);}
  const ticket=(await c.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id) VALUES('FIXED001','Example','Keep ticket','Keep description',$1,$2,$3) RETURNING *",[manager,author,group])).rows[0];
  const userSnapshot=(await c.query('SELECT id,username,email,full_name,password_hash,is_active FROM users ORDER BY id')).rows;
  await c.query('ALTER TABLE organization_settings DROP CONSTRAINT organization_multiple_membership_enabled');
  await c.query('UPDATE organization_settings SET allow_multiple=false WHERE id=1');
  await migrate(c);
  assert.equal((await c.query('SELECT allow_multiple FROM organization_settings WHERE id=1')).rows[0].allow_multiple,true);pass('An older OFF installation upgrades to checkbox multiple membership');
  const roles=(await c.query('SELECT * FROM access_roles WHERE is_active ORDER BY name')).rows;
  assert.deepEqual(roles.map(r=>r.name),['Admin','Manager','User']);pass('Upgrade exposes exactly Admin, User and Manager');
  const managerRole=roles.find(r=>r.role_kind==='manager');assert.equal(managerRole.key,managerKey);assert.equal((await c.query('SELECT role FROM users WHERE id=$1',[manager])).rows[0].role,managerKey);pass('Existing Manager ID and account assignment are preserved');
  assert.deepEqual((await c.query('SELECT id,username,email,full_name,password_hash,is_active FROM users ORDER BY id')).rows,userSnapshot);pass('All account IDs, credentials, names and statuses survive');
  const {inbox_revision,...retainedTicket}=(await c.query('SELECT * FROM tickets WHERE id=$1',[ticket.id])).rows[0];assert.equal(inbox_revision,'1');assert.deepEqual(retainedTicket,ticket);pass('Ticket details, ownership, assignment and department survive unchanged');
  assert.equal((await c.query('SELECT * FROM user_groups')).rowCount,2);assert.equal((await c.query('SELECT * FROM user_managed_groups')).rowCount,2);pass('Memberships and managed assignments are retained');
  const retired=(await c.query("SELECT * FROM access_roles WHERE key='knowledge_author'")).rows[0];assert(!retired.is_active&&!retired.role_kind);assert((await c.query("SELECT 1 FROM retired_access_roles WHERE role_key='knowledge_author'")).rowCount);pass('Retired roles are archived, not deleted');
  assert.equal((await c.query('SELECT role FROM users WHERE id=$1',[author])).rows[0].role,'employee');assert.equal((await c.query('SELECT role_key FROM retired_user_roles WHERE user_id=$1',[author])).rows[0].role_key,'knowledge_author');pass('Older nonstandard accounts map to User with their former role recorded');
  assert(isManager(managerRole));assert(canManage({role:managerKey,roleKind:'manager'}));assert(!isManager(roles.find(r=>r.key==='admin')));assert(!isManager(roles.find(r=>r.key==='employee')));pass('Only Manager is eligible for the managed-department selector, including legacy IDs');
  const ctx={userId:manager,role:managerKey,roleKind:'manager',permissions:managerRole.permissions,managedGroups:[group],memberGroups:[]};
  assert.equal((await c.query('SELECT 1 FROM tickets t WHERE '+scopePredicate(ctx,'tickets.view'))).rowCount,1);pass('Legacy Manager IDs retain scoped ticket visibility');
  const snapshot=(await c.query('SELECT * FROM access_roles ORDER BY key')).rows;
  await migrate(c);await migrate(c);assert.deepEqual((await c.query('SELECT * FROM access_roles ORDER BY key')).rows,snapshot);pass('Repeated migrations preserve fixed role IDs, versions and archive records');
  // A new installation also receives just the three fixed roles.
  const fresh=schema+'_fresh';await c.query('CREATE SCHEMA '+fresh);await c.query('SET search_path TO '+fresh);await c.query(sql);
  assert.equal((await c.query('SELECT 1 FROM access_roles')).rowCount,3);assert.equal((await c.query('SELECT 1 FROM access_roles WHERE is_active AND role_kind IS NOT NULL')).rowCount,3);pass('Standalone installation creates exactly three roles');
  await c.query('SET search_path TO '+schema);await c.query('DROP SCHEMA '+fresh+' CASCADE');
 }finally{await c.query('SET search_path TO public');await c.query('DROP SCHEMA '+schema+' CASCADE');await c.end()}
 console.log(checks+' fixed-role checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
