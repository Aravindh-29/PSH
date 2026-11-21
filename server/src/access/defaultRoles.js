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
    for (const dependency of item.requires || []) add(dependency);
  }
  for (const key of [...personal, ...keys]) add(key);
  return selected;
}

module.exports = [
  {
    key: 'support_agent', name: 'Support Agent',
    responsibility: 'Work on own or assigned tickets, resolve issues and add work notes. View member-team tickets; no user administration or ticket deletion.',
    permissions: permissions([...reading, ...working, 'tickets.create'], 'own', { 'tickets.view': 'related', 'tickets.group_view': 'related' }),
  },
  {
    key: 'manager', name: 'Manager',
    responsibility: 'Supervise tickets, assignments, reports and service performance for Managed Groups. Create Employee users in Managed Groups and assign team tickets. Select Managed Groups when assigning this role; no global user administration.',
    permissions: permissions([...reading, ...working, ...reporting, 'tickets.create', 'tickets.close', 'tickets.assign', 'users.team_view', 'users.team_create'], 'groups', { 'tickets.create': 'own' }),
  },
  {
    key: 'read_only_viewer', name: 'Read-only Viewer',
    responsibility: 'Read tickets and reports for Managed Groups without changing records. Select Managed Groups when assigning this role. Attachment downloads are permitted.',
    permissions: permissions([...reading, 'reports.view'], 'groups'),
  },
  {
    key: 'knowledge_author', name: 'Knowledge Author',
    responsibility: 'Create and edit shared knowledge drafts. Publishing requires a Knowledge Manager or Admin; article deletion requires Admin.',
    permissions: permissions(['kb.view', 'kb.drafts', 'kb.create', 'kb.edit']),
  },
  {
    key: 'knowledge_manager', name: 'Knowledge Manager',
    responsibility: 'Create, edit and publish knowledge articles and review shared drafts. Article deletion and application administration are excluded.',
    permissions: permissions(['kb.view', 'kb.drafts', 'kb.create', 'kb.edit', 'kb.publish']),
  },
  {
    key: 'sla_qa_analyst', name: 'SLA / QA Analyst',
    responsibility: 'Read tickets, analyze SLA and QA performance and export reports for Managed Groups. Select Managed Groups when assigning this role; no ticket or SLA configuration changes.',
    permissions: permissions([...reading, ...reporting], 'groups'),
  },
  {
    key: 'configuration_manager', name: 'Configuration Manager',
    responsibility: 'Maintain ticket fields, categories, ticket types, templates and SLA definitions. No user, role, branding, email, SSO or ticket-record administration; destructive resets and deletion excluded.',
    permissions: permissions([
      'fields.view', 'fields.create', 'fields.edit', 'fields.required', 'fields.active', 'fields.reorder',
      'categories.view', 'categories.create', 'categories.edit', 'categories.status',
      'subcategories.create', 'subcategories.edit', 'subcategories.status',
      'types.view', 'types.create', 'types.edit', 'types.status',
      'templates.view', 'templates.create', 'templates.edit', 'templates.status',
      'sla_config.view', 'sla_config.create', 'sla_config.edit', 'sla_config.status',
    ]),
  },
].map(role => ({ ...role, assignable_roles: [] }));
