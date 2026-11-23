const catalog = require('./catalog.json');
const keys = new Set(catalog.map(p => p.key));
const employee = {};
for (const p of catalog) {
  if (['dashboard.view','query.view','reports.view','reports.export','sla.view','profile.view','profile.edit','profile.password','notifications.view','notifications.read','kb.view'].includes(p.key) || p.key.startsWith('comments.') || p.key.startsWith('attachments.') || (p.group === 'Tickets' && p.key !== 'tickets.owner')) employee[p.key] = p.scoped ? 'own' : 'all';
}
employee['tickets.view'] = 'related'; employee['tickets.group_view'] = 'related';
// Department members share ticket work, while deletion and ownership stay restricted.
for (const key of ['edit','assign','priority','impact','urgency','category','type','classification','template','status','resolve','close','reopen','cancel','history']) employee['tickets.'+key]='related';
for (const p of catalog) if (p.key.startsWith('comments.')) employee[p.key]=p.scoped?'related':'all';
for (const key of ['upload','download','preview','zip']) employee['attachments.'+key]='related';
employee['sla.view']='related';
employee['users.directory_view']='all';
module.exports = { catalog, keys, employee };
