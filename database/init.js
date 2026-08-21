require('dotenv').config({ path: '../.env' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');

// Insert user if not present; update only if forceUpdate is true (admin reset)
async function ensureUser(client, username, email, fullName, hash, role, forceUpdate) {
  const existing = await client.query(`SELECT id FROM users WHERE username = $1`, [username]);
  if (existing.rows.length > 0) {
    if (forceUpdate) {
      await client.query(
        `UPDATE users SET password_hash = $1, full_name = $2, email = $3,
         role = $4, is_active = TRUE, deleted_at = NULL, updated_at = NOW()
         WHERE username = $5`,
        [hash, fullName, email, role, username]
      );
    }
  } else {
    await client.query(
      `INSERT INTO users (username, email, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, email, fullName, hash, role]
    );
  }
}

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

    // Admin: always ensure credentials are correct (forceUpdate = true)
    const adminHash = await argon2.hash('Admin@123');
    await ensureUser(appClient, 'admin', 'admin@purestoragehorizon.com', 'Aravindh K', adminHash, 'admin', true);

    // Demo employees: insert only if not present (forceUpdate = false)
    const empHash = await argon2.hash('Employee@123');
    await ensureUser(appClient, 'john.smith',    'john.smith@purestoragehorizon.com',    'John Smith',    empHash, 'employee', false);
    await ensureUser(appClient, 'sarah.johnson', 'sarah.johnson@purestoragehorizon.com', 'Sarah Johnson', empHash, 'employee', false);
    await ensureUser(appClient, 'mike.davis',    'mike.davis@purestoragehorizon.com',    'Mike Davis',    empHash, 'employee', false);

    await appClient.end();
    console.log('\n✅ Database initialized successfully!');
    console.log('\nDefault accounts:');
    console.log('  Admin:    username=admin           password=Admin@123');
    console.log('  Employee: username=john.smith      password=Employee@123');
    console.log('  Employee: username=sarah.johnson   password=Employee@123');
    console.log('  Employee: username=mike.davis      password=Employee@123');
  } catch (err) {
    console.error('Initialization failed:', err.message);
    process.exit(1);
  }
}

init();
