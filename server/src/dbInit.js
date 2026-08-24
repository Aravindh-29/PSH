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

  await appClient.query(`
    INSERT INTO ticket_fields (field_key, label, field_type, is_required, is_system, is_active, field_order, placeholder, options)
    VALUES
      ('customer_name',    'Customer / Client',   'dropdown', true,  true, true, 10, 'e.g. TechCorp Inc.',             '[]'::jsonb),
      ('module_text',      'Module',              'dropdown', true,  true, true, 20, 'e.g. Cloud, Storage, Network',
        '[{"label":"FlashArray","value":"FlashArray"},{"label":"FlashBlade","value":"FlashBlade"},{"label":"Pure Cloud Block Store","value":"Pure Cloud Block Store"},{"label":"Evergreen//One","value":"Evergreen//One"},{"label":"ActiveCluster","value":"ActiveCluster"},{"label":"Portworx","value":"Portworx"},{"label":"General","value":"General"}]'::jsonb),
      ('category_id',      'Category',            'category', true,  true, true, 30, '',                               '[]'::jsonb),
      ('status',           'Status',              'dropdown', true,  true, true, 40, '',
        '[{"label":"New","value":"NEW"},{"label":"Open","value":"OPEN"},{"label":"In Progress","value":"IN_PROGRESS"},{"label":"Work In Progress","value":"WORK_IN_PROGRESS"},{"label":"Pending","value":"PENDING"},{"label":"On Hold","value":"ON_HOLD"},{"label":"Resolved","value":"RESOLVED"},{"label":"Closed","value":"CLOSED"},{"label":"Reopened","value":"REOPENED"},{"label":"Cancelled","value":"CANCELLED"}]'::jsonb),
      ('priority',         'Priority',            'dropdown', true,  true, true, 50, '',
        '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"},{"label":"Critical","value":"CRITICAL"}]'::jsonb),
      ('impact',           'Impact',              'dropdown', false, true, true, 60, '',
        '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"}]'::jsonb),
      ('urgency',          'Urgency',             'dropdown', false, true, true, 70, '',
        '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"}]'::jsonb),
      ('short_description','Short Description',   'text',     true,  true, true, 80, 'Brief summary of the issue',     '[]'::jsonb),
      ('description',      'Detailed Description','textarea', true,  true, true, 90, 'Provide full details...',        '[]'::jsonb),
      ('assignment_group', 'Assignment Group',    'dropdown', false, true, true, 95, 'e.g. Storage Team',
        '[{"label":"Storage Team","value":"Storage Team"},{"label":"Network Team","value":"Network Team"},{"label":"Cloud Team","value":"Cloud Team"},{"label":"Hardware Support","value":"Hardware Support"},{"label":"Software Support","value":"Software Support"},{"label":"Access Management","value":"Access Management"},{"label":"DevOps Team","value":"DevOps Team"},{"label":"Security Team","value":"Security Team"},{"label":"L1 Support","value":"L1 Support"},{"label":"L2 Support","value":"L2 Support"},{"label":"L3 Support","value":"L3 Support"}]'::jsonb)
    ON CONFLICT (field_key) DO NOTHING
  `);

  // Backfill default options for system fields that were seeded without options on older installs.
  // Uses WHERE options = '[]' so customised values are never overwritten.
  await appClient.query(`
    UPDATE ticket_fields SET options = '[{"label":"New","value":"NEW"},{"label":"Open","value":"OPEN"},{"label":"In Progress","value":"IN_PROGRESS"},{"label":"Work In Progress","value":"WORK_IN_PROGRESS"},{"label":"Pending","value":"PENDING"},{"label":"On Hold","value":"ON_HOLD"},{"label":"Resolved","value":"RESOLVED"},{"label":"Closed","value":"CLOSED"},{"label":"Reopened","value":"REOPENED"},{"label":"Cancelled","value":"CANCELLED"}]'::jsonb
    WHERE field_key = 'status' AND options = '[]'::jsonb;

    UPDATE ticket_fields SET options = '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"},{"label":"Critical","value":"CRITICAL"}]'::jsonb
    WHERE field_key = 'priority' AND options = '[]'::jsonb;

    UPDATE ticket_fields SET options = '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"}]'::jsonb
    WHERE field_key = 'impact' AND options = '[]'::jsonb;

    UPDATE ticket_fields SET options = '[{"label":"Low","value":"LOW"},{"label":"Medium","value":"MEDIUM"},{"label":"High","value":"HIGH"}]'::jsonb
    WHERE field_key = 'urgency' AND options = '[]'::jsonb;

    UPDATE ticket_fields SET options = '[{"label":"FlashArray","value":"FlashArray"},{"label":"FlashBlade","value":"FlashBlade"},{"label":"Pure Cloud Block Store","value":"Pure Cloud Block Store"},{"label":"Evergreen//One","value":"Evergreen//One"},{"label":"ActiveCluster","value":"ActiveCluster"},{"label":"Portworx","value":"Portworx"},{"label":"General","value":"General"}]'::jsonb
    WHERE field_key = 'module_text' AND options = '[]'::jsonb;

    UPDATE ticket_fields SET options = '[{"label":"Storage Team","value":"Storage Team"},{"label":"Network Team","value":"Network Team"},{"label":"Cloud Team","value":"Cloud Team"},{"label":"Hardware Support","value":"Hardware Support"},{"label":"Software Support","value":"Software Support"},{"label":"Access Management","value":"Access Management"},{"label":"DevOps Team","value":"DevOps Team"},{"label":"Security Team","value":"Security Team"},{"label":"L1 Support","value":"L1 Support"},{"label":"L2 Support","value":"L2 Support"},{"label":"L3 Support","value":"L3 Support"}]'::jsonb
    WHERE field_key = 'assignment_group' AND options = '[]'::jsonb;
  `);

  // ── Mark built-in types as system (idempotent) ──
  await appClient.query(`ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`);
  await appClient.query(`
    UPDATE ticket_types SET is_system = TRUE
    WHERE name IN ('Incident','Service Request','Problem','Change Request') AND is_system = FALSE;
  `);

  // ── Ticket-type prefix & per-type counters (idempotent) ──
  // Add prefix column if missing (schema.sql already does this via ALTER, but safe to repeat)
  await appClient.query(`ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS prefix VARCHAR(10)`);

  // Seed well-known prefixes — only fills NULLs, never overwrites admin customisations
  await appClient.query(`
    UPDATE ticket_types SET prefix = 'INC' WHERE name = 'Incident'        AND (prefix IS NULL OR prefix = '');
    UPDATE ticket_types SET prefix = 'SR'  WHERE name = 'Service Request' AND (prefix IS NULL OR prefix = '');
    UPDATE ticket_types SET prefix = 'PRB' WHERE name = 'Problem'         AND (prefix IS NULL OR prefix = '');
    UPDATE ticket_types SET prefix = 'CHG' WHERE name = 'Change Request'  AND (prefix IS NULL OR prefix = '');
  `);

  // Create counter table if not present
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS ticket_type_counters (
      type_id UUID PRIMARY KEY REFERENCES ticket_types(id) ON DELETE CASCADE,
      counter INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Seed counters from existing ticket counts — ON CONFLICT DO NOTHING is safe for re-runs
  await appClient.query(`
    INSERT INTO ticket_type_counters (type_id, counter)
    SELECT tt.id, COUNT(t.id)::int
    FROM ticket_types tt
    LEFT JOIN tickets t ON t.type_id = tt.id AND t.deleted_at IS NULL
    GROUP BY tt.id
    ON CONFLICT (type_id) DO NOTHING
  `);

  // Ensure admin user exists — only user created on fresh install
  const adminExists = await appClient.query(`SELECT id FROM users WHERE username = 'admin'`);
  if (adminExists.rows.length === 0) {
    const adminHash = await argon2.hash('Admin@123');
    await appClient.query(
      `INSERT INTO users (username, email, full_name, password_hash, role)
       VALUES ('admin', 'admin@purestoragehorizon.com', 'Administrator', $1, 'admin')`,
      [adminHash]
    );
  }

  await appClient.end();
}

module.exports = dbInit;
