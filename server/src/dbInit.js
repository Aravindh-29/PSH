const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');

async function dbInit() {
  const dbUrl = new URL(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/psh_ticketing');
  const dbName = dbUrl.pathname.replace('/', '');

  const adminClient = new Client({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 5432,
    user: dbUrl.username,
    password: dbUrl.password,
    database: 'postgres',
  });

  await adminClient.connect();

  const exists = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
  if (exists.rows.length === 0) {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
  }
  await adminClient.end();

  const appClient = new Client({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 5432,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbName,
  });
  await appClient.connect();

  const dbDir = path.join(__dirname, '../../database');
  await appClient.query(fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8'));
  await appClient.query(fs.readFileSync(path.join(dbDir, 'seed.sql'), 'utf8'));

  const adminHash = await argon2.hash('Admin@123');
  await appClient.query(`
    INSERT INTO users (username, email, full_name, password_hash, role)
    VALUES ('admin', 'admin@purestoragehorizon.com', 'Aravindh K', $1, 'admin')
    ON CONFLICT (username) DO UPDATE SET password_hash = $1
  `, [adminHash]);

  const empHash = await argon2.hash('Employee@123');
  for (const [username, email, full_name] of [
    ['john.smith',     'john.smith@purestoragehorizon.com',     'John Smith'],
    ['sarah.johnson',  'sarah.johnson@purestoragehorizon.com',  'Sarah Johnson'],
    ['mike.davis',     'mike.davis@purestoragehorizon.com',     'Mike Davis'],
  ]) {
    await appClient.query(`
      INSERT INTO users (username, email, full_name, password_hash, role)
      VALUES ($1, $2, $3, $4, 'employee')
      ON CONFLICT (username) DO NOTHING
    `, [username, email, full_name, empHash]);
  }

  await appClient.end();
}

module.exports = dbInit;
