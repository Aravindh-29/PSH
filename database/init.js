require('dotenv').config({ path: '../.env' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');

async function init() {
  const dbUrl = new URL(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/psh_ticketing');
  const dbName = dbUrl.pathname.replace('/', '');

  const adminClient = new Client({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 5432,
    user: dbUrl.username,
    password: dbUrl.password,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    console.log('Connected to PostgreSQL');

    const exists = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created`);
    } else {
      console.log(`Database "${dbName}" already exists`);
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

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await appClient.query(schema);
    console.log('Schema applied');

    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await appClient.query(seed);
    console.log('Seed data inserted');

    // Ensure admin user exists with correct credentials
    const adminHash = await argon2.hash('Admin@123');
    const adminExists = await appClient.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (adminExists.rows.length > 0) {
      await appClient.query(
        `UPDATE users SET password_hash = $1, full_name = 'Administrator',
         is_active = TRUE, deleted_at = NULL, updated_at = NOW() WHERE username = 'admin'`,
        [adminHash]
      );
    } else {
      await appClient.query(
        `INSERT INTO users (username, email, full_name, password_hash, role)
         VALUES ('admin', 'admin@purestoragehorizon.com', 'Administrator', $1, 'admin')`,
        [adminHash]
      );
    }

    await appClient.end();

    console.log('\n✅ Database initialized successfully!');
    console.log('\n  Admin login:');
    console.log('    Username : admin');
    console.log('    Password : Admin@123');
    console.log('\n  ⚠  Change the admin password after first login!\n');
  } catch (err) {
    console.error('Initialization failed:', err.message);
    process.exit(1);
  }
}

init();
