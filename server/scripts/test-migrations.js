// Real PostgreSQL upgrade tests; disposable schemas never modify application rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const { migrate, connectionConfig } = require('../../database/migrate');
const settings = require('../src/services/emailSettings');
const { prepare } = require('./deployment');
const { catalog } = require('../src/access/catalog');
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS: ' + name); }
async function main() {
  const admin = new Client(connectionConfig());
  await admin.connect();
  const schemas = [], clients = [], temp = fs.mkdtempSync(path.join(os.tmpdir(), 'servit-migrations-'));
  const originalEnv = { ...process.env };
  async function isolated() {
    const name = 'migration_test_' + crypto.randomUUID().replaceAll('-', '');
    schemas.push(name);
    await admin.query('CREATE SCHEMA ' + name);
    const client = new Client(connectionConfig()); await client.connect(); clients.push(client);
    await client.query('SET search_path TO ' + name); // No fallback to live application tables.
    return { client, name };
  }
  const sql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
  const legacy = sql.split('-- Configurable roles and delegated team access')[0]
    .replace("role VARCHAR(64) NOT NULL DEFAULT 'employee'", "role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','employee'))") + '\nCOMMIT;';
  try {
    const { client: fresh } = await isolated();
    await fresh.query(sql);
    check('Standalone schema includes fixed-role application permissions', Object.keys((await fresh.query("SELECT permissions FROM access_roles WHERE key='admin'")).rows[0].permissions).length === catalog.filter(p=>!p.key.startsWith('roles.')).length);
    await migrate(fresh); await migrate(fresh);
    for (const table of ['ticket_inbox_receipts', 'ticket_templates', 'organization_branding', 'access_roles', 'user_managed_groups', 'access_role_history', 'access_migrations', 'email_outbox', 'kb_articles', 'session', 'organization_regions', 'organization_countries', 'organization_settings', 'department_findings', 'email_automation_mailboxes', 'incoming_email_messages', 'incoming_email_threads']) {
      check('Fresh install contains ' + table, !!(await fresh.query('SELECT to_regclass($1) AS name', [table])).rows[0].name);
    }
    const systemId=(await fresh.query("INSERT INTO users(username,email,full_name,password_hash,role,is_active,is_system) VALUES('system','system@example.test','System','disabled','employee',FALSE,TRUE) RETURNING id")).rows[0].id;
    const readers=(await fresh.query("INSERT INTO users(username,email,full_name,role) VALUES('reader_before','before@example.test','Before','employee'),('reader_after','after@example.test','After','employee') RETURNING id")).rows;
    const inboxDept=(await fresh.query("INSERT INTO assignment_groups(name) VALUES('Inbox migration team') RETURNING id")).rows[0].id;
    const repairedTicket=(await fresh.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,assigned_to,assignment_group_id,status,source) VALUES('EMAIL_REPAIR','Example','Email repair','Details',$1,$2,$3,'IN_PROGRESS','EMAIL') RETURNING id",[systemId,readers[0].id,inboxDept])).rows[0].id;
    await fresh.query("INSERT INTO ticket_audit_logs(ticket_id,user_id,action,field_name,old_value,new_value,created_at) VALUES($1,$2,'REOPENED','status','CLOSED','IN_PROGRESS',NOW()-interval '10 minutes')",[repairedTicket,systemId]);
    await fresh.query("INSERT INTO ticket_inbox_receipts(user_id,ticket_id,seen_revision,opened_at) VALUES($1,$3,1,NOW()-interval '20 minutes'),($2,$3,1,NOW())",[readers[0].id,readers[1].id,repairedTicket]);
    await fresh.query("DELETE FROM access_migrations WHERE key='email-reopening-inbox-event-v1'");await migrate(fresh);
    const repaired=(await fresh.query('SELECT inbox_revision,inbox_event FROM tickets WHERE id=$1',[repairedTicket])).rows[0];
    const repairedReceipts=(await fresh.query('SELECT user_id,seen_revision FROM ticket_inbox_receipts WHERE ticket_id=$1',[repairedTicket])).rows;
    check('Email reopening repair restores an unread event while preserving users who already opened the reply',repaired.inbox_event==='EMAIL_REOPENED'&&repaired.inbox_revision==='2'&&repairedReceipts.find(r=>r.user_id===readers[0].id).seen_revision==='1'&&repairedReceipts.find(r=>r.user_id===readers[1].id).seen_revision==='2');
    await migrate(fresh);check('Repeated migrations do not repeat repaired email alerts',(await fresh.query('SELECT inbox_revision FROM tickets WHERE id=$1',[repairedTicket])).rows[0].inbox_revision==='2');
    const { client: upgraded, name } = await isolated();
    await upgraded.query(legacy);
    const user = (await upgraded.query("INSERT INTO users(username,email,full_name,password_hash,role,is_active) VALUES('admin','example@example.test','Existing admin','unchanged-password-hash','admin',false) RETURNING id")).rows[0].id;
    const group = (await upgraded.query("INSERT INTO assignment_groups(name) VALUES('Existing team') RETURNING id")).rows[0].id;
    await upgraded.query('INSERT INTO user_groups VALUES($1,$2)', [user, group]);
    await upgraded.query("UPDATE organization_branding SET customize=true,organization_name='Existing company',service_desk_name='Existing desk' WHERE id=1");
    const template = (await upgraded.query("INSERT INTO ticket_templates(name,fields) VALUES('Existing template','[{\"id\":\"notes\",\"type\":\"text\",\"label\":\"Notes\"}]') RETURNING id")).rows[0].id;
    await upgraded.query("INSERT INTO tickets(ticket_number,customer_name,short_description,description,created_by,template_id,template_snapshot,template_values) VALUES('TEST0001','Existing customer','Existing summary','Existing detail',$1,$2,'{\"name\":\"Existing template\"}','{\"notes\":\"Keep this value\"}')", [user, template]);
    await upgraded.query("UPDATE email_config SET smtp_pass='legacy-test-secret',smtp_host='smtp.example.test',is_enabled=false WHERE id=1");
    await migrate(upgraded);
    const account = (await upgraded.query('SELECT * FROM users WHERE id=$1', [user])).rows[0];
    check('Upgrade preserves administrator password, name and disabled status', account.password_hash === 'unchanged-password-hash' && account.full_name === 'Existing admin' && !account.is_active);
    check('Legacy ordinary membership does not become management', (await upgraded.query('SELECT * FROM user_managed_groups')).rowCount === 0);
    const saved = (await upgraded.query('SELECT * FROM email_config WHERE id=1')).rows[0];
    check('Legacy SMTP secret encrypted without changing its value', saved.smtp_pass.startsWith('enc:v1:') && settings.decrypt(saved.smtp_pass) === 'legacy-test-secret');
    await upgraded.query("INSERT INTO access_roles(key,name,permissions) VALUES('custom_manager','Custom manager','{\"tickets.view\":\"groups\"}')");
    await upgraded.query("UPDATE users SET role='custom_manager' WHERE id=$1", [user]);
    await upgraded.query('DELETE FROM user_managed_groups');
    await upgraded.query("INSERT INTO kb_articles(title,content) VALUES('Custom article','Keep edited Markdown | table')");
    await migrate(upgraded); await migrate(upgraded);
    check('Repeated upgrades preserve accounts and archive retired role assignments', (await upgraded.query('SELECT role FROM users WHERE id=$1', [user])).rows[0].role === 'employee' && (await upgraded.query('SELECT role_key FROM retired_user_roles WHERE user_id=$1',[user])).rows[0].role_key === 'custom_manager');
    check('Repeated upgrades do not restore removed managed groups', (await upgraded.query('SELECT * FROM user_managed_groups')).rowCount === 0);
    check('Repeated upgrades preserve role permissions', (await upgraded.query("SELECT permissions FROM access_roles WHERE key='custom_manager'")).rows[0].permissions['tickets.view'] === 'groups');
    check('Repeated upgrades preserve branding', (await upgraded.query('SELECT organization_name FROM organization_branding')).rows[0].organization_name === 'Existing company');
    check('Repeated upgrades preserve template answers and snapshots', (await upgraded.query('SELECT template_values,template_snapshot FROM tickets')).rows[0].template_values.notes === 'Keep this value');
    check('Repeated upgrades preserve edited articles', (await upgraded.query('SELECT content FROM kb_articles')).rows[0].content === 'Keep edited Markdown | table');
    check('Repeated upgrades do not re-encrypt existing ciphertext', (await upgraded.query('SELECT smtp_pass FROM email_config')).rows[0].smtp_pass === saved.smtp_pass);
    const appUrl = new URL(process.env.DATABASE_URL); appUrl.searchParams.set('options', '-c search_path=' + name);
    const installResult = spawnSync(process.execPath, [path.join(__dirname, '../../database/init.js')], { env: { ...process.env, DATABASE_URL: appUrl.toString() }, encoding: 'utf8', windowsHide: true });
    check('Actual installation initializer succeeds on an existing database', installResult.status === 0);
    const priorUrl = process.env.DATABASE_URL; process.env.DATABASE_URL = appUrl.toString();
    try { await require('../src/dbInit')(); } finally { process.env.DATABASE_URL = priorUrl; }
    const retained = (await upgraded.query('SELECT password_hash,full_name,is_active,role FROM users WHERE id=$1', [user])).rows[0];
    check('Install and startup preserve account credentials/status and safely map a retired role to User', retained.password_hash === 'unchanged-password-hash' && retained.full_name === 'Existing admin' && !retained.is_active && retained.role === 'employee');
    const { client: failed } = await isolated(); await failed.query(legacy);
    const validKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.EMAIL_ENCRYPTION_KEY = 'invalid';
    await assert.rejects(migrate(failed)); checks++;
    check('Failed migration rolls back all new tables', !(await failed.query("SELECT to_regclass('access_roles') AS name")).rows[0].name);
    check('Failed migration restores legacy role constraint', (await failed.query("SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_role_check'")).rowCount === 1);
    process.env.EMAIL_ENCRYPTION_KEY = validKey;
    // Verify .env updates against the isolated database and a temporary file.
    const url = new URL(process.env.DATABASE_URL); url.searchParams.set('options', '-c search_path=' + name);
    const envFile = path.join(temp, '.env');
    fs.writeFileSync(envFile, '# Keep this comment\nDATABASE_URL=' + url + '\nCUSTOM_SETTING=preserved\nEMAIL_ENCRYPTION_KEY=\n');
    await assert.rejects(prepare(envFile), /Restore the original/); checks++;
    check('Missing key with encrypted credentials never creates a replacement', !fs.readFileSync(envFile, 'utf8').includes('EMAIL_ENCRYPTION_KEY=' + validKey));
    await upgraded.query("UPDATE email_config SET smtp_pass='legacy-test-secret'");
    await prepare(envFile);
    const once = fs.readFileSync(envFile, 'utf8'); await prepare(envFile);
    check('Environment preparation generates and retains one persistent key', once === fs.readFileSync(envFile, 'utf8'));
    check('Environment preparation preserves unrelated settings and comments', once.includes('# Keep this comment') && once.includes('CUSTOM_SETTING=preserved'));
    await migrate(upgraded);
    check('Generated key encrypts legacy credentials successfully', settings.decrypt((await upgraded.query('SELECT smtp_pass FROM email_config')).rows[0].smtp_pass) === 'legacy-test-secret');
    fs.writeFileSync(envFile, once.replace(/^EMAIL_ENCRYPTION_KEY=.*$/m, 'EMAIL_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('base64')));
    await assert.rejects(prepare(envFile), /could not be decrypted/); checks++;
    check('Wrong saved key is not silently replaced', fs.readFileSync(envFile, 'utf8') !== once);
  } finally {
    for (const client of clients) await client.end();
    for (const schema of schemas) await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
    await admin.end(); fs.rmSync(temp, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
  console.log(checks + ' database deployment checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
