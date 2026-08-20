const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Enable SSL for managed cloud databases (RDS, Azure, Supabase, etc.)
// Set DATABASE_SSL=true in production; the URL ?sslmode=require also works
if (process.env.DATABASE_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database error', err);
});

module.exports = pool;
