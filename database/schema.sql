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
  role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
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

COMMIT;
