-- Pure Storage Horizon Ticketing System
-- Database Schema

BEGIN;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  sso_sub       TEXT,
  sso_provider  VARCHAR(50),
  role VARCHAR(64) NOT NULL DEFAULT 'employee',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SSO columns (safe to re-run on existing installs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_sub       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider  VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ DEFAULT NULL;

-- MFA columns (safe on existing installs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT TRUE;

-- Replace full-table UNIQUE constraints with partial indexes so that
-- soft-deleted users do not block re-creation with the same username/email.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_uq ON users(username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_uq    ON users(email)    WHERE deleted_at IS NULL;

-- Free username/email for any existing soft-deleted rows so credentials can be reused.
-- The _del_ guard makes this idempotent (safe to re-run on every startup).
UPDATE users
SET username = username || '_del_' || substring(id::text, 1, 8),
    email    = email    || '_del_' || substring(id::text, 1, 8)
WHERE deleted_at IS NOT NULL
  AND username NOT LIKE '%\_del\_%';

-- Modules
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  module_id UUID REFERENCES modules(id),
  module_text VARCHAR(255),
  category_id UUID REFERENCES categories(id),
  short_description VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED')),
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  impact VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (impact IN ('LOW','MEDIUM','HIGH')),
  urgency VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (urgency IN ('LOW','MEDIUM','HIGH')),
  ticket_owner UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  assignment_group VARCHAR(255),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attachments (stored as BYTEA in PostgreSQL)
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_data BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comments and Work Notes
CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'COMMENT' CHECK (type IN ('COMMENT','WORK_NOTE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS ticket_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dynamic ticket field definitions (system + custom)
CREATE TABLE IF NOT EXISTS ticket_fields (
  id SERIAL PRIMARY KEY,
  field_key VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text','textarea','dropdown','number','category')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  field_order INTEGER NOT NULL DEFAULT 100,
  placeholder VARCHAR(300) NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom field values for non-system fields (key → value map)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS custom_data JSONB NOT NULL DEFAULT '{}';

-- SSO configuration (single row, managed via Admin UI)
CREATE TABLE IF NOT EXISTS sso_config (
  id             INTEGER      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider_name  VARCHAR(100) NOT NULL DEFAULT '',
  issuer_url     TEXT         NOT NULL DEFAULT '',
  client_id      TEXT         NOT NULL DEFAULT '',
  client_secret  TEXT         NOT NULL DEFAULT '',
  redirect_uri   TEXT         NOT NULL DEFAULT '',
  auto_provision BOOLEAN      NOT NULL DEFAULT false,
  is_enabled     BOOLEAN      NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by     UUID         REFERENCES users(id)
);

-- Ticket Types (Incident, Service Request, Problem, Change, etc.)
CREATE TABLE IF NOT EXISTS ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add is_system column (safe on existing installs — IF NOT EXISTS guards it)
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed default ticket types if none exist
INSERT INTO ticket_types (name, description, is_system) VALUES
  ('Incident',        'Unplanned interruption or degradation of a service',      TRUE),
  ('Service Request', 'Request for information, access, or a standard change',   TRUE),
  ('Problem',         'Root cause investigation of one or more incidents',        TRUE),
  ('Change Request',  'Planned modification to the IT environment',               TRUE)
ON CONFLICT (name) DO NOTHING;

-- Link categories to a ticket type (optional – used for cascading subcategory dropdown)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES ticket_types(id);

-- Prefix column for ticket numbering (INC, CHG, PRB, SR, etc.)
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS prefix VARCHAR(10);

-- Per-type atomic counter — avoids global sequence contention and supports per-prefix numbering
CREATE TABLE IF NOT EXISTS ticket_type_counters (
  type_id UUID PRIMARY KEY REFERENCES ticket_types(id) ON DELETE CASCADE,
  counter INTEGER NOT NULL DEFAULT 0
);

-- Add type and classification columns to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS classification  VARCHAR(100);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_ticket ON ticket_audit_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON ticket_attachments(ticket_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL DEFAULT 'TICKET_ASSIGNED',
  title        TEXT NOT NULL,
  message      TEXT,
  ticket_id    UUID REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_number VARCHAR(20),
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Audit log retention policy (single-row settings table)
CREATE TABLE IF NOT EXISTS audit_retention_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
  retention_days  INTEGER     NOT NULL DEFAULT 30,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID        REFERENCES users(id)
);
INSERT INTO audit_retention_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Email SMTP configuration (single-row settings table)
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
);
INSERT INTO email_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Assignment Groups (dynamic, admin-managed)
CREATE TABLE IF NOT EXISTS assignment_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: users ↔ assignment_groups
CREATE TABLE IF NOT EXISTS user_groups (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

-- Subcategories — child of categories
CREATE TABLE IF NOT EXISTS subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, category_id)
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES subcategories(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignment_group_id UUID REFERENCES assignment_groups(id);

-- Admin activity audit log
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
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);

-- ── SLA System ───────────────────────────────────────────────────────────────

-- SLA global on/off switch (single row)
CREATE TABLE IF NOT EXISTS sla_settings (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);
INSERT INTO sla_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- SLA Definitions: one per status trigger, configurable stop/pause conditions
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
);

-- One active SLA instance per ticket per definition
CREATE TABLE IF NOT EXISTS ticket_sla_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sla_definition_id   UUID NOT NULL REFERENCES sla_definitions(id) ON DELETE CASCADE,
  duration_minutes    INTEGER      NOT NULL DEFAULT 480,
  started_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  target_at           TIMESTAMPTZ  NOT NULL,
  breached_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  stage               VARCHAR(20)  NOT NULL DEFAULT 'active'
    CHECK (stage IN ('active','paused','completed','breached')),
  pause_started_at    TIMESTAMPTZ,
  total_pause_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  notified_warn       BOOLEAN      NOT NULL DEFAULT FALSE,
  notified_critical   BOOLEAN      NOT NULL DEFAULT FALSE,
  notified_breach     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sla_instances_ticket ON ticket_sla_instances(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sla_instances_active ON ticket_sla_instances(stage, target_at)
  WHERE stage IN ('active','paused');


-- Optional ticket templates. Ticket snapshots preserve historical names and fields.
CREATE TABLE IF NOT EXISTS ticket_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_templates_name_unique ON ticket_templates (LOWER(name));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES ticket_templates(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS template_snapshot JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS template_values JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_tickets_template_id ON tickets(template_id);

-- One organization identity per application installation; disabled by default.
CREATE TABLE IF NOT EXISTS organization_branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  customize BOOLEAN NOT NULL DEFAULT FALSE,
  organization_name VARCHAR(150) NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT customize OR LENGTH(TRIM(organization_name)) > 0)
);
INSERT INTO organization_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE organization_branding ADD COLUMN IF NOT EXISTS service_desk_name VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE organization_branding ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) NOT NULL DEFAULT '#E85D04';
ALTER TABLE organization_branding ADD COLUMN IF NOT EXISTS logo_data TEXT NOT NULL DEFAULT '';

-- Configurable roles and delegated team access (safe for existing installations).
CREATE TABLE IF NOT EXISTS access_roles (
  key VARCHAR(64) PRIMARY KEY, name VARCHAR(150) NOT NULL, responsibility TEXT NOT NULL DEFAULT '',
  permissions JSONB NOT NULL DEFAULT '{}', assignable_roles JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE, is_system BOOLEAN NOT NULL DEFAULT FALSE, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_roles_name_unique ON access_roles(LOWER(name));
-- Initial defaults mirror server/src/access/catalog.js; existing role edits are preserved.
INSERT INTO access_roles(key,name,responsibility,permissions,is_system) VALUES
 ('admin','Admin','Full application administration','{"dashboard.view":"all","dashboard.global":"all","query.view":"all","users.tickets":"all","tickets.view":"all","tickets.group_view":"all","tickets.create":"all","tickets.edit":"all","tickets.priority":"all","tickets.impact":"all","tickets.urgency":"all","tickets.category":"all","tickets.type":"all","tickets.classification":"all","tickets.template":"all","tickets.status":"all","tickets.resolve":"all","tickets.close":"all","tickets.reopen":"all","tickets.cancel":"all","tickets.assign":"all","tickets.owner":"all","tickets.delete":"all","comments.view":"all","comments.add":"all","comments.work_note":"all","attachments.upload":"all","attachments.preview":"all","attachments.download":"all","attachments.zip":"all","attachments.delete":"all","kb.view":"all","kb.drafts":"all","kb.create":"all","kb.edit":"all","kb.publish":"all","kb.delete":"all","reports.view":"all","reports.global":"all","reports.export":"all","sla.view":"all","qa.view":"all","qa.drill":"all","qa.export":"all","users.view":"all","users.create":"all","users.edit":"all","users.assign_role":"all","users.groups":"all","users.status":"all","users.delete":"all","users.delete_tickets":"all","users.bulk_template":"all","users.bulk_validate":"all","users.bulk_create":"all","users.password":"all","users.mfa_reset":"all","users.mfa_requirement":"all","groups.view":"all","groups.create":"all","groups.edit":"all","groups.status":"all","groups.members":"all","groups.delete":"all","fields.view":"all","fields.create":"all","fields.edit":"all","fields.required":"all","fields.active":"all","fields.lock":"all","fields.reorder":"all","fields.delete":"all","fields.reset":"all","categories.view":"all","categories.create":"all","categories.edit":"all","categories.status":"all","categories.delete":"all","categories.force_delete":"all","subcategories.create":"all","subcategories.edit":"all","subcategories.status":"all","subcategories.delete":"all","types.view":"all","types.create":"all","types.edit":"all","types.status":"all","types.delete":"all","templates.view":"all","templates.create":"all","templates.edit":"all","templates.status":"all","branding.view":"all","branding.edit":"all","branding.logo":"all","branding.accent":"all","branding.toggle":"all","sla_config.view":"all","sla_config.create":"all","sla_config.edit":"all","sla_config.status":"all","sla_config.defaults":"all","sla_config.toggle":"all","sso.view":"all","sso.edit":"all","sso.test":"all","sso.toggle":"all","email.view":"all","email.edit":"all","email.test":"all","email.toggle":"all","sso.clear":"all","audit.view":"all","audit.admin":"all","audit.retention":"all","roles.view":"all","roles.create":"all","roles.edit":"all","roles.permissions":"all","roles.status":"all","roles.delete":"all","roles.history":"all","profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","tickets.history":"all","users.activity":"all","email.history":"all","email.retry":"all"}'::jsonb,TRUE),
 ('employee','User / Employee','Create and work on permitted tickets','{"dashboard.view":"own","query.view":"own","tickets.view":"related","tickets.group_view":"groups","tickets.create":"own","tickets.edit":"own","tickets.priority":"own","tickets.impact":"own","tickets.urgency":"own","tickets.category":"own","tickets.type":"own","tickets.classification":"own","tickets.template":"own","tickets.status":"own","tickets.resolve":"own","tickets.close":"own","tickets.reopen":"own","tickets.cancel":"own","tickets.assign":"own","tickets.delete":"own","comments.view":"own","comments.add":"own","comments.work_note":"own","attachments.upload":"own","attachments.preview":"own","attachments.download":"own","attachments.zip":"own","attachments.delete":"own","kb.view":"all","reports.view":"own","reports.export":"own","sla.view":"own","profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","tickets.history":"own"}'::jsonb,TRUE)
ON CONFLICT(key) DO NOTHING;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(64);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_access_role_fk') THEN
   ALTER TABLE users ADD CONSTRAINT users_access_role_fk FOREIGN KEY(role) REFERENCES access_roles(key);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS user_managed_groups (
 user_id UUID REFERENCES users(id) ON DELETE CASCADE, group_id UUID REFERENCES assignment_groups(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,group_id)
);
CREATE INDEX IF NOT EXISTS idx_managed_group ON user_managed_groups(group_id);
CREATE TABLE IF NOT EXISTS access_role_history (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),role_key VARCHAR(64) NOT NULL,actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
 before_value JSONB,after_value JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS access_migrations(key TEXT PRIMARY KEY);
WITH migration AS (
 INSERT INTO access_migrations VALUES('initial-managed-groups') ON CONFLICT DO NOTHING RETURNING key
) INSERT INTO user_managed_groups SELECT user_id,group_id FROM user_groups WHERE EXISTS(SELECT 1 FROM migration) ON CONFLICT DO NOTHING;

-- Email authentication settings. Secret encryption is performed by database/migrate.js.
ALTER TABLE email_config ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'password',
 ADD COLUMN IF NOT EXISTS oauth_client_id TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS oauth_client_secret TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS oauth_token_url TEXT NOT NULL DEFAULT 'https://oauth2.googleapis.com/token',
 ADD COLUMN IF NOT EXISTS tls_servername TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS tls_ca TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS email_outbox (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),recipient TEXT NOT NULL,subject TEXT NOT NULL,html TEXT NOT NULL,
 from_name TEXT NOT NULL,from_email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(status,next_attempt_at);

-- Knowledge Base and session persistence are included for complete installations.
CREATE TABLE IF NOT EXISTS kb_articles (
 id SERIAL PRIMARY KEY,title VARCHAR(255) NOT NULL,content TEXT NOT NULL,category VARCHAR(100) NOT NULL DEFAULT 'General',
 author_id UUID REFERENCES users(id) ON DELETE SET NULL,status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',views INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),deleted_at TIMESTAMPTZ,
 deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,slug VARCHAR(100) UNIQUE
);
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;
CREATE TABLE IF NOT EXISTS session (sid VARCHAR PRIMARY KEY,sess JSON NOT NULL,expire TIMESTAMP(6) NOT NULL);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session(expire);

COMMIT;
