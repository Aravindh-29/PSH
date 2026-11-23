// A role must explicitly opt into oversight. Membership is never management.
const MANAGED_ACCESS = 'departments.managed_access';
const isManager = role => role?.role_kind === 'manager' || role?.roleKind === 'manager' || role?.key === 'manager' || role?.role === 'manager';
const canManage = role => role?.key === 'admin' || role?.role === 'admin' || role?.admin === true || isManager(role);

// Upgrade existing oversight roles once; preserve later administrator choices.
// Old Employee managed grants remain stored but are inert until explicitly reviewed.
const managedAccessUpgradeSQL = `
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
 WHERE key='employee' AND permissions->>'tickets.group_view'='groups' AND EXISTS(SELECT 1 FROM migration);`;

module.exports = { MANAGED_ACCESS, isManager, canManage, managedAccessUpgradeSQL };
