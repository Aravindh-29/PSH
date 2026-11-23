ALTER TABLE tickets ADD COLUMN IF NOT EXISTS inbox_revision BIGINT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS ticket_inbox_receipts (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 seen_revision BIGINT NOT NULL CHECK(seen_revision>=1),
 opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,ticket_id)
);
CREATE OR REPLACE FUNCTION servit_ticket_inbox_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.assigned_to,NEW.assignment_group_id,NEW.subgroup_id) IS DISTINCT FROM
    (OLD.assigned_to,OLD.assignment_group_id,OLD.subgroup_id) THEN
  NEW.inbox_revision:=OLD.inbox_revision+1;
 ELSE
  NEW.inbox_revision:=OLD.inbox_revision;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ticket_inbox_revision ON tickets;
CREATE TRIGGER ticket_inbox_revision BEFORE UPDATE OF assigned_to,assignment_group_id,subgroup_id
 ON tickets FOR EACH ROW EXECUTE FUNCTION servit_ticket_inbox_revision();
CREATE INDEX IF NOT EXISTS tickets_inbox_assignee ON tickets(assigned_to,updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tickets_inbox_unassigned ON tickets(assignment_group_id,subgroup_id,updated_at DESC)
 WHERE assigned_to IS NULL AND deleted_at IS NULL;
