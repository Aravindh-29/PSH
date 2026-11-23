const { catalog, employee } = require('./catalog');
const manager = require('./defaultRoles')[0];
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const adminPermissions = Object.fromEntries(catalog.filter(p=>!p.key.startsWith('roles.')).map(p=>[p.key,'all']));

// Keep existing Manager IDs, user IDs, assignments and histories. Retired role
// definitions and any necessary account mapping are archived, never deleted.
const fixedRolesSQL = `
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
   VALUES('manager','Manager',${quote(manager.responsibility)},${quote(JSON.stringify(manager.permissions))}::jsonb,TRUE);
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
  ('admin'::varchar,'Admin','Full application administration',${quote(JSON.stringify(adminPermissions))}::jsonb,'admin'),
  ('employee'::varchar,'User','Work on permitted tickets within department membership',${quote(JSON.stringify(employee))}::jsonb,'user'),
  (manager_key,'Manager',${quote(manager.responsibility)},${quote(JSON.stringify(manager.permissions))}::jsonb,'manager')
 ) v(key,name,responsibility,permissions,kind)
 WHERE r.key=v.key AND (r.name,r.responsibility,r.permissions,r.role_kind,r.is_active,r.is_system,r.is_default,r.assignable_roles)
 IS DISTINCT FROM (v.name,v.responsibility,v.permissions,v.kind,TRUE,TRUE,FALSE,'[]'::jsonb);
END $fixed_roles$;
CREATE UNIQUE INDEX IF NOT EXISTS fixed_access_role_kind ON access_roles(role_kind) WHERE role_kind IS NOT NULL;
INSERT INTO access_migrations VALUES('three-fixed-roles-v1') ON CONFLICT DO NOTHING;
`;

module.exports = { fixedRolesSQL, adminPermissions };
