const { employee, catalog } = require('./catalog');
module.exports = async function initAccess(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS access_roles (
    key VARCHAR(64) PRIMARY KEY, name VARCHAR(150) NOT NULL,
    responsibility TEXT NOT NULL DEFAULT '', permissions JSONB NOT NULL DEFAULT '{}',
    assignable_roles JSONB NOT NULL DEFAULT '[]', is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE, version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE UNIQUE INDEX IF NOT EXISTS access_roles_name_unique ON access_roles(LOWER(name));
  CREATE TABLE IF NOT EXISTS user_managed_groups (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES assignment_groups(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id,group_id)
  ); CREATE TABLE IF NOT EXISTS access_role_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), role_key VARCHAR(64) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL, before_value JSONB, after_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE TABLE IF NOT EXISTS access_migrations (key TEXT PRIMARY KEY);
  CREATE INDEX IF NOT EXISTS idx_managed_group ON user_managed_groups(group_id);`);
  await client.query(`INSERT INTO access_roles(key,name,responsibility,permissions,is_system) VALUES
    ('admin','Admin','Full application administration',$1,true),
    ('employee','User / Employee','Create and work on permitted tickets',$2,true)
    ON CONFLICT(key) DO NOTHING`, [JSON.stringify(Object.fromEntries(catalog.map(p => [p.key,'all']))), JSON.stringify(employee)]);
  await client.query("UPDATE access_roles SET permissions=$1 WHERE key='admin'",[JSON.stringify(Object.fromEntries(catalog.map(p=>[p.key,'all'])))]);
  // Drop only the legacy two-role check. All other user constraints are retained.
  const checks = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%'`);
  for (const { conname } of checks.rows) await client.query('ALTER TABLE users DROP CONSTRAINT "' + conname.replace(/"/g,'""') + '"');
  await client.query('ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(64)');
  await client.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='users_access_role_fk') THEN ALTER TABLE users ADD CONSTRAINT users_access_role_fk FOREIGN KEY(role) REFERENCES access_roles(key); END IF; END $$`);
  const migration = await client.query("INSERT INTO access_migrations VALUES('initial-managed-groups') ON CONFLICT DO NOTHING RETURNING key");
  if (migration.rowCount) await client.query('INSERT INTO user_managed_groups SELECT user_id,group_id FROM user_groups ON CONFLICT DO NOTHING');
};
