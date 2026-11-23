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
-- BEGIN GENERATED DEFAULT ROLES
-- Generated by server/scripts/sync-default-roles.js. Existing names, keys and edits are preserved.
ALTER TABLE access_roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
INSERT INTO access_roles(key,name,responsibility,permissions,assignable_roles,is_default) VALUES
 ('manager','Manager','Manage assigned departments and sub departments, supervise team tickets, assign work and add existing unassigned users. Only Admin creates user accounts and grants department access.','{"profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","dashboard.view":"groups","departments.managed_access":"all","tickets.view":"groups","query.view":"groups","tickets.group_view":"groups","tickets.history":"groups","comments.view":"groups","attachments.preview":"groups","attachments.download":"groups","attachments.zip":"groups","sla.view":"groups","kb.view":"all","tickets.edit":"groups","tickets.priority":"groups","tickets.impact":"groups","tickets.urgency":"groups","tickets.category":"groups","tickets.classification":"groups","tickets.template":"groups","tickets.status":"groups","comments.work_note":"groups","tickets.resolve":"groups","tickets.reopen":"groups","comments.add":"groups","attachments.upload":"groups","reports.view":"groups","reports.export":"groups","qa.view":"groups","qa.drill":"groups","qa.export":"groups","tickets.create":"own","tickets.close":"groups","tickets.assign":"groups","users.tickets":"all","users.team_view":"all","users.team_add":"all","departments.view":"all","departments.subgroups":"all","departments.members":"all","dashboard.team":"groups"}','[]',TRUE)
ON CONFLICT DO NOTHING;
UPDATE access_roles SET permissions='{"dashboard.view":"all","dashboard.global":"all","query.view":"all","users.tickets":"all","tickets.view":"all","tickets.group_view":"all","tickets.create":"all","tickets.edit":"all","tickets.priority":"all","tickets.impact":"all","tickets.urgency":"all","tickets.category":"all","tickets.type":"all","tickets.classification":"all","tickets.template":"all","tickets.status":"all","tickets.resolve":"all","tickets.close":"all","tickets.reopen":"all","tickets.cancel":"all","tickets.assign":"all","tickets.owner":"all","tickets.delete":"all","comments.view":"all","comments.add":"all","comments.work_note":"all","attachments.upload":"all","attachments.preview":"all","attachments.download":"all","attachments.zip":"all","attachments.delete":"all","kb.view":"all","kb.drafts":"all","kb.create":"all","kb.edit":"all","kb.publish":"all","kb.delete":"all","reports.view":"all","reports.global":"all","reports.export":"all","sla.view":"all","qa.view":"all","qa.drill":"all","qa.export":"all","users.view":"all","users.create":"all","users.edit":"all","users.assign_role":"all","users.groups":"all","users.status":"all","users.delete":"all","users.delete_tickets":"all","users.bulk_template":"all","users.bulk_validate":"all","users.bulk_create":"all","users.password":"all","users.mfa_reset":"all","users.mfa_requirement":"all","groups.view":"all","groups.create":"all","groups.edit":"all","groups.status":"all","groups.members":"all","groups.delete":"all","fields.view":"all","fields.create":"all","fields.edit":"all","fields.required":"all","fields.active":"all","fields.lock":"all","fields.reorder":"all","fields.delete":"all","fields.reset":"all","categories.view":"all","categories.create":"all","categories.edit":"all","categories.status":"all","categories.delete":"all","categories.force_delete":"all","subcategories.create":"all","subcategories.edit":"all","subcategories.status":"all","subcategories.delete":"all","types.view":"all","types.create":"all","types.edit":"all","types.status":"all","types.delete":"all","templates.view":"all","templates.create":"all","templates.edit":"all","templates.status":"all","branding.view":"all","branding.edit":"all","branding.logo":"all","branding.accent":"all","branding.toggle":"all","sla_config.view":"all","sla_config.create":"all","sla_config.edit":"all","sla_config.status":"all","sla_config.defaults":"all","sla_config.toggle":"all","sso.view":"all","sso.edit":"all","sso.test":"all","sso.toggle":"all","email.view":"all","email.edit":"all","email.test":"all","email.toggle":"all","sso.clear":"all","audit.view":"all","audit.admin":"all","audit.retention":"all","profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","tickets.history":"all","users.activity":"all","email.history":"all","email.retry":"all","users.directory_view":"all","users.team_view":"all","users.team_add":"all","departments.view":"all","departments.subgroups":"all","departments.members":"all","departments.configure":"all","departments.managed_access":"all","dashboard.team":"all"}'::jsonb WHERE key='admin';
CREATE TABLE IF NOT EXISTS access_migrations(key TEXT PRIMARY KEY);
WITH migration AS (
  INSERT INTO access_migrations VALUES('manager-team-users-v1') ON CONFLICT DO NOTHING RETURNING key
) UPDATE access_roles SET permissions=permissions || '{"users.team_view":"all","users.team_create":"all"}'::jsonb,
    version=version+1,updated_at=NOW()
  WHERE (key='manager' OR LOWER(name)='manager')
    AND NOT permissions @> '{"users.team_view":"all","users.team_create":"all"}'::jsonb
    AND EXISTS(SELECT 1 FROM migration);

WITH migration AS (
 INSERT INTO access_migrations VALUES('explicit-managed-access-v1') ON CONFLICT DO NOTHING RETURNING key
) UPDATE access_roles r SET permissions=permissions || '{"departments.managed_access":"all"}'::jsonb,
 version=version+1,updated_at=NOW()
 WHERE r.key NOT IN ('employee','support_agent','knowledge_author','knowledge_manager','configuration_manager')
 AND (r.key='admin' OR EXISTS(SELECT 1 FROM jsonb_each_text(r.permissions) p WHERE p.value='groups')
      OR r.permissions ?| ARRAY['dashboard.team','users.team_view','departments.subgroups','departments.members'])
 AND NOT r.permissions ? 'departments.managed_access' AND EXISTS(SELECT 1 FROM migration);
WITH migration AS (
 INSERT INTO access_migrations VALUES('employee-membership-scope-v1') ON CONFLICT DO NOTHING RETURNING key
) UPDATE access_roles SET permissions=jsonb_set(permissions,'{tickets.group_view}','"related"'),
 version=version+1,updated_at=NOW()
 WHERE key='employee' AND permissions->>'tickets.group_view'='groups' AND EXISTS(SELECT 1 FROM migration);
-- END GENERATED DEFAULT ROLES
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
-- Membership never grants management automatically.
INSERT INTO access_migrations VALUES('initial-managed-groups') ON CONFLICT DO NOTHING;

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
-- BEGIN ORGANIZATION HIERARCHY
CREATE TABLE IF NOT EXISTS organization_regions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(150) NOT NULL,is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_region_name ON organization_regions(LOWER(name));
CREATE TABLE IF NOT EXISTS organization_countries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),region_id UUID NOT NULL REFERENCES organization_regions(id),
 name VARCHAR(150) NOT NULL,is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_country_name ON organization_countries(region_id,LOWER(name));
INSERT INTO organization_regions(name) VALUES('Asia Pacific'),('Europe'),('North America') ON CONFLICT DO NOTHING;
INSERT INTO organization_countries(region_id,name)
 SELECT r.id,v.country FROM (VALUES
 ('Asia Pacific','Malaysia'),('Asia Pacific','Singapore'),('Asia Pacific','India'),('Asia Pacific','Australia'),('Asia Pacific','South Korea'),
 ('Europe','United Kingdom'),('Europe','Germany'),('Europe','France'),('Europe','Netherlands'),('North America','USA'),('North America','Canada')
 ) v(region,country) JOIN organization_regions r ON r.name=v.region ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS organization_settings(id INT PRIMARY KEY CHECK(id=1),allow_multiple BOOLEAN NOT NULL DEFAULT TRUE);
INSERT INTO organization_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE assignment_groups ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES assignment_groups(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES organization_regions(id),
 ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES organization_countries(id);
-- Retain original IDs, memberships and ticket assignments. Existing departments
-- have no inferred region; an administrator selects it before adding subgroups.
ALTER TABLE assignment_groups DROP CONSTRAINT IF EXISTS assignment_groups_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS organization_department_name ON assignment_groups(LOWER(name),COALESCE(region_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organization_subgroup_name ON assignment_groups(parent_id,LOWER(name)) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS organization_parent ON assignment_groups(parent_id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subgroup_id UUID REFERENCES assignment_groups(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tickets_subgroup ON tickets(subgroup_id);

CREATE OR REPLACE FUNCTION servit_validate_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent assignment_groups; country organization_countries;
BEGIN
 IF NEW.parent_id IS NOT NULL THEN
   SELECT * INTO parent FROM assignment_groups WHERE id=NEW.parent_id;
   SELECT * INTO country FROM organization_countries WHERE id=NEW.country_id;
   IF parent.id IS NULL OR parent.parent_id IS NOT NULL OR parent.region_id IS NULL OR country.id IS NULL OR country.region_id<>parent.region_id THEN
     RAISE EXCEPTION 'Sub Department country must belong to the parent department region.' USING ERRCODE='23514';
   END IF;
   NEW.region_id:=parent.region_id;
 ELSE
   IF NEW.country_id IS NOT NULL THEN RAISE EXCEPTION 'Countries are assigned to sub departments.' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND NEW.region_id IS DISTINCT FROM OLD.region_id AND EXISTS(SELECT 1 FROM assignment_groups WHERE parent_id=NEW.id) THEN
     RAISE EXCEPTION 'Move or remove sub departments before changing the department region.' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
   RAISE EXCEPTION 'Moving an existing department or sub department is not supported.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS servit_organization_check ON assignment_groups;
CREATE TRIGGER servit_organization_check BEFORE INSERT OR UPDATE ON assignment_groups FOR EACH ROW EXECUTE FUNCTION servit_validate_organization();

CREATE OR REPLACE FUNCTION servit_validate_ticket_organization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.assignment_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assignment_groups WHERE id=NEW.assignment_group_id AND parent_id IS NULL) THEN
   RAISE EXCEPTION 'Select a department for the ticket.' USING ERRCODE='23514';
 END IF;
 IF NEW.subgroup_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assignment_groups WHERE id=NEW.subgroup_id AND parent_id=NEW.assignment_group_id) THEN
   RAISE EXCEPTION 'Ticket sub department must belong to its department.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS servit_ticket_organization_check ON tickets;
CREATE TRIGGER servit_ticket_organization_check BEFORE INSERT OR UPDATE OF assignment_group_id,subgroup_id ON tickets FOR EACH ROW EXECUTE FUNCTION servit_validate_ticket_organization();

CREATE OR REPLACE FUNCTION servit_check_single_membership(target UUID) RETURNS BOOLEAN LANGUAGE sql AS $$
 SELECT COUNT(DISTINCT COALESCE(g.parent_id,g.id))<=1 AND
 (BOOL_OR(g.parent_id IS NULL) OR COUNT(*)<=1)
 FROM user_groups ug JOIN assignment_groups g ON g.id=ug.group_id WHERE ug.user_id=target
$$;
-- Membership is selected through checkboxes; multiple membership is permanent.
-- Keep the compatibility setting true and remove the previous single-team trigger.
DROP TRIGGER IF EXISTS servit_membership_check ON user_groups;
UPDATE organization_settings SET allow_multiple=TRUE WHERE NOT allow_multiple;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='organization_settings'::regclass AND conname='organization_multiple_membership_enabled') THEN
  ALTER TABLE organization_settings ADD CONSTRAINT organization_multiple_membership_enabled CHECK(allow_multiple);
 END IF;
END $$;
INSERT INTO access_migrations VALUES('checkbox-membership-always-multiple-v1') ON CONFLICT DO NOTHING;

WITH migration AS (
 INSERT INTO access_migrations VALUES('organization-hierarchy-v1') ON CONFLICT DO NOTHING RETURNING key
) UPDATE access_roles SET permissions=(permissions-'users.team_create') ||
 CASE WHEN key='admin' OR key='manager' OR LOWER(name)='manager' THEN
 '{"departments.view":"all","departments.subgroups":"all","departments.members":"all","users.team_view":"all","users.team_add":"all","dashboard.team":"groups"}'::jsonb ELSE '{}'::jsonb END,
 version=version+1,updated_at=NOW() WHERE EXISTS(SELECT 1 FROM migration);

-- Enable the scoped ticket directory once for existing Manager roles.
WITH migration AS (
 INSERT INTO access_migrations VALUES('manager-user-ticket-directory-v1') ON CONFLICT DO NOTHING RETURNING key
) UPDATE access_roles SET permissions=permissions||'{"users.tickets":"all"}'::jsonb,
 version=version+1,updated_at=NOW()
 WHERE (key='manager' OR LOWER(name)='manager') AND EXISTS(SELECT 1 FROM migration);

-- Display names only: retain field keys, article IDs and all access relationships.
UPDATE ticket_fields SET label='Department' WHERE field_key='assignment_group' AND label IN ('Assignment Group','Group','Groups');
UPDATE kb_articles SET title='Roles, Permissions, Departments and Managed Departments - Manager Example'
 WHERE title='Roles, Permissions, Groups and Managed Groups - Manager Example'
 AND NOT EXISTS(SELECT 1 FROM kb_articles WHERE title='Roles, Permissions, Departments and Managed Departments - Manager Example');

-- Free-text routing references for departments and sub departments.
CREATE TABLE IF NOT EXISTS department_findings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 department_id UUID NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
 content TEXT NOT NULL CHECK(length(btrim(content))>0 AND length(content)<=20000),
 created_by UUID REFERENCES users(id) ON DELETE SET NULL,
 updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS department_findings_department ON department_findings(department_id,updated_at DESC) WHERE deleted_at IS NULL;

-- END ORGANIZATION HIERARCHY
-- BEGIN FIXED APPLICATION ROLES

ALTER TABLE access_roles ADD COLUMN IF NOT EXISTS role_kind VARCHAR(16);
CREATE TABLE IF NOT EXISTS retired_access_roles (
 role_key VARCHAR(64) PRIMARY KEY, snapshot JSONB NOT NULL, retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS retired_user_roles (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 role_key VARCHAR(64) NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $fixed_roles$
DECLARE manager_key VARCHAR(64);
BEGIN
 SELECT r.key INTO manager_key FROM access_roles r
 WHERE r.key NOT IN ('admin','employee') AND (r.role_kind='manager' OR r.key='manager' OR LOWER(r.name)='manager')
 ORDER BY (r.role_kind='manager') DESC NULLS LAST,
 (EXISTS(SELECT 1 FROM users u WHERE u.role=r.key)) DESC,(r.key='manager') DESC LIMIT 1;
 IF manager_key IS NULL THEN
   -- Free the fixed display name without deleting the previous definition.
   INSERT INTO retired_access_roles SELECT key,to_jsonb(r),NOW() FROM access_roles r
     WHERE LOWER(name)='manager' AND key NOT IN ('admin','employee') ON CONFLICT DO NOTHING;
   UPDATE access_roles SET name='Retired role '||key WHERE LOWER(name)='manager' AND key NOT IN ('admin','employee');
   INSERT INTO access_roles(key,name,responsibility,permissions,is_default)
   VALUES('manager','Manager','Manage assigned departments and sub departments, supervise team tickets, assign work and add existing unassigned users. Only Admin creates user accounts and grants department access.','{"profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","dashboard.view":"groups","departments.managed_access":"all","tickets.view":"groups","query.view":"groups","tickets.group_view":"groups","tickets.history":"groups","comments.view":"groups","attachments.preview":"groups","attachments.download":"groups","attachments.zip":"groups","sla.view":"groups","kb.view":"all","tickets.edit":"groups","tickets.priority":"groups","tickets.impact":"groups","tickets.urgency":"groups","tickets.category":"groups","tickets.classification":"groups","tickets.template":"groups","tickets.status":"groups","comments.work_note":"groups","tickets.resolve":"groups","tickets.reopen":"groups","comments.add":"groups","attachments.upload":"groups","reports.view":"groups","reports.export":"groups","qa.view":"groups","qa.drill":"groups","qa.export":"groups","tickets.create":"own","tickets.close":"groups","tickets.assign":"groups","users.tickets":"all","users.team_view":"all","users.team_add":"all","departments.view":"all","departments.subgroups":"all","departments.members":"all","dashboard.team":"groups"}'::jsonb,TRUE);
   manager_key:='manager';
 END IF;
 INSERT INTO retired_access_roles SELECT key,to_jsonb(r),NOW() FROM access_roles r
   WHERE key NOT IN ('admin','employee',manager_key) ON CONFLICT DO NOTHING;
 -- Preserve the former role of accounts from older, more complex installations.
 INSERT INTO retired_user_roles(user_id,role_key) SELECT id,role FROM users
   WHERE role NOT IN ('admin','employee',manager_key) ON CONFLICT DO NOTHING;
 UPDATE users SET role='employee',updated_at=NOW() WHERE role NOT IN ('admin','employee',manager_key);
 UPDATE access_roles SET is_active=FALSE,role_kind=NULL,
   name=CASE WHEN LOWER(name) IN ('admin','user','manager') THEN 'Retired role '||key ELSE name END
   WHERE key NOT IN ('admin','employee',manager_key);
 UPDATE access_roles r SET name=v.name,responsibility=v.responsibility,permissions=v.permissions,
   role_kind=v.kind,is_active=TRUE,is_system=TRUE,is_default=FALSE,assignable_roles='[]'::jsonb,
   version=r.version+1,updated_at=NOW()
 FROM (VALUES
  ('admin'::varchar,'Admin','Full application administration','{"dashboard.view":"all","dashboard.global":"all","query.view":"all","users.tickets":"all","tickets.view":"all","tickets.group_view":"all","tickets.create":"all","tickets.edit":"all","tickets.priority":"all","tickets.impact":"all","tickets.urgency":"all","tickets.category":"all","tickets.type":"all","tickets.classification":"all","tickets.template":"all","tickets.status":"all","tickets.resolve":"all","tickets.close":"all","tickets.reopen":"all","tickets.cancel":"all","tickets.assign":"all","tickets.owner":"all","tickets.delete":"all","comments.view":"all","comments.add":"all","comments.work_note":"all","attachments.upload":"all","attachments.preview":"all","attachments.download":"all","attachments.zip":"all","attachments.delete":"all","kb.view":"all","kb.drafts":"all","kb.create":"all","kb.edit":"all","kb.publish":"all","kb.delete":"all","reports.view":"all","reports.global":"all","reports.export":"all","sla.view":"all","qa.view":"all","qa.drill":"all","qa.export":"all","users.view":"all","users.create":"all","users.edit":"all","users.assign_role":"all","users.groups":"all","users.status":"all","users.delete":"all","users.delete_tickets":"all","users.bulk_template":"all","users.bulk_validate":"all","users.bulk_create":"all","users.password":"all","users.mfa_reset":"all","users.mfa_requirement":"all","groups.view":"all","groups.create":"all","groups.edit":"all","groups.status":"all","groups.members":"all","groups.delete":"all","fields.view":"all","fields.create":"all","fields.edit":"all","fields.required":"all","fields.active":"all","fields.lock":"all","fields.reorder":"all","fields.delete":"all","fields.reset":"all","categories.view":"all","categories.create":"all","categories.edit":"all","categories.status":"all","categories.delete":"all","categories.force_delete":"all","subcategories.create":"all","subcategories.edit":"all","subcategories.status":"all","subcategories.delete":"all","types.view":"all","types.create":"all","types.edit":"all","types.status":"all","types.delete":"all","templates.view":"all","templates.create":"all","templates.edit":"all","templates.status":"all","branding.view":"all","branding.edit":"all","branding.logo":"all","branding.accent":"all","branding.toggle":"all","sla_config.view":"all","sla_config.create":"all","sla_config.edit":"all","sla_config.status":"all","sla_config.defaults":"all","sla_config.toggle":"all","sso.view":"all","sso.edit":"all","sso.test":"all","sso.toggle":"all","email.view":"all","email.edit":"all","email.test":"all","email.toggle":"all","sso.clear":"all","audit.view":"all","audit.admin":"all","audit.retention":"all","profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","tickets.history":"all","users.activity":"all","email.history":"all","email.retry":"all","users.directory_view":"all","users.team_view":"all","users.team_add":"all","departments.view":"all","departments.subgroups":"all","departments.members":"all","departments.configure":"all","departments.managed_access":"all","dashboard.team":"all"}'::jsonb,'admin'),
  ('employee'::varchar,'User','Work on permitted tickets within department membership','{"dashboard.view":"own","query.view":"own","tickets.view":"related","tickets.group_view":"related","tickets.create":"own","tickets.edit":"related","tickets.priority":"related","tickets.impact":"related","tickets.urgency":"related","tickets.category":"related","tickets.type":"related","tickets.classification":"related","tickets.template":"related","tickets.status":"related","tickets.resolve":"related","tickets.close":"related","tickets.reopen":"related","tickets.cancel":"related","tickets.assign":"related","tickets.delete":"own","comments.view":"related","comments.add":"related","comments.work_note":"related","attachments.upload":"related","attachments.preview":"related","attachments.download":"related","attachments.zip":"related","attachments.delete":"own","kb.view":"all","reports.view":"own","reports.export":"own","sla.view":"related","profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","tickets.history":"related","users.directory_view":"all"}'::jsonb,'user'),
  (manager_key,'Manager','Manage assigned departments and sub departments, supervise team tickets, assign work and add existing unassigned users. Only Admin creates user accounts and grants department access.','{"profile.view":"all","profile.edit":"all","profile.password":"all","notifications.view":"all","notifications.read":"all","dashboard.view":"groups","departments.managed_access":"all","tickets.view":"groups","query.view":"groups","tickets.group_view":"groups","tickets.history":"groups","comments.view":"groups","attachments.preview":"groups","attachments.download":"groups","attachments.zip":"groups","sla.view":"groups","kb.view":"all","tickets.edit":"groups","tickets.priority":"groups","tickets.impact":"groups","tickets.urgency":"groups","tickets.category":"groups","tickets.classification":"groups","tickets.template":"groups","tickets.status":"groups","comments.work_note":"groups","tickets.resolve":"groups","tickets.reopen":"groups","comments.add":"groups","attachments.upload":"groups","reports.view":"groups","reports.export":"groups","qa.view":"groups","qa.drill":"groups","qa.export":"groups","tickets.create":"own","tickets.close":"groups","tickets.assign":"groups","users.tickets":"all","users.team_view":"all","users.team_add":"all","departments.view":"all","departments.subgroups":"all","departments.members":"all","dashboard.team":"groups"}'::jsonb,'manager')
 ) v(key,name,responsibility,permissions,kind)
 WHERE r.key=v.key AND (r.name,r.responsibility,r.permissions,r.role_kind,r.is_active,r.is_system,r.is_default,r.assignable_roles)
 IS DISTINCT FROM (v.name,v.responsibility,v.permissions,v.kind,TRUE,TRUE,FALSE,'[]'::jsonb);
END $fixed_roles$;
CREATE UNIQUE INDEX IF NOT EXISTS fixed_access_role_kind ON access_roles(role_kind) WHERE role_kind IS NOT NULL;
INSERT INTO access_migrations VALUES('three-fixed-roles-v1') ON CONFLICT DO NOTHING;

-- END FIXED APPLICATION ROLES
-- BEGIN TICKET INBOX
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS inbox_revision BIGINT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS ticket_inbox_receipts (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 seen_revision BIGINT NOT NULL CHECK(seen_revision>=1),
 opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,ticket_id)
);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS inbox_event TEXT NOT NULL DEFAULT 'ARRIVED';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS inbox_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE FUNCTION servit_ticket_inbox_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.assigned_to,NEW.assignment_group_id,NEW.subgroup_id) IS DISTINCT FROM
    (OLD.assigned_to,OLD.assignment_group_id,OLD.subgroup_id) THEN
  NEW.inbox_revision:=OLD.inbox_revision+1;
  NEW.inbox_event:=CASE WHEN NEW.assigned_to IS NULL THEN 'ROUTED' ELSE 'ASSIGNED' END;
  NEW.inbox_event_at:=NOW();
 ELSIF OLD.status='CLOSED' AND NEW.status IN ('IN_PROGRESS','REOPENED') THEN
  NEW.inbox_revision:=OLD.inbox_revision+1;
  NEW.inbox_event:='REOPENED';
  NEW.inbox_event_at:=NOW();
 ELSE
  NEW.inbox_revision:=OLD.inbox_revision;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ticket_inbox_revision ON tickets;
CREATE TRIGGER ticket_inbox_revision BEFORE UPDATE OF assigned_to,assignment_group_id,subgroup_id,status
 ON tickets FOR EACH ROW EXECUTE FUNCTION servit_ticket_inbox_revision();
CREATE INDEX IF NOT EXISTS tickets_inbox_assignee ON tickets(assigned_to,updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tickets_inbox_unassigned ON tickets(assignment_group_id,subgroup_id,updated_at DESC)
 WHERE assigned_to IS NULL AND deleted_at IS NULL;

-- END TICKET INBOX
-- BEGIN EMAIL AUTOMATION
-- Stage 1: persisted email identity and routing. No Gmail connection or outbound mail.
CREATE TABLE IF NOT EXISTS mcp_server_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 is_enabled BOOLEAN NOT NULL,
 token_encrypted TEXT,
 checked_at TIMESTAMPTZ,
 checked_fingerprint TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_system_identity_disabled') THEN
  ALTER TABLE users ADD CONSTRAINT users_system_identity_disabled CHECK(NOT is_system OR (NOT is_active AND role='employee' AND deleted_at IS NULL));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_single_system_identity ON users(is_system) WHERE is_system;
CREATE OR REPLACE FUNCTION protect_system_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.is_system THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'The System identity cannot be deleted.' USING ERRCODE='23514'; END IF;
  IF NOT NEW.is_system OR NEW.is_active OR NEW.role<>'employee' OR NEW.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'The System identity cannot sign in or be reassigned.' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_protect_system ON users;
CREATE TRIGGER users_protect_system BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_system_identity();

CREATE TABLE IF NOT EXISTS email_automation_mailboxes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 address VARCHAR(254) NOT NULL UNIQUE CHECK(address=lower(address)),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 allowed_department_ids UUID[] NOT NULL DEFAULT '{}',
 sender_domains TEXT[] NOT NULL DEFAULT '{}',
 defaults JSONB NOT NULL DEFAULT '{}',
 fallback_department_id UUID REFERENCES assignment_groups(id),
 fallback_subdepartment_id UUID REFERENCES assignment_groups(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS incoming_email_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 mailbox_id UUID NOT NULL REFERENCES email_automation_mailboxes(id),
 message_id VARCHAR(512) NOT NULL,
 thread_id VARCHAR(512) NOT NULL,
 sender VARCHAR(254) NOT NULL,
 subject TEXT NOT NULL DEFAULT '',
 body TEXT NOT NULL,
 received_at TIMESTAMPTZ NOT NULL,
 external_case_reference TEXT,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','needs_review','failed')),
 ticket_id UUID REFERENCES tickets(id),
 comment_id UUID REFERENCES ticket_comments(id) ON DELETE SET NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 routing_reason TEXT,
 error TEXT,
 attachment_errors JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(mailbox_id,message_id)
);
CREATE INDEX IF NOT EXISTS incoming_email_status ON incoming_email_messages(mailbox_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS incoming_email_threads (
 mailbox_id UUID NOT NULL REFERENCES email_automation_mailboxes(id),
 thread_id VARCHAR(512) NOT NULL,
 ticket_id UUID NOT NULL REFERENCES tickets(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(mailbox_id,thread_id)
);

CREATE TABLE IF NOT EXISTS gmail_oauth_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 client_id TEXT NOT NULL,
 client_secret_encrypted TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_ai_providers (
 provider TEXT PRIMARY KEY CHECK(provider IN ('openai','gemini','claude')),
 model TEXT NOT NULL,
 api_key_encrypted TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'untested' CHECK(status IN ('untested','connected','error')),
 checked_at TIMESTAMPTZ,
 last_error TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS email_ai_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 active_provider TEXT REFERENCES email_ai_providers(provider),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Saved credentials and transient provider availability are different states.
ALTER TABLE email_ai_providers ADD COLUMN IF NOT EXISTS last_error_kind TEXT;
ALTER TABLE email_ai_providers ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_ai_providers ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ;
ALTER TABLE email_ai_providers ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE email_ai_providers ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS gmail_connections (
 mailbox_id UUID PRIMARY KEY REFERENCES email_automation_mailboxes(id),
 connected_address TEXT,
 refresh_token_encrypted TEXT,
 status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected','disconnected','reauth_required','error')),
 is_paused BOOLEAN NOT NULL DEFAULT TRUE,
 start_at TIMESTAMPTZ,
 scan_after TIMESTAMPTZ,
 scan_until TIMESTAMPTZ,
 page_token TEXT,
 connected_at TIMESTAMPTZ,
 verified_at TIMESTAMPTZ,
 last_sync_at TIMESTAMPTZ,
 last_error TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gmail_delivery_queue (
 mailbox_id UUID NOT NULL REFERENCES email_automation_mailboxes(id),
 message_id VARCHAR(512) NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','needs_review','failed','skipped')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 ticket_id UUID REFERENCES tickets(id),
 note TEXT,
 attachment_warnings JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(mailbox_id,message_id)
);
ALTER TABLE gmail_connections ADD COLUMN IF NOT EXISTS history_id TEXT;
ALTER TABLE gmail_connections ADD COLUMN IF NOT EXISTS history_page_token TEXT;
CREATE INDEX IF NOT EXISTS gmail_queue_pending ON gmail_delivery_queue(mailbox_id,next_attempt_at) WHERE status='pending';
ALTER TABLE gmail_delivery_queue DROP CONSTRAINT IF EXISTS gmail_delivery_queue_status_check;
ALTER TABLE gmail_delivery_queue ADD CONSTRAINT gmail_delivery_queue_status_check CHECK(status IN ('pending','processing','processed','needs_review','failed','skipped'));
ALTER TABLE gmail_delivery_queue ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE gmail_delivery_queue ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE gmail_delivery_queue ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE gmail_delivery_queue ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE gmail_delivery_queue ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE gmail_connections ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS gmail_queue_thread_order ON gmail_delivery_queue(mailbox_id,thread_id,received_at,created_at);
CREATE INDEX IF NOT EXISTS gmail_queue_status_page ON gmail_delivery_queue(status,created_at,message_id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'PORTAL';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester_email VARCHAR(254);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS external_case_reference TEXT;
ALTER TABLE tickets ALTER COLUMN customer_name DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN priority DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN impact DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN urgency DROP NOT NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS details_incomplete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS missing_details JSONB NOT NULL DEFAULT '[]';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS routing_needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS routing_review_reason TEXT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='tickets'::regclass AND conname='tickets_portal_required_values') THEN
  ALTER TABLE tickets ADD CONSTRAINT tickets_portal_required_values CHECK(source='EMAIL' OR (customer_name IS NOT NULL AND priority IS NOT NULL AND impact IS NOT NULL AND urgency IS NOT NULL));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION servit_email_missing_details(ticket tickets) RETURNS JSONB
LANGUAGE sql STABLE AS $$
 WITH required AS (
  SELECT field_key,label,field_order FROM ticket_fields WHERE is_active AND is_required
  UNION ALL
  SELECT c.key,c.label,c.position FROM (VALUES
   ('customer_name','Customer',1),('module_text','Module',2),('category_id','Category',3),
   ('priority','Priority',4),('impact','Impact',5),('urgency','Urgency',6),('assignment_group','Department',7)
  ) c(key,label,position) WHERE NOT EXISTS(SELECT 1 FROM ticket_fields f WHERE f.field_key=c.key AND f.is_active AND f.is_required)
  UNION ALL
  SELECT 'subcategory_id','Subcategory',8 WHERE ticket.category_id IS NOT NULL AND EXISTS(SELECT 1 FROM subcategories s WHERE s.category_id=ticket.category_id AND s.is_active) AND NOT EXISTS(SELECT 1 FROM ticket_fields WHERE field_key='subcategory_id' AND is_active AND is_required)
 ), evaluated AS (
  SELECT field_key,label,field_order,CASE
   WHEN field_key='assignment_group' THEN to_jsonb(ticket.assignment_group_id)
   WHEN field_key='module_text' THEN to_jsonb(COALESCE(NULLIF(btrim(ticket.module_text),''),ticket.module_id::text))
   WHEN to_jsonb(ticket)?field_key THEN to_jsonb(ticket)->field_key
   ELSE ticket.custom_data->field_key END AS value FROM required
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object('key',field_key,'label',label) ORDER BY field_order,field_key),'[]'::jsonb)
 FROM evaluated WHERE value IS NULL OR value='null'::jsonb OR btrim(value#>>'{}')=''
$$;
CREATE OR REPLACE FUNCTION servit_email_completeness() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source='EMAIL' THEN
  NEW.missing_details:=servit_email_missing_details(NEW);
  NEW.details_incomplete:=jsonb_array_length(NEW.missing_details)>0;
  NEW.routing_needs_review:=NEW.assignment_group_id IS NULL;
  IF NOT NEW.routing_needs_review THEN NEW.routing_review_reason:=NULL; END IF;
 ELSE
  NEW.missing_details:='[]';NEW.details_incomplete:=FALSE;NEW.routing_needs_review:=FALSE;NEW.routing_review_reason:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_ticket_completeness ON tickets;
CREATE TRIGGER email_ticket_completeness BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION servit_email_completeness();
-- Add metadata only. Preserve all existing field values, timestamps, comments,
-- attachment bytes, message/thread mappings and per-user read receipts.
UPDATE tickets t SET missing_details=servit_email_missing_details(t),details_incomplete=jsonb_array_length(servit_email_missing_details(t))>0,routing_needs_review=t.assignment_group_id IS NULL
WHERE t.source='EMAIL' AND (t.missing_details IS DISTINCT FROM servit_email_missing_details(t) OR t.details_incomplete IS DISTINCT FROM (jsonb_array_length(servit_email_missing_details(t))>0) OR t.routing_needs_review IS DISTINCT FROM (t.assignment_group_id IS NULL));

-- One-time repair for email reopenings processed before the shared inbox event
-- was introduced. Preserve read state for people who already opened the reply.
WITH migration AS (
 INSERT INTO access_migrations(key) VALUES('email-reopening-inbox-event-v1') ON CONFLICT DO NOTHING RETURNING key
), last_reopen AS (
 SELECT DISTINCT ON(a.ticket_id) a.ticket_id,a.created_at
 FROM ticket_audit_logs a JOIN users u ON u.id=a.user_id
 WHERE a.action='REOPENED' AND u.is_system ORDER BY a.ticket_id,a.created_at DESC
), bumped AS (
 UPDATE tickets t SET inbox_revision=t.inbox_revision+1,inbox_event='EMAIL_REOPENED',inbox_event_at=r.created_at
 FROM last_reopen r WHERE t.id=r.ticket_id AND t.status='IN_PROGRESS' AND t.deleted_at IS NULL
 AND EXISTS(SELECT 1 FROM migration)
 RETURNING t.id,t.inbox_revision,t.inbox_event_at
)
UPDATE ticket_inbox_receipts opened SET seen_revision=b.inbox_revision
FROM bumped b WHERE opened.ticket_id=b.id AND opened.opened_at>=b.inbox_event_at;
-- Email intake always uses the configured Incident counter, never legacy PSH.
-- Fill only the missing system prefix; preserve existing customized settings.
UPDATE ticket_types SET prefix='INC' WHERE name='Incident' AND prefix IS NULL;

-- Operational AI request history. No prompts, email bodies, keys or model output.
CREATE TABLE IF NOT EXISTS email_ai_logs (
 id UUID PRIMARY KEY,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('email_analysis','connection_check','recovery_check')),
 outcome TEXT NOT NULL CHECK(outcome IN ('success','failed','deferred','skipped')),
 mailbox_id UUID,
 message_id TEXT,
 thread_id TEXT,
 started_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 duration_ms INTEGER NOT NULL DEFAULT 0,
 failure_kind TEXT,
 error_code TEXT,
 error_message TEXT,
 attempts JSONB NOT NULL DEFAULT '[]',
 result_summary JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS email_ai_logs_date_idx ON email_ai_logs(created_at DESC,id);
CREATE INDEX IF NOT EXISTS email_ai_logs_message_idx ON email_ai_logs(mailbox_id,message_id);
ALTER TABLE audit_retention_settings ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE audit_retention_settings ADD COLUMN IF NOT EXISTS ai_retention_days INTEGER NOT NULL DEFAULT 30 CHECK(ai_retention_days BETWEEN 1 AND 3650);

-- Compact deduplication receipts survive removal of completed queue history.
-- No email body, attachments, error text or ticket payload is copied here.
CREATE TABLE IF NOT EXISTS gmail_completed_receipts (
 mailbox_id UUID NOT NULL REFERENCES email_automation_mailboxes(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('processed','skipped')),
 completed_at TIMESTAMPTZ NOT NULL,
 duration_ms INTEGER,
 PRIMARY KEY(mailbox_id,message_id)
);
CREATE INDEX IF NOT EXISTS gmail_completed_receipts_time_idx ON gmail_completed_receipts(completed_at);

-- END EMAIL AUTOMATION
COMMIT;
