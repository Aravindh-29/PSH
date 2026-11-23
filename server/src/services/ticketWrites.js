const {resolveTicketTemplate}=require('./templateService');
const slaService=require('./slaService');
const logAudit=require('./ticketAudit');
const VALID_STATUSES=['NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED'];
const VALID_PRIORITIES=['LOW','MEDIUM','HIGH','CRITICAL'];

// Shared by the portal and email automation. Caller owns the transaction.
async function createTicketInTransaction(client,body,actorId,{isAdmin=false,ip=null,allowIncompleteEmail=false}={}){
    const {
      customerName, moduleText, categoryId, subcategoryId = null, shortDescription, description,
      priority = 'MEDIUM', impact = 'MEDIUM', urgency = 'MEDIUM',
      customData = {},
      assignmentGroup = null,
      assignmentGroupId = null, subgroupId = null,
      typeId = null,
      classification = null,
    } = body;

    // Employees always create as NEW; admins can set any valid status
    const rawStatus = body.status || 'NEW';
    const status = (!isAdmin || !VALID_STATUSES.includes(rawStatus)) ? 'NEW' : rawStatus;

    // assignedTo → assigned_to column; ticket_owner is always the creating user
    const rawAssigned = body.assignedTo || null;

    if(allowIncompleteEmail&&!(await client.query('SELECT 1 FROM users WHERE id=$1 AND is_system AND NOT is_active',[actorId])).rowCount)throw Object.assign(new Error('Email creation requires the protected System identity.'),{status:403});
    if (!shortDescription || !description || !allowIncompleteEmail&&(!customerName || !moduleText || !categoryId)) {
      throw Object.assign(new Error('Missing required fields'),{status:400});
    }
    if (!(allowIncompleteEmail&&priority===null)&&!VALID_PRIORITIES.includes(priority)) {
      throw Object.assign(new Error('Invalid priority'),{status:400});
    }

    const template = await resolveTicketTemplate(client, body);

    let ticketNumber;
    if (typeId) {
      const typeRow = await client.query('SELECT prefix FROM ticket_types WHERE id = $1', [typeId]);
      const prefix = typeRow.rows[0]?.prefix || 'TKT';
      // Single atomic upsert — safe under any level of concurrency; no advisory lock needed
      const ctrRes = await client.query(
        `INSERT INTO ticket_type_counters (type_id, counter) VALUES ($1, 1)
         ON CONFLICT (type_id) DO UPDATE SET counter = ticket_type_counters.counter + 1
         RETURNING counter`,
        [typeId]
      );
      ticketNumber = `${prefix}${String(ctrRes.rows[0].counter).padStart(6, '0')}`;
    } else {
      const seqResult = await client.query(`SELECT nextval('ticket_number_seq') AS seq`);
      ticketNumber = `PSH${String(seqResult.rows[0].seq).padStart(6, '0')}`;
    }

    // Resolve assignment group name from assignmentGroupId if provided
    let resolvedGroupName = assignmentGroup || null;
    if (assignmentGroupId) {
      const gr = await client.query('SELECT name FROM assignment_groups WHERE id = $1', [assignmentGroupId]);
      if (gr.rows[0]) resolvedGroupName = gr.rows[0].name;
    }

    const result = await client.query(`
      INSERT INTO tickets (ticket_number, customer_name, module_text, category_id, subcategory_id,
        short_description, description, status, priority, impact, urgency, assigned_to,
        assignment_group, assignment_group_id, ticket_owner, created_by, updated_by,
        type_id, classification, custom_data, template_id, template_snapshot, template_values, subgroup_id,source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
    `, [ticketNumber, customerName, moduleText, categoryId, subcategoryId || null,
        shortDescription, description,
        status, priority, impact, urgency,
        rawAssigned || null,
        resolvedGroupName || null,
        assignmentGroupId || null,
        actorId,
        typeId || null, classification || null,
        JSON.stringify(customData), template.id, JSON.stringify(template.snapshot), JSON.stringify(template.values), subgroupId || null,allowIncompleteEmail?'EMAIL':'PORTAL']);

    const ticket = result.rows[0];
    await logAudit(client, ticket.id, actorId, 'CREATED', null, null, ticketNumber, ip);

    // Log each initial field value so the audit trail shows what the ticket was created with
    const initialFields = [
      { field: 'status',           value: status },
      { field: 'priority',         value: priority },
      { field: 'impact',           value: impact },
      { field: 'urgency',          value: urgency },
      { field: 'customer_name',    value: customerName },
      { field: 'module_text',      value: moduleText },
      { field: 'short_description',value: shortDescription },
      ...(rawAssigned      ? [{ field: 'assigned_to',      value: rawAssigned }]      : []),
      ...(assignmentGroup  ? [{ field: 'assignment_group', value: assignmentGroup }]  : []),
      ...(classification   ? [{ field: 'classification',   value: classification }]   : []),
      ...(typeId           ? [{ field: 'type_id',          value: typeId }]           : []),
    ];
    for (const { field, value } of initialFields) {
      await logAudit(client, ticket.id, actorId, 'CREATED', field, null, value, ip);
    }

    if (template.id) await logAudit(client, ticket.id, actorId, 'CREATED', 'template', null, JSON.stringify({ ...template.snapshot, values: template.values }), ip);

    if(body.workNote?.trim()){
      await client.query("INSERT INTO ticket_comments(ticket_id,user_id,body,type) VALUES($1,$2,$3,'WORK_NOTE')",[ticket.id,actorId,body.workNote.trim()]);
      await logAudit(client,ticket.id,actorId,'COMMENT_ADDED','work_note',null,body.workNote.trim(),ip);
    }

    // Trigger SLA for initial status (treat creation as transitioning from null → status)
    await slaService.onStatusChange(client, ticket.id, null, status);

    // Notify the assignee when a ticket is created with an immediate assignment
    if (rawAssigned && rawAssigned !== actorId) {
      const creatorRow = await client.query('SELECT full_name FROM users WHERE id = $1', [actorId]);
      const creatorName = creatorRow.rows[0]?.full_name || 'Someone';
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, ticket_id, ticket_number)
         VALUES ($1, 'TICKET_ASSIGNED', $2, $3, $4, $5)`,
        [
          rawAssigned,
          `Ticket assigned to you`,
          `${creatorName} assigned ${ticketNumber} to you — ${shortDescription || ''}`,
          ticket.id,
          ticketNumber,
        ]
      );
    }


 return ticket;
}
module.exports={createTicketInTransaction};
