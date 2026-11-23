const { uuid, scopePredicate } = require('./context');
const {eligibleAssigneeSQL,assignmentScopeSQL}=require('./ticketAssignment');
const forbidden = () => Object.assign(new Error("You don't have permission to perform this action."), { status: 403, code: 'PERMISSION_DENIED' });
const can = (access, key) => !!(access.admin || access.permissions[key]);
function need(req, key) { if (!can(req.access,key)) throw forbidden(); }
function routePermission(req) {
  const area = req.baseUrl.split('/').pop(), p = req.path, method = req.method;
  const read = method === 'GET';
  if (area === 'auth') return null;
  if (area === 'roles') return read ? (p === '/assignable' ? null : p.endsWith('/history') ? 'roles.history' : 'roles.view') : method === 'POST' ? 'roles.create' : method === 'DELETE' ? 'roles.delete' : null;
  if (area === 'dashboard') return p.startsWith('/query') ? 'query.view' : req.query.team==='true'?'dashboard.team':'dashboard.view';
  if (area === 'departments') return null;
  if (area === 'tickets') {
    if (method==='POST'&&p.endsWith('/opened')) return 'tickets.view';
    if (p.endsWith('/attachments/zip')) return 'attachments.zip';
    if (p.endsWith('/attachments')) return 'attachments.upload';
    if (p.endsWith('/comments')) return req.body.type === 'WORK_NOTE' ? 'comments.work_note' : 'comments.add';
    if (p === '/next-number') return 'tickets.create';
    if (read) return req.query.groupView === 'true' ? 'tickets.group_view' : 'tickets.view';
    return method === 'POST' ? 'tickets.create' : method === 'DELETE' ? 'tickets.delete' : null;
  }
  if (area === 'attachments') return method === 'DELETE' ? 'attachments.delete' : req.query.preview === 'true' ? 'attachments.preview' : 'attachments.download';
  if (area === 'users') {
    if (p==='/directory') return 'users.directory_view';
    if (p === '/team') return read ? 'users.team_view' : 'users.team_add';
    if(p.endsWith('/activity'))return 'users.activity';
    if (p === '/me') return read ? 'profile.view' : req.body.newPassword ? 'profile.password' : 'profile.edit';
    if (p === '/check-availability') return 'users.create';
    if (p === '/bulk-check') return 'users.bulk_validate';
    if (p === '/bulk') return 'users.bulk_create';
    if (p.endsWith('/reset-password')) return 'users.password';
    if (p.endsWith('/reset-mfa')) return 'users.mfa_reset';
    if (p.endsWith('/tickets')) return 'users.delete_tickets';
    if (read) return req.query.scope === 'with_tickets' || p!=='/' && !can(req.access,'users.view') && can(req.access,'users.tickets') ? 'users.tickets' : 'users.view';
    return method === 'POST' ? 'users.create' : method === 'DELETE' ? 'users.delete' : 'users.edit';
  }
  if (area === 'groups') {
    if (read && (['/mine','/with-members'].includes(p) || req.query.picker==='true')) return null;
    if (/members/.test(p)) return 'groups.members';
    return read ? 'groups.view' : method === 'POST' ? 'groups.create' : method === 'DELETE' ? 'groups.delete' : 'groups.edit';
  }
  if (area === 'kb') return read ? p === '/admin/all' ? 'kb.drafts' : 'kb.view' : method === 'POST' ? 'kb.create' : method === 'DELETE' ? 'kb.delete' : 'kb.edit';
  if (area === 'reports') return p === '/global' ? 'reports.global' : 'reports.view';
  if (area === 'sla') {
    if (p.startsWith('/ticket/')) return 'sla.view';
    if (p === '/qa' || p === '/breached') return 'qa.view';
    if (p === '/drill') return 'qa.drill';
    if (p === '/settings') return read ? 'sla_config.view' : 'sla_config.toggle';
    if (p === '/apply-defaults') return 'sla_config.defaults';
    return read ? null : method === 'POST' ? 'sla_config.create' : method === 'DELETE' ? 'sla_config.status' : 'sla_config.edit';
  }
  if (area === 'audit') return /retention/.test(p) ? read ? 'audit.view' : 'audit.retention' : 'audit.view';
  if (area === 'admin-audit') return 'audit.admin';
  if (area === 'notifications') return read ? 'notifications.view' : 'notifications.read';
  if (area === 'subcategories') return read ? null : method === 'POST' ? 'subcategories.create' : method === 'DELETE' ? 'subcategories.delete' : 'subcategories.edit';
  if (area === 'config') {
    if(p==='/admin/mcp'||p.startsWith('/admin/mcp/')){if(!req.access.admin)throw forbidden();return null;}
    if(method==='PUT' && p.startsWith('/admin/')) return null;
    if (!p.startsWith('/admin/')) return null; // Ticket form lookups; not management endpoints.
    const name = p.split('/')[2], group = { 'ticket-types':'types', 'reset-fields':'fields', templates:'templates' }[name] || name;
    if (name === 'reset-fields') return 'fields.reset';
    if (p.endsWith('/test')) return `${group}.test`;
    if(group==='email')return read?(p==='/admin/email/deliveries'?'email.history':'email.view'):p.startsWith('/admin/email/retry/')?'email.retry':null;
    if (['sso','email','branding'].includes(group)) return `${group}.${read ? 'view' : method === 'DELETE' ? 'clear' : 'edit'}`;
    return `${group}.${read ? 'view' : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'edit'}`;
  }
  return null;
}
const columns = { customerName:'customer_name', moduleText:'module_text', categoryId:'category_id', subcategoryId:'subcategory_id', shortDescription:'short_description', description:'description', priority:'priority', impact:'impact', urgency:'urgency', status:'status', typeId:'type_id', classification:'classification', assignedTo:'assigned_to', ticketOwner:'ticket_owner', assignmentGroup:'assignment_group', assignmentGroupId:'assignment_group_id', subgroupId:'subgroup_id', customData:'custom_data', templateId:'template_id', templateValues:'template_values' };
const actionFor = { categoryId:'category', subcategoryId:'category', priority:'priority', impact:'impact', urgency:'urgency', status:'status', typeId:'type', classification:'classification', assignedTo:'assign', assignmentGroup:'assign', assignmentGroupId:'assign', subgroupId:'assign', ticketOwner:'owner', templateId:'template', templateValues:'template' };
function changed(a,b) { return JSON.stringify(a ?? '') !== JSON.stringify(b ?? ''); }
async function authorize(req, pool) {
  const access = req.access, area = req.baseUrl.split('/').pop(), p = req.path;
  const permission = routePermission(req);
  if (permission) need(req,permission);
  access.primary = permission==='dashboard.team'?'dashboard.team':permission?.startsWith('dashboard.') ? 'dashboard.view' : permission?.startsWith('reports.') ? 'reports.view' : permission?.startsWith('qa.') ? 'qa.view' : permission === 'audit.view' ? 'audit.view' : permission?.startsWith('tickets.') || permission?.startsWith('comments.') || permission?.startsWith('attachments.') || permission === 'sla.view' ? permission : 'tickets.view';
  // User-ticket directories must be constrained even when a role can read all tickets.
  if(area==='users'&&permission==='users.tickets'&&!access.admin)access.teamUserTickets=true;
  if(area==='tickets'&&req.method==='GET'&&req.query.userTickets){
    need(req,'users.tickets');
    await require('./managedUsers').requireManagedUser(req,pool,req.query.userTickets);
    if(!access.admin)access.teamUserTickets=true;
  }
  if(area==='roles' && req.method==='PUT' && !['roles.edit','roles.permissions','roles.status'].some(k=>can(access,k))) throw forbidden();
  if (area === 'roles' && p === '/assignable' && !['users.view','users.create','users.edit','users.assign_role','users.bulk_validate','users.bulk_create'].some(k=>can(access,k))) throw forbidden();
  if(area==='dashboard' && req.query.personal!=='true' && req.access.permissions['dashboard.view']==='all') need(req,'dashboard.global');
  if(area==='reports' && req.query.export==='true') need(req,'reports.export');
  if(area==='sla' && req.query.export==='true') need(req,'qa.export');
  if (area === 'config' && !p.startsWith('/admin/') && p !== '/branding' && !['tickets.view','tickets.create','tickets.edit','templates.view','fields.view','categories.view','types.view','users.view'].some(k=>can(access,k))) throw forbidden();
  if(area==='config'&&p==='/admin/email'&&req.method==='POST'&&!can(access,'email.edit')&&!can(access,'email.toggle'))throw forbidden();
  let ticketId;
  if (area === 'tickets' && p !== '/' && p !== '/next-number') ticketId = p.split('/')[1];
  if (area === 'sla' && p.startsWith('/ticket/')) ticketId = p.split('/')[2];
  if (area === 'audit' && p.startsWith('/ticket/')) {
    const row = await pool.rawQuery('SELECT id FROM tickets WHERE ticket_number=$1 AND deleted_at IS NULL',[p.split('/')[2]]);
    if (row.rows[0]) ticketId=row.rows[0].id;
  }
  if (area === 'attachments') {
    if (!uuid(p.split('/')[1])) throw Object.assign(new Error('Invalid attachment identifier'),{status:400});
    const row=await pool.rawQuery('SELECT ticket_id FROM ticket_attachments WHERE id=$1',[p.split('/')[1]]);
    if (row.rows[0]) ticketId=row.rows[0].ticket_id;
  }
  if (ticketId) {
    if (!uuid(ticketId)) throw Object.assign(new Error('Invalid ticket identifier'),{status:400});
    const result = await pool.rawQuery('SELECT * FROM tickets WHERE id=$1 AND deleted_at IS NULL',[ticketId]);
    if (!result.rows[0]) throw Object.assign(new Error('Ticket not found'),{status:404});
    const ticket = result.rows[0]; req.authorizedTicket = ticket;
    if(area==='tickets'&&req.method==='POST'&&p.endsWith('/attachments')&&ticket.created_by===access.userId&&require('./ticketSubmission').valid(req.headers['x-ticket-submission'],ticketId,access.userId))access.submissionTicketId=ticketId;
    const requireRecord = async key => {
      need(req,key);
      const result = await pool.rawQuery(`SELECT 1 FROM tickets t WHERE t.id=$1 AND (${scopePredicate(access,key)}) AND (${scopePredicate(access,'tickets.view')})`,[ticketId]);
      if (!result.rowCount) throw forbidden();
    };
    await requireRecord(permission || 'tickets.view');
    if (area === 'tickets' && req.method === 'PUT') {
      await requireRecord('tickets.edit');
      const rerouted=['assignmentGroupId','subgroupId'].some(key=>req.body[key]!==undefined&&changed(req.body[key],ticket[columns[key]]));
      if(rerouted){
        if(!req.body.workNote?.trim())throw Object.assign(new Error('A work note is required when transferring a ticket to another department or sub department.'),{status:400});
        // A destination selection clears the old assignee unless a new one was explicitly chosen.
        if(req.body.assignedTo===undefined)req.body.assignedTo=null;
      }
      if(req.body.workNote?.trim()) await requireRecord('comments.work_note');
      if((req.body.status!==undefined&&changed(req.body.status,ticket.status)||req.body.assignedTo!==undefined&&changed(req.body.assignedTo,ticket.assigned_to))&&!req.body.workNote?.trim()) throw Object.assign(new Error('A work note is required when changing status or assignment.'),{status:400});
      for (const [bodyKey,column] of Object.entries(columns)) if (req.body[bodyKey] !== undefined && changed(req.body[bodyKey],ticket[column])) await requireRecord(`tickets.${actionFor[bodyKey] || 'edit'}`);
      const specific = {RESOLVED:'resolve',CLOSED:'close',REOPENED:'reopen',CANCELLED:'cancel'}[req.body.status];
      if (specific && req.body.status !== ticket.status) await requireRecord(`tickets.${specific}`);
    }
  }
  if (area === 'tickets' && req.method === 'POST' && p === '/') {
    if (req.body.templateId) need(req,'tickets.template');
    if(req.body.workNote?.trim())need(req,'comments.work_note');
    if (req.body.assignedTo) need(req,'tickets.assign');
    if (req.body.ticketOwner && req.body.ticketOwner !== access.userId) throw forbidden();
    if (req.body.status && req.body.status !== 'NEW') need(req,'tickets.status');
  }
  if (area === 'tickets' && ['POST','PUT'].includes(req.method) && (req.method==='POST'&&p==='/' || req.method==='PUT'&&req.authorizedTicket)) {
    const current=req.authorizedTicket;
    const destination=req.body.assignmentGroupId!==undefined?req.body.assignmentGroupId:current?.assignment_group_id;
    const subgroup=req.body.subgroupId!==undefined?req.body.subgroupId:current?.subgroup_id;
    const isCreate=req.method==='POST';
    const moved=!current||['assignmentGroupId','subgroupId'].some(k=>req.body[k]!==undefined&&changed(req.body[k],current[columns[k]]));
    const assignee=req.body.assignedTo!==undefined?req.body.assignedTo:current?.assigned_to;
    if(isCreate||moved||req.body.assignedTo!==undefined&&changed(req.body.assignedTo,current?.assigned_to)){
      if(!uuid(destination))throw Object.assign(new Error('Select a department.'),{status:400});
      const rows=await pool.rawQuery(`SELECT g.id FROM assignment_groups g LEFT JOIN assignment_groups s ON s.id=$2 AND s.parent_id=g.id AND s.is_active WHERE g.id=$1 AND g.parent_id IS NULL AND g.is_active AND ($2::uuid IS NULL OR s.id IS NOT NULL)`,[destination,subgroup||null]);
      if(!rows.rowCount)throw Object.assign(new Error('Select an active department and a valid sub department.'),{status:400});
      if(current&&moved){
        const destinationName=await pool.rawQuery('SELECT name FROM assignment_groups WHERE id=$1',[destination]);
        req.body.assignmentGroup=destinationName.rows[0].name;
      }
      if(assignee){
        const member=await pool.rawQuery(`SELECT 1 FROM users u WHERE u.id=$1 AND (${eligibleAssigneeSQL('u',assignmentScopeSQL('$2::uuid','$3::uuid'))})`,[assignee,destination,subgroup||null]);
        if(!member.rowCount)throw Object.assign(new Error('Assign an active member or Manager responsible for this department or sub department.'),{status:400});
      }
    }
  }
  if (area === 'users' && req.method === 'PUT' && p === '/me') {
    if (req.body.fullName || req.body.email) need(req,'profile.edit');
    if (req.body.newPassword) need(req,'profile.password');
  }
  if (area === 'kb') {
    if (req.method === 'POST' && (req.body.status || 'PUBLISHED') === 'PUBLISHED') need(req,'kb.publish');
    if (req.method === 'PUT') {
      const prior=await pool.rawQuery('SELECT status FROM kb_articles WHERE id=$1',[p.split('/')[1]]);
      // Editing a published article changes live content even when its status
      // stays PUBLISHED. Draft-only authors must not bypass publishing access.
      if(prior.rows[0] && (prior.rows[0].status==='PUBLISHED' || req.body.status!==undefined && changed(prior.rows[0].status,req.body.status))) need(req,'kb.publish');
    }
    if(req.method==='GET' && /^\/\d+$/.test(p)) {
      const row=await pool.rawQuery('SELECT status FROM kb_articles WHERE id=$1',[p.slice(1)]);
      if(row.rows[0]?.status==='DRAFT') need(req,'kb.drafts');
    }
  }
  if (area === 'config' && p.startsWith('/admin/') && ['PUT','POST'].includes(req.method)) {
    const kind = p.split('/')[2], id=p.split('/')[3];
    const groups = {fields:'fields', categories:'categories', 'ticket-types':'types', templates:'templates'};
    if (id && groups[kind]) {
      if(!(kind==='fields'?/^\d+$/.test(id):uuid(id))) throw Object.assign(new Error('Invalid configuration identifier'),{status:400});
      const tables={fields:'ticket_fields',categories:'categories','ticket-types':'ticket_types',templates:'ticket_templates'};
      const prior=await pool.rawQuery(`SELECT * FROM ${tables[kind]} WHERE id=$1`,[id]);
      const row=prior.rows[0];
      if(row && Object.keys(req.body).some(field=>!['is_active','is_required','is_system','field_order','adminPassword'].includes(field) && field in row && changed(req.body[field],row[field]))) need(req,`${groups[kind]}.edit`);
      if(row) for (const [field,suffix] of Object.entries({is_active:kind==='fields'?'active':'status',is_required:'required',is_system:'lock',field_order:'reorder'})) if(req.body[field]!==undefined && changed(req.body[field],row[field])) need(req,`${groups[kind]}.${suffix}`);
    }
    if (['branding','sso'].includes(kind)) {
      const table={branding:'organization_branding',sso:'sso_config',email:'email_config'}[kind];
      const prior=await pool.rawQuery(`SELECT * FROM ${table} WHERE id=1`); const row=prior.rows[0]||{};
      if(kind==='sso') {
        const aliases={providerName:'provider_name',issuerUrl:'issuer_url',clientId:'client_id',clientSecret:'client_secret',redirectUri:'redirect_uri',autoProvision:'auto_provision'};
        if(Object.entries(aliases).some(([field,column])=>req.body[field]!==undefined && !(field==='clientSecret'&&!req.body[field]) && changed(row[column],req.body[field]))) need(req,'sso.edit');
        if(changed(row.is_enabled??false,!!req.body.isEnabled))need(req,'sso.toggle');
      }
      if(Object.keys(req.body).some(field=>!['customize','is_enabled','enabled','logo_data','accent_color','adminPassword'].includes(field)&&field in row&&changed(req.body[field],row[field]))) need(req,`${kind}.edit`);
      for (const field of ['customize','is_enabled','enabled']) if(req.body[field]!==undefined && changed(row[field],req.body[field])) need(req,`${kind}.toggle`);
      if(kind==='branding') for(const [field,key] of [['logo_data','logo'],['accent_color','accent']]) if(req.body[field]!==undefined && changed(row[field],req.body[field])) need(req,`branding.${key}`);
    }
  }
  if(area==='config' && req.method==='DELETE' && req.query.force==='true') need(req,'categories.force_delete');
  if(area==='groups' && req.method==='PUT' && req.body.is_active!==undefined) {
    const row=await pool.rawQuery('SELECT is_active FROM assignment_groups WHERE id=$1',[p.split('/')[1]]);
    if(row.rows[0] && changed(row.rows[0].is_active,req.body.is_active)) need(req,'groups.status');
  }
  if(area==='subcategories' && req.method==='PUT' && req.body.is_active!==undefined) need(req,'subcategories.status');
  if(area==='sla' && req.method==='PUT' && p.startsWith('/definitions/')) {
    const row=await pool.rawQuery('SELECT is_active FROM sla_definitions WHERE id=$1',[p.split('/')[2]]);
    if(row.rows[0] && req.body.is_active!==undefined && changed(row.rows[0].is_active,req.body.is_active)) need(req,'sla_config.status');
  }
}
function recordCan(req,key,ticket){
  return require('./context').recordAllowed(req.access,key,ticket);
}
module.exports = { recordCan, can, need, forbidden, authorize, routePermission };
