const { catalog } = require('./catalog');

// Explicit allowlists: adding a new permission never silently grants it to a default role.
const personal = ['profile.view', 'profile.edit', 'profile.password', 'notifications.view', 'notifications.read'];
const reading = ['dashboard.view', 'query.view', 'tickets.view', 'tickets.group_view', 'tickets.history', 'comments.view', 'attachments.preview', 'attachments.download', 'attachments.zip', 'sla.view', 'kb.view'];
const working = ['tickets.edit', 'tickets.priority', 'tickets.impact', 'tickets.urgency', 'tickets.category', 'tickets.classification', 'tickets.template', 'tickets.status', 'tickets.resolve', 'tickets.reopen', 'comments.add', 'comments.work_note', 'attachments.upload'];
const reporting = ['reports.view', 'reports.export', 'qa.view', 'qa.drill', 'qa.export'];

function permissions(keys, scope = 'own', overrides = {}) {
  const selected = {};
  function add(key) {
    if (selected[key]) return;
    const item = catalog.find(p => p.key === key);
    if (!item) throw new Error('Unknown default role permission: ' + key);
    selected[key] = item.scoped ? overrides[key] || scope : 'all';
    if (item.scoped && selected[key] === 'groups') add('departments.managed_access');
    for (const dependency of item.requires || []) add(dependency);
  }
  for (const key of [...personal, ...keys]) add(key);
  return selected;
}

module.exports = [
  {
    key: 'manager', name: 'Manager',
    responsibility: 'Manage assigned departments and sub departments, supervise team tickets, assign work and add existing unassigned users. Only Admin creates user accounts and grants department access.',
    permissions: permissions([...reading, ...working, ...reporting, 'tickets.create', 'tickets.close', 'tickets.assign', 'users.tickets', 'users.team_view', 'users.team_add', 'departments.view', 'departments.subgroups', 'departments.members', 'dashboard.team'], 'groups', { 'tickets.create': 'own' }),
  },
].map(role => ({ ...role, assignable_roles: [] }));
