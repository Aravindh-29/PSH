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

  // MFA columns (idempotent)
  await appClient.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret   TEXT`);
  await appClient.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled  BOOLEAN NOT NULL DEFAULT FALSE`);
  await appClient.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT TRUE`);

  // Add password_hash if missing (older installs may have used 'password')
  await appClient.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''`);

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

  // Audit retention settings table (idempotent)
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS audit_retention_settings (
      id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
      retention_days  INTEGER     NOT NULL DEFAULT 30,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by      UUID        REFERENCES users(id)
    )
  `);
  await appClient.query(`INSERT INTO audit_retention_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);

  // Email configuration table (idempotent)
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS email_config (
      id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      smtp_host    VARCHAR(255) NOT NULL DEFAULT '',
      smtp_port    INTEGER      NOT NULL DEFAULT 587,
      smtp_user    VARCHAR(255) NOT NULL DEFAULT '',
      smtp_pass    TEXT         NOT NULL DEFAULT '',
      from_name    VARCHAR(255) NOT NULL DEFAULT 'PSH Notifications',
      from_email   VARCHAR(255) NOT NULL DEFAULT '',
      encryption   VARCHAR(10)  NOT NULL DEFAULT 'tls',
      is_enabled   BOOLEAN      NOT NULL DEFAULT FALSE,
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_by   UUID         REFERENCES users(id)
    )
  `);
  await appClient.query(`INSERT INTO email_config (id) VALUES (1) ON CONFLICT DO NOTHING`);

  // Assignment Groups (dynamic, admin-managed)
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS assignment_groups (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Many-to-many: users ↔ assignment_groups
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id UUID NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, group_id)
    )
  `);

  // Subcategories — dependent on categories
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS subcategories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(100) NOT NULL,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(name, category_id)
    )
  `);

  // Add new columns to tickets
  await appClient.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES subcategories(id)`);
  await appClient.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignment_group_id UUID REFERENCES assignment_groups(id)`);

  // Ensure admin user exists — only user created on fresh install
  const adminExists = await appClient.query(`SELECT id, password_hash FROM users WHERE username = 'admin'`);
  if (adminExists.rows.length === 0) {
    const adminHash = await argon2.hash('Admin@123');
    await appClient.query(
      `INSERT INTO users (username, email, full_name, password_hash, role)
       VALUES ('admin', 'admin@purestoragehorizon.com', 'Administrator', $1, 'admin')`,
      [adminHash]
    );
  } else if (!adminExists.rows[0].password_hash) {
    // password_hash is empty — happens when column was added to a pre-existing DB via ALTER TABLE DEFAULT ''
    const adminHash = await argon2.hash('Admin@123');
    await appClient.query(
      `UPDATE users SET password_hash = $1 WHERE username = 'admin'`,
      [adminHash]
    );
  }

  // Admin activity audit log (idempotent)
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
      action      VARCHAR(60) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id   VARCHAR(200),
      entity_name VARCHAR(300),
      details     JSONB       NOT NULL DEFAULT '{}',
      ip_address  VARCHAR(45),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await appClient.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC)
  `);

  // ── SLA System ─────────────────────────────────────────────────────────────
  await appClient.query(`
    CREATE TABLE IF NOT EXISTS sla_definitions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name             VARCHAR(200) NOT NULL,
      description      TEXT,
      start_status     VARCHAR(50)  NOT NULL,
      stop_statuses    JSONB        NOT NULL DEFAULT '["RESOLVED","CLOSED","CANCELLED"]',
      pause_statuses   JSONB        NOT NULL DEFAULT '["ON_HOLD","PENDING"]',
      duration_minutes INTEGER      NOT NULL DEFAULT 480,
      warn_pct         INTEGER      NOT NULL DEFAULT 50,
      critical_pct     INTEGER      NOT NULL DEFAULT 75,
      notify_on_warn    BOOLEAN      NOT NULL DEFAULT TRUE,
      notify_on_critical BOOLEAN    NOT NULL DEFAULT TRUE,
      notify_on_breach  BOOLEAN     NOT NULL DEFAULT TRUE,
      is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await appClient.query(`
    CREATE TABLE IF NOT EXISTS ticket_sla_instances (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sla_definition_id   UUID NOT NULL REFERENCES sla_definitions(id) ON DELETE CASCADE,
      duration_minutes    INTEGER       NOT NULL DEFAULT 480,
      started_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      target_at           TIMESTAMPTZ   NOT NULL,
      breached_at         TIMESTAMPTZ,
      completed_at        TIMESTAMPTZ,
      stage               VARCHAR(20)   NOT NULL DEFAULT 'active'
        CHECK (stage IN ('active','paused','completed','breached')),
      pause_started_at    TIMESTAMPTZ,
      total_pause_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
      notified_warn       BOOLEAN       NOT NULL DEFAULT FALSE,
      notified_critical   BOOLEAN       NOT NULL DEFAULT FALSE,
      notified_breach     BOOLEAN       NOT NULL DEFAULT FALSE,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await appClient.query(`CREATE INDEX IF NOT EXISTS idx_sla_instances_ticket ON ticket_sla_instances(ticket_id)`);
  await appClient.query(`CREATE INDEX IF NOT EXISTS idx_sla_instances_active  ON ticket_sla_instances(stage, target_at) WHERE stage IN ('active','paused')`);

  await appClient.end();
}

module.exports = dbInit;
