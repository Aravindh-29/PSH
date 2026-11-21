// Applied once on upgrade. Subsequent administrator customization is preserved.
const managerUpgradeSQL = `CREATE TABLE IF NOT EXISTS access_migrations(key TEXT PRIMARY KEY);
WITH migration AS (
  INSERT INTO access_migrations VALUES('manager-team-users-v1') ON CONFLICT DO NOTHING RETURNING key
) UPDATE access_roles SET permissions=permissions || '{"users.team_view":"all","users.team_create":"all"}'::jsonb,
    version=version+1,updated_at=NOW()
  WHERE (key='manager' OR LOWER(name)='manager')
    AND NOT permissions @> '{"users.team_view":"all","users.team_create":"all"}'::jsonb
    AND EXISTS(SELECT 1 FROM migration);`;

module.exports = { managerUpgradeSQL };
