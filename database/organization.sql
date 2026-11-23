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
