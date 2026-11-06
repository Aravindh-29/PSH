const catalog = require('./catalog.json');
const keys = new Set(catalog.map(p => p.key));
const employee = {};
for (const p of catalog) {
  if (['dashboard.view','query.view','reports.view','reports.export','sla.view','profile.view','profile.edit','profile.password','notifications.view','notifications.read','kb.view'].includes(p.key) || p.key.startsWith('comments.') || p.key.startsWith('attachments.') || (p.group === 'Tickets' && p.key !== 'tickets.owner')) employee[p.key] = p.scoped ? 'own' : 'all';
}
employee['tickets.view'] = 'related'; employee['tickets.group_view'] = 'groups';
module.exports = { catalog, keys, employee };
