const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const literal = value => { if (!uuid(value)) throw new Error('Invalid access identity'); return `'${value}'::uuid`; };
function scopePredicate(access, permission, alias = 't') {
  if (access.admin) return 'TRUE';
  const scope = access.permissions[permission];
  if (!scope) return 'FALSE';
  if (scope === 'all') return 'TRUE';
  const own = `(${alias}.created_by=${literal(access.userId)} OR ${alias}.ticket_owner=${literal(access.userId)} OR ${alias}.assigned_to=${literal(access.userId)})`;
  const groups = `(${alias}.assignment_group_id IN (SELECT group_id FROM user_managed_groups WHERE user_id=${literal(access.userId)}) ${access.role==='employee'?`OR ${alias}.assignment_group_id IN (SELECT group_id FROM user_groups WHERE user_id=${literal(access.userId)})`:''})`;
  if (scope === 'own') return own;
  if (scope === 'groups') return groups;
  if (scope === 'related') return `(${own} OR ${groups} OR ${alias}.assignment_group_id IN (SELECT group_id FROM user_groups WHERE user_id=${literal(access.userId)}))`;
  return 'FALSE';
}
function scopedSQL(sql) {
  const req = context.getStore();
  if (!req?.access || req.access.admin || typeof sql !== 'string' || !/^\s*(SELECT|WITH)\b/i.test(sql)) return sql;
  if (!/\b(FROM|JOIN)\s+(tickets|ticket_sla_instances|ticket_audit_logs)\b/i.test(sql)) return sql;
  let predicate = scopePredicate(req.access, req.access.primary || 'tickets.view');
  if (req.access.primary !== 'tickets.group_view') predicate = `(${predicate}) AND (${scopePredicate(req.access,'tickets.view')})`;
  const definitions = `__access_tickets AS (SELECT t.* FROM public.tickets t WHERE t.deleted_at IS NULL AND (${predicate})), __access_sla AS (SELECT s.* FROM public.ticket_sla_instances s WHERE s.ticket_id IN (SELECT id FROM __access_tickets)), __access_audit AS (SELECT a.* FROM public.ticket_audit_logs a WHERE a.ticket_id IN (SELECT id FROM __access_tickets))`;
  const tables = { tickets: '__access_tickets', ticket_sla_instances: '__access_sla', ticket_audit_logs: '__access_audit' };
  const replaced = sql.replace(/\b(FROM|JOIN)\s+(tickets|ticket_sla_instances|ticket_audit_logs)\b/gi, (_, prefix, table) => `${prefix} ${tables[table.toLowerCase()]}`);
  return /^\s*WITH\b/i.test(replaced) ? replaced.replace(/\bWITH\s+(RECURSIVE\s+)?/i, (_, recursive = '') => `WITH ${recursive}${definitions}, `) : `WITH ${definitions} ${replaced}`;
}
module.exports = { context, scopePredicate, scopedSQL, uuid };
