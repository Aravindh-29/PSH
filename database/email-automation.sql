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
