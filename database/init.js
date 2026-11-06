require('../server/node_modules/dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client } = require('../server/node_modules/pg');
const fs = require('fs');
const path = require('path');
const argon2 = require('../server/node_modules/argon2');

async function init() {
  const dbUrl = new URL(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/psh_ticketing');
  const dbName = decodeURIComponent(dbUrl.pathname.slice(1));

  const { connectionConfig } = require('./migrate');
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const adminClient = new Client({ ...connectionConfig(), connectionString: adminUrl.toString() });

  try {
    await adminClient.connect();
    console.log('Connected to PostgreSQL');

    const exists = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Database "${dbName}" created`);
    } else {
      console.log(`Database "${dbName}" already exists`);
    }
    await adminClient.end();

    const appClient = new Client(connectionConfig());

    await appClient.connect();

    await require('./migrate').migrate(appClient);
    console.log('Schema applied');

    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await appClient.query(seed);
    console.log('Seed data inserted');

    // Installation creates an initial administrator only when no admin username
    // exists. Re-running setup never resets passwords, names or account status.
    const adminExists = await appClient.query("SELECT id FROM users WHERE username='admin'");
    if (!adminExists.rowCount) {
      const adminHash=await argon2.hash(process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123');
      await appClient.query("INSERT INTO users(username,email,full_name,password_hash,role) VALUES('admin','admin@purestoragehorizon.com','Administrator',$1,'admin')",[adminHash]);
    }

    await appClient.end();

    console.log('\n✅ Database initialized successfully!');
    console.log('Existing administrator credentials remain unchanged. For a new administrator, use ADMIN_INITIAL_PASSWORD or the documented initial password and change it after login.');
  } catch (err) {
    console.error('Initialization failed:', err.message);
    process.exit(1);
  }
}

init();
