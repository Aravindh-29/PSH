const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const { canManage } = require('./managedAccess');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const literal = value => { if (!uuid(value)) throw new Error('Invalid access identity'); return `'${value}'::uuid`; };
function scopePredicate(access, permission, alias = 't') {
  if (access.admin) return 'TRUE';
  const scope = access.permissions[permission];
  if (!scope) return 'FALSE';
  if (scope === 'all') return 'TRUE';
  const user=literal(access.userId);
  const own = `(${alias}.created_by=${user} OR ${alias}.ticket_owner=${user} OR ${alias}.assigned_to=${user})`;
  const managed = canManage(access) ? `EXISTS(SELECT 1 FROM user_managed_groups mg WHERE mg.user_id=${user} AND (mg.group_id=${alias}.assignment_group_id OR mg.group_id=${alias}.subgroup_id))` : 'FALSE';
  const member = `EXISTS(SELECT 1 FROM user_groups ug WHERE ug.user_id=${user} AND (ug.group_id=${alias}.assignment_group_id OR ug.group_id=${alias}.subgroup_id))`;
  // An assignment remains actionable even when a user has no oversight grants.
  // Creator/owner relationships alone never expose an unrelated department.
  const assigned = `${alias}.assigned_to=${user}`;
  const personal = `(${assigned} OR (${own} AND (${managed} OR ${member} OR ${alias}.assignment_group_id IS NULL)))`;
  const visible = `(${managed} OR ${member} OR ${personal})`;
  if (scope === 'own') return personal;
  if (scope === 'groups') return permission === 'tickets.group_view' ? managed : `(${managed} OR ${personal})`;
  if (scope === 'related') return visible;
  return 'FALSE';
}
function recordAllowed(access, key, ticket) {
  if (access.admin) return true;
  const scope=access.permissions?.[key];
  if (!scope || !ticket) return false;
  if (scope==='all') return true;
  const ids=[ticket.assignment_group_id,ticket.subgroup_id].filter(Boolean);
  const managed=canManage(access)&&ids.some(id=>(access.managedGroups||[]).includes(id));
  const member=ids.some(id=>(access.memberGroups||[]).includes(id));
  const own=[ticket.created_by,ticket.assigned_to,ticket.ticket_owner].includes(access.userId);
  const personal=ticket.assigned_to===access.userId || own&&(managed||member||!ticket.assignment_group_id);
  return scope==='own'?personal:scope==='groups'?(key==='tickets.group_view'?managed:managed||personal):scope==='related'?managed||member||personal:false;
}
function scopedSQL(sql) {
  const req = context.getStore();
  if (!req?.access || (req.access.admin&&req.access.primary!=='dashboard.team'&&!req.query?.departmentId&&!req.query?.subgroupId) || typeof sql !== 'string' || !/^\s*(SELECT|WITH)\b/i.test(sql)) return sql;
  if (!/\b(FROM|JOIN)\s+(tickets|ticket_sla_instances|ticket_audit_logs)\b/i.test(sql)) return sql;
  let predicate = scopePredicate(req.access, req.access.primary || 'tickets.view');
  if (req.access.primary !== 'tickets.group_view') predicate = `(${predicate}) AND (${scopePredicate(req.access,'tickets.view')})`;
  if(req.access.primary==='dashboard.team'||req.access.teamUserTickets)predicate=`(${predicate}) AND ${canManage(req.access)?`EXISTS(SELECT 1 FROM user_managed_groups mg WHERE mg.user_id=${literal(req.access.userId)} AND (mg.group_id=t.assignment_group_id OR mg.group_id=t.subgroup_id))`:'FALSE'}`;
  if(req.query?.departmentId){if(!uuid(req.query.departmentId))throw Object.assign(new Error('Invalid department filter.'),{status:400});predicate=`(${predicate}) AND t.assignment_group_id=${literal(req.query.departmentId)}`;}
  if(req.query?.subgroupId){if(!uuid(req.query.subgroupId))throw Object.assign(new Error('Invalid sub department filter.'),{status:400});predicate=`(${predicate}) AND t.subgroup_id=${literal(req.query.subgroupId)}`;}
  const definitions = `__access_tickets AS (SELECT t.* FROM tickets t WHERE t.deleted_at IS NULL AND (${predicate})), __access_sla AS (SELECT s.* FROM ticket_sla_instances s WHERE s.ticket_id IN (SELECT id FROM __access_tickets)), __access_audit AS (SELECT a.* FROM ticket_audit_logs a WHERE a.ticket_id IN (SELECT id FROM __access_tickets))`;
  const tables = { tickets: '__access_tickets', ticket_sla_instances: '__access_sla', ticket_audit_logs: '__access_audit' };
  const replaced = sql.replace(/\b(FROM|JOIN)\s+(tickets|ticket_sla_instances|ticket_audit_logs)\b/gi, (_, prefix, table) => `${prefix} ${tables[table.toLowerCase()]}`);
  return /^\s*WITH\b/i.test(replaced) ? replaced.replace(/\bWITH\s+(RECURSIVE\s+)?/i, (_, recursive = '') => `WITH ${recursive}${definitions}, `) : `WITH ${definitions} ${replaced}`;
}
module.exports = { context, scopePredicate, scopedSQL, uuid, recordAllowed };
