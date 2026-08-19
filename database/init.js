require('dotenv').config({ path: '../.env' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');

async function init() {
  // Connect to postgres default db to create our db if needed
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

    // Create database if it doesn't exist
    const exists = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created`);
    } else {
      console.log(`Database "${dbName}" already exists`);
    }
    await adminClient.end();

    // Connect to our database
    const appClient = new Client({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 5432,
      user: dbUrl.username,
      password: dbUrl.password,
      database: dbName,
    });

    await appClient.connect();

    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await appClient.query(schema);
    console.log('Schema applied');

    // Run seed data (modules/categories)
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    // Only run the INSERT parts (not the admin with placeholder hash)
    const seedLines = seed.split('\n').filter(l => !l.includes('placeholder'));
    await appClient.query(seedLines.join('\n'));
    console.log('Seed data inserted');

    // Create admin user with real argon2 hash
    const adminHash = await argon2.hash('Admin@123');
    await appClient.query(`
      INSERT INTO users (username, email, full_name, password_hash, role)
      VALUES ('admin', 'admin@purestoragehorizon.com', 'Aravindh K', $1, 'admin')
      ON CONFLICT (username) DO UPDATE SET password_hash = $1, full_name = 'Aravindh K'
    `, [adminHash]);

    // Create demo employee user (password: Employee@123)
    const empHash = await argon2.hash('Employee@123');
    await appClient.query(`
      INSERT INTO users (username, email, full_name, password_hash, role)
      VALUES ('john.smith', 'john.smith@purestoragehorizon.com', 'John Smith', $1, 'employee')
      ON CONFLICT (username) DO NOTHING
    `, [empHash]);

    await appClient.query(`
      INSERT INTO users (username, email, full_name, password_hash, role)
      VALUES ('sarah.johnson', 'sarah.johnson@purestoragehorizon.com', 'Sarah Johnson', $1, 'employee')
      ON CONFLICT (username) DO NOTHING
    `, [empHash]);

    await appClient.query(`
      INSERT INTO users (username, email, full_name, password_hash, role)
      VALUES ('mike.davis', 'mike.davis@purestoragehorizon.com', 'Mike Davis', $1, 'employee')
      ON CONFLICT (username) DO NOTHING
    `, [empHash]);

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
