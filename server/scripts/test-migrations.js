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
    check('Standalone schema includes all current permission keys', Object.keys((await fresh.query("SELECT permissions FROM access_roles WHERE key='admin'")).rows[0].permissions).length === catalog.length);
    await migrate(fresh); await migrate(fresh);
    for (const table of ['ticket_templates', 'organization_branding', 'access_roles', 'user_managed_groups', 'access_role_history', 'access_migrations', 'email_outbox', 'kb_articles', 'session']) {
      check('Fresh install contains ' + table, !!(await fresh.query('SELECT to_regclass($1) AS name', [table])).rows[0].name);
    }
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
    check('Legacy membership copied to managed groups once', (await upgraded.query('SELECT * FROM user_managed_groups')).rowCount === 1);
    const saved = (await upgraded.query('SELECT * FROM email_config WHERE id=1')).rows[0];
    check('Legacy SMTP secret encrypted without changing its value', saved.smtp_pass.startsWith('enc:v1:') && settings.decrypt(saved.smtp_pass) === 'legacy-test-secret');
    await upgraded.query("INSERT INTO access_roles(key,name,permissions) VALUES('custom_manager','Custom manager','{\"tickets.view\":\"groups\"}')");
    await upgraded.query("UPDATE users SET role='custom_manager' WHERE id=$1", [user]);
    await upgraded.query('DELETE FROM user_managed_groups');
    await upgraded.query("INSERT INTO kb_articles(title,content) VALUES('Custom article','Keep edited Markdown | table')");
    await migrate(upgraded); await migrate(upgraded);
    check('Repeated upgrades preserve custom roles and assignments', (await upgraded.query('SELECT role FROM users WHERE id=$1', [user])).rows[0].role === 'custom_manager');
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
    check('Install and startup preserve existing admin credentials, status and custom role', retained.password_hash === 'unchanged-password-hash' && retained.full_name === 'Existing admin' && !retained.is_active && retained.role === 'custom_manager');
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
