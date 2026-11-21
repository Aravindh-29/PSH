// Real PostgreSQL checks in a disposable schema; no application accounts are changed.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { migrate, connectionConfig } = require('../../database/migrate');
const defaults = require('../src/access/defaultRoles');
const { catalog } = require('../src/access/catalog');
const { scopePredicate } = require('../src/access/context');
const { authorize } = require('../src/access/policy');
let checks = 0;
function check(name, test) { assert(test, name); console.log('PASS: ' + name); checks++; }
async function main() {
  for (const role of defaults) {
    for (const [key, scope] of Object.entries(role.permissions)) {
      const item = catalog.find(p => p.key === key);
      assert(item, role.name + ': unknown permission ' + key);
      assert((item.scoped ? ['own', 'groups', 'related', 'all'] : ['all']).includes(scope));
      for (const dependency of item.requires || []) assert(role.permissions[dependency], role.name + ': missing ' + dependency);
    }
    assert.deepEqual(role.assignable_roles, []);
    assert(!Object.keys(role.permissions).some(k => /^(users|roles|groups|email|sso|audit)\./.test(k) && !['users.team_view','users.team_create'].includes(k)));
    assert(!role.permissions['tickets.delete']);
    check(role.name + ' has valid prerequisites and no administrative escalation', true);
  }
  const client = new Client(connectionConfig());
  const schema = 'roles_test_' + randomUUID().replaceAll('-', '');
  await client.connect();
  try {
    await client.query('CREATE SCHEMA ' + schema);
    await client.query('SET search_path TO ' + schema);
    await client.query(fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8'));
    const rows = (await client.query('SELECT * FROM access_roles WHERE is_default=true')).rows;
    check('Standalone schema includes all seven ready-made roles', rows.length === defaults.length);
    for (const role of defaults) assert.deepEqual(rows.find(r => r.key === role.key).permissions, role.permissions);
    check('Standalone SQL and runtime default permissions match exactly', true);
    // Simulate upgrading a database created before ready-made roles existed.
    await client.query('DELETE FROM access_roles WHERE is_default=true');
    await client.query("INSERT INTO access_roles(key,name,permissions) VALUES('existing_viewer','Read-only Viewer','{\"kb.view\":\"all\"}')");
    await migrate(client);
    check('Upgrade preserves a custom role with a conflicting name', (await client.query("SELECT key FROM access_roles WHERE LOWER(name)=LOWER('Read-only Viewer')")).rows[0].key === 'existing_viewer');
    check('Other defaults still install when a role name already exists', (await client.query('SELECT * FROM access_roles WHERE is_default=true')).rowCount === defaults.length - 1);
    await client.query("UPDATE access_roles SET name='Our team manager',permissions='{\"kb.view\":\"all\"}',is_active=false,version=9 WHERE key='manager'");
    const before = (await client.query("SELECT * FROM access_roles WHERE key='manager'")).rows[0];
    await migrate(client); await migrate(client);
    assert.deepEqual((await client.query("SELECT * FROM access_roles WHERE key='manager'")).rows[0], before);
    check('Repeated migrations preserve edited names, permissions, version, status and timestamps', true);
    const manager = defaults.find(r => r.key === 'manager');
    await client.query('UPDATE access_roles SET permissions=$1,is_active=true WHERE key=$2', [JSON.stringify(manager.permissions), manager.key]);
    const user = (await client.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('role_test','role@example.test','Role Test','unused','manager') RETURNING id")).rows[0].id;
    const other = (await client.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('other','other@example.test','Other','unused','employee') RETURNING id")).rows[0].id;
    const groups = (await client.query("INSERT INTO assignment_groups(name) VALUES('L1'),('L2') RETURNING id,name")).rows;
    const l1 = groups.find(g => g.name === 'L1').id, l2 = groups.find(g => g.name === 'L2').id;
    await client.query('INSERT INTO user_managed_groups VALUES($1,$2)', [user, l1]);
    await client.query('INSERT INTO user_groups VALUES($1,$2)', [user, l2]);
    for (const [number, group, owner] of [['TEST1', l1, other], ['TEST2', l2, user]]) {
      await client.query('INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id) VALUES($1,\'Test\',\'Test\',\'Test\',$2,$2,$3)', [number, owner, group]);
    }
    const tickets = (await client.query('SELECT * FROM tickets ORDER BY ticket_number')).rows;
    const access = role => ({ userId: user, admin: false, role: role.key, permissions: role.permissions, managedGroups: [l1], memberGroups: [l2], assignableRoles: [] });
    const pool = { rawQuery: (...args) => client.query(...args) };
    for (const key of ['manager', 'read_only_viewer', 'sla_qa_analyst']) {
      const role = defaults.find(r => r.key === key);
      const found = await client.query('SELECT ticket_number FROM tickets t WHERE ' + scopePredicate(access(role), 'tickets.view'));
      assert.deepEqual(found.rows.map(r => r.ticket_number), ['TEST1']);
      check(role.name + ' sees only Managed Groups, even with membership/ownership elsewhere', true);
    }
    const request = (role, area, method, target, body = {}) => ({ access: access(role), baseUrl: '/api/' + area, path: target, method, body, query: {} });
    await authorize(request(manager, 'tickets', 'PUT', '/' + tickets[0].id, { description: 'Allowed edit' }), pool);
    check('Manager may edit a ticket in their Managed Group', true);
    await assert.rejects(authorize(request(manager, 'tickets', 'PUT', '/' + tickets[1].id, { description: 'Denied edit' }), pool), { status: 403 });
    check('Manager cannot edit another team ticket even when personally assigned', true);
    for (const key of ['read_only_viewer', 'sla_qa_analyst']) {
      await assert.rejects(authorize(request(defaults.find(r => r.key === key), 'tickets', 'PUT', '/' + tickets[0].id, { description: 'Denied' }), pool), { status: 403 });
      check(key + ' cannot change even visible team tickets', true);
    }
    const agent = defaults.find(r => r.key === 'support_agent');
    await authorize(request(agent, 'tickets', 'PUT', '/' + tickets[1].id, { description: 'Assigned work' }), pool);
    await assert.rejects(authorize(request(agent, 'tickets', 'PUT', '/' + tickets[0].id, { description: 'Other work' }), pool), { status: 403 });
    check('Support Agent can edit assigned tickets but not other agents tickets', true);
    const article = (await client.query("INSERT INTO kb_articles(title,content,status) VALUES('Published','Live content','PUBLISHED') RETURNING id")).rows[0].id;
    const author = defaults.find(r => r.key === 'knowledge_author');
    const draft = (await client.query("INSERT INTO kb_articles(title,content,status) VALUES('Draft','Review content','DRAFT') RETURNING id")).rows[0].id;
    await assert.rejects(authorize(request(defaults.find(r => r.key === 'read_only_viewer'), 'kb', 'GET', '/' + draft), pool), { status: 403 });
    await authorize(request(author, 'kb', 'GET', '/' + draft), pool);
    await authorize(request(author, 'kb', 'PUT', '/' + draft, { content: 'Draft revision', status: 'DRAFT' }), pool);
    check('Draft visibility and editing follow the real numeric article identifiers', true);
    await authorize(request(author, 'kb', 'POST', '/', { status: 'DRAFT' }), pool);
    await assert.rejects(authorize(request(author, 'kb', 'POST', '/', { status: 'PUBLISHED' }), pool), { status: 403 });
    await assert.rejects(authorize(request(author, 'kb', 'PUT', '/' + article, { content: 'Live change without status' }), pool), { status: 403 });
    await authorize(request(defaults.find(r => r.key === 'knowledge_manager'), 'kb', 'PUT', '/' + article, { content: 'Approved live change' }), pool);
    check('Knowledge Author can draft; only a publisher can publish or change live content', true);
    await migrate(client);
    check('Updates preserve existing user role assignments', (await client.query('SELECT role FROM users WHERE id=$1', [user])).rows[0].role === 'manager');
  } finally {
    await client.query('SET search_path TO public');
    await client.query('DROP SCHEMA ' + schema + ' CASCADE');
    await client.end();
  }
  console.log(checks + ' default role checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
