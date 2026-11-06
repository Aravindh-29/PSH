const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.join(__dirname, '../server/package.json'));
const { Client } = serverRequire('pg');
serverRequire('dotenv').config({ path: path.join(__dirname, '../.env') });

function connectionConfig() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  return { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000,
    ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}) };
}

async function migrate(client) {
  // A single transaction covers SQL changes, default roles, team backfill and
  // credential encryption. An advisory lock serializes startup/update runners.
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='30s'");
    await client.query('SELECT pg_advisory_xact_lock(73642012)');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      .replace(/^\s*(?:BEGIN|COMMIT);\s*$/gmi, '');
    await client.query(schema);
    await require('../server/src/access/init')(client);
    await require('../server/src/services/emailSettings').init(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function run() {
  const client = new Client(connectionConfig());
  try { await client.connect(); await migrate(client); console.log('Database migrations completed successfully. Existing records and account passwords preserved.'); }
  finally { await client.end(); }
}
if (require.main === module) run().catch(() => { console.error('Database migration failed and was rolled back. Check database connectivity, schema compatibility and the email encryption key.'); process.exitCode = 1; });
module.exports = { migrate, connectionConfig };
