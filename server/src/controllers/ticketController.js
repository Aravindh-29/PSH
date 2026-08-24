const pool = require('../db/pool');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');

function fireEmail(fn) {
  Promise.resolve().then(fn).catch(err => logger.error('Email notification error', err));
}

const VALID_STATUSES = ['NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED'];
const VALID_PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];

async function logAudit(client, ticketId, userId, action, fieldName, oldValue, newValue, ipAddress) {
  await client.query(
    `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ticketId, userId, action, fieldName || null, oldValue ? String(oldValue) : null, newValue ? String(newValue) : null, ipAddress || null]
  );
}

async function list(req, res, next) {
  try {
    const isAdmin = req.session.role === 'admin';
    const userId = req.session.userId;
    const { page = 1, limit = 25, status, priority, module: mod, category, search, assignedTo, myTickets, createdBy, sortBy, sortDir, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['t.deleted_at IS NULL'];
    const params = [];

    if (!isAdmin) {
      // Employee sees tickets assigned to them, OR unassigned tickets they created.
      // Once a ticket is assigned to someone else it leaves their bucket completely.
      params.push(userId);
      conditions.push(
        `(t.assigned_to = $${params.length} OR (t.assigned_to IS NULL AND (t.created_by = $${params.length} OR t.ticket_owner = $${params.length})))`
      );
    } else if (myTickets === 'true') {
      params.push(userId);
      conditions.push(
        `(t.assigned_to = $${params.length} OR (t.assigned_to IS NULL AND t.created_by = $${params.length}))`
      );
    } else if (createdBy) {
      // Admin viewing a specific user's bucket: tickets assigned to that user,
      // or unassigned tickets they originally created.
      params.push(createdBy);
      conditions.push(
        `(t.assigned_to = $${params.length} OR (t.assigned_to IS NULL AND t.created_by = $${params.length}))`
      );
    }
    if (status) { params.push(status); conditions.push(`t.status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`t.priority = $${params.length}`); }
    if (mod) { params.push(mod); conditions.push(`t.module_id = $${params.length}`); }
    if (category) { params.push(category); conditions.push(`t.category_id = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); conditions.push(`t.assigned_to = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(t.ticket_number ILIKE $${idx} OR t.short_description ILIKE $${idx} OR t.customer_name ILIKE $${idx})`);
    }
    if (startDate) { params.push(startDate); conditions.push(`t.created_at >= $${params.length}::date`); }
    if (endDate)   { params.push(endDate);   conditions.push(`t.created_at < ($${params.length}::date + INTERVAL '1 day')`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM tickets t ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const dataResult = await pool.query(`
      SELECT t.id, t.ticket_number, t.short_description, t.customer_name, t.status, t.priority,
             t.created_at, t.updated_at,
             COALESCE(t.module_text, m.name) AS module_name, c.name AS category_name,
             u1.full_name AS assigned_to_name, u1.id AS assigned_to_id,
             u2.full_name AS created_by_name,
             u3.full_name AS ticket_owner_name
      FROM tickets t
      LEFT JOIN modules m ON t.module_id = m.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      LEFT JOIN users u3 ON t.ticket_owner = u3.id
      ${where}
      ORDER BY ${({ ticket_number: 't.ticket_number', status: 't.status', priority: 't.priority', created_at: 't.created_at', updated_at: 't.updated_at' })[sortBy] || 't.updated_at'} ${sortDir === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      success: true,
      tickets: dataResult.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const isAdmin = req.session.role === 'admin';
    const {
      customerName, moduleText, categoryId, shortDescription, description,
      priority = 'MEDIUM', impact = 'MEDIUM', urgency = 'MEDIUM',
      customData = {},
      assignmentGroup = null,
      typeId = null,
      classification = null,
    } = req.body;

    // Employees always create as NEW; admins can set any valid status
    const rawStatus = req.body.status || 'NEW';
    const status = (!isAdmin || !VALID_STATUSES.includes(rawStatus)) ? 'NEW' : rawStatus;

    // assignedTo → assigned_to column; ticket_owner is always the creating user
    const rawAssigned = req.body.assignedTo || null;

    if (!customerName || !shortDescription || !description || !moduleText || !categoryId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }

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

    const result = await client.query(`
      INSERT INTO tickets (ticket_number, customer_name, module_text, category_id, short_description,
        description, status, priority, impact, urgency, assigned_to, assignment_group,
        ticket_owner, created_by, updated_by, type_id, classification, custom_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$13,$14,$15,$16)
      RETURNING *
    `, [ticketNumber, customerName, moduleText, categoryId, shortDescription, description,
        status, priority, impact, urgency,
        rawAssigned || null,
        assignmentGroup || null,
        req.session.userId,
        typeId || null, classification || null,
        JSON.stringify(customData)]);

    const ticket = result.rows[0];
    await logAudit(client, ticket.id, req.session.userId, 'CREATED', null, null, ticketNumber, req.ip);

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
      await logAudit(client, ticket.id, req.session.userId, 'CREATED', field, null, value, req.ip);
    }

    // Notify the assignee when a ticket is created with an immediate assignment
    if (rawAssigned && rawAssigned !== req.session.userId) {
      const creatorRow = await client.query('SELECT full_name FROM users WHERE id = $1', [req.session.userId]);
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

    await client.query('COMMIT');

    // Fire email notification to assignee (non-blocking)
    if (rawAssigned) {
      const capturedTicket = { ...ticket, ticket_number: ticketNumber };
      const actorId = req.session.userId;
      fireEmail(async () => {
        const [assigneeRow, actorRow] = await Promise.all([
          pool.query('SELECT email FROM users WHERE id = $1', [rawAssigned]),
          pool.query('SELECT full_name FROM users WHERE id = $1', [actorId]),
        ]);
        await emailService.notifyTicketCreated(
          capturedTicket,
          actorRow.rows[0]?.full_name || 'Someone',
          assigneeRow.rows[0]?.email
        );
      });
    }

    logger.info(`Ticket created: ${ticketNumber} by ${req.session.username}`);
    res.status(201).json({ success: true, ticket });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT t.*,
             COALESCE(t.module_text, m.name) AS module_name, c.name AS category_name,
             tt.name AS type_name,
             u1.full_name AS assigned_to_name, u1.id AS assigned_to_id,
             u2.full_name AS created_by_name,
             u3.full_name AS updated_by_name,
             u4.full_name AS ticket_owner_name
      FROM tickets t
      LEFT JOIN modules m ON t.module_id = m.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN ticket_types tt ON t.type_id = tt.id
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      LEFT JOIN users u3 ON t.updated_by = u3.id
      LEFT JOIN users u4 ON t.ticket_owner = u4.id
      WHERE t.id = $1 AND t.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = result.rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!isAdmin && ticket.created_by !== req.session.userId && ticket.ticket_owner !== req.session.userId && ticket.assigned_to !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [attachments, comments, auditRaw] = await Promise.all([
      pool.query('SELECT id, file_name, mime_type, file_size, uploaded_by, uploaded_at, (SELECT full_name FROM users WHERE id = uploaded_by) AS uploader_name FROM ticket_attachments WHERE ticket_id = $1 ORDER BY uploaded_at DESC', [id]),
      pool.query('SELECT tc.*, u.full_name AS author_name, u.role AS author_role FROM ticket_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.ticket_id = $1 ORDER BY tc.created_at ASC', [id]),
      pool.query('SELECT tal.*, u.full_name AS user_name FROM ticket_audit_logs tal LEFT JOIN users u ON tal.user_id = u.id WHERE tal.ticket_id = $1 ORDER BY tal.created_at ASC', [id]),
    ]);

    // Resolve UUID values in audit log to human-readable names
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const userUuids = new Set();
    const catUuids = new Set();
    for (const a of auditRaw.rows) {
      if (['ticket_owner', 'assigned_to'].includes(a.field_name)) {
        if (a.old_value && UUID_RE.test(a.old_value)) userUuids.add(a.old_value);
        if (a.new_value && UUID_RE.test(a.new_value)) userUuids.add(a.new_value);
      }
      if (a.field_name === 'category_id') {
        if (a.old_value && UUID_RE.test(a.old_value)) catUuids.add(a.old_value);
        if (a.new_value && UUID_RE.test(a.new_value)) catUuids.add(a.new_value);
      }
    }
    const userMap = {};
    if (userUuids.size > 0) {
      const uRes = await pool.query('SELECT id, full_name FROM users WHERE id = ANY($1)', [Array.from(userUuids)]);
      uRes.rows.forEach(r => { userMap[r.id] = r.full_name; });
    }
    const catMap = {};
    if (catUuids.size > 0) {
      const cRes = await pool.query('SELECT id, name FROM categories WHERE id = ANY($1)', [Array.from(catUuids)]);
      cRes.rows.forEach(r => { catMap[r.id] = r.name; });
    }
    const audit = auditRaw.rows.map(a => {
      if (['ticket_owner', 'assigned_to'].includes(a.field_name)) {
        return { ...a, old_value: userMap[a.old_value] ?? a.old_value, new_value: userMap[a.new_value] ?? a.new_value };
      }
      if (a.field_name === 'category_id') {
        return { ...a, old_value: catMap[a.old_value] ?? a.old_value, new_value: catMap[a.new_value] ?? a.new_value };
      }
      return a;
    });

    res.json({
      success: true,
      ticket,
      attachments: attachments.rows,
      comments: comments.rows,
      audit,
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const existing = await client.query('SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = existing.rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!isAdmin && ticket.created_by !== req.session.userId && ticket.assigned_to !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Employees can update ticket fields but never ownership — only admins may change ticket_owner
    const UUID_COLS = new Set(['ticket_owner', 'assigned_to', 'category_id', 'type_id']);
    const fieldMap = {
      customerName: 'customer_name', moduleText: 'module_text', categoryId: 'category_id',
      shortDescription: 'short_description', description: 'description', status: 'status',
      priority: 'priority', impact: 'impact', urgency: 'urgency',
      assignmentGroup: 'assignment_group', classification: 'classification', typeId: 'type_id',
      assignedTo: 'assigned_to',
      ...(isAdmin ? { ticketOwner: 'ticket_owner' } : {}),
    };

    const sets = [];
    const params = [];
    const auditChanges = [];

    for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
      if (req.body[bodyKey] !== undefined) {
        if (dbCol === 'status' && !VALID_STATUSES.includes(req.body[bodyKey])) continue;
        if (dbCol === 'priority' && !VALID_PRIORITIES.includes(req.body[bodyKey])) continue;
        // Normalize empty string → null for UUID columns to avoid cast errors
        const raw = req.body[bodyKey];
        const newVal = (UUID_COLS.has(dbCol) && (raw === '' || raw === undefined)) ? null : raw;
        const oldVal = ticket[dbCol] ?? null;
        if (oldVal !== newVal) {
          params.push(newVal);
          sets.push(`${dbCol} = $${params.length}`);
          auditChanges.push({ field: dbCol, old: oldVal, new: newVal });
        }
      }
    }

    // Merge custom_data if provided
    if (req.body.customData !== undefined) {
      const merged = { ...(ticket.custom_data || {}), ...req.body.customData };
      params.push(JSON.stringify(merged));
      sets.push(`custom_data = $${params.length}`);
      if (JSON.stringify(ticket.custom_data || {}) !== JSON.stringify(merged)) {
        auditChanges.push({ field: 'custom_data', old: JSON.stringify(ticket.custom_data), new: JSON.stringify(merged) });
      }
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'No changes' });
    }

    params.push(req.session.userId);
    sets.push(`updated_by = $${params.length}`);
    sets.push(`updated_at = NOW()`);
    params.push(id);

    const updated = await client.query(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    for (const change of auditChanges) {
      await logAudit(client, id, req.session.userId, 'UPDATED', change.field, change.old, change.new, req.ip);
    }

    // Fire notification when ticket is assigned (or reassigned) to a user
    const assignChange = auditChanges.find(c => c.field === 'assigned_to');
    if (assignChange && assignChange.new && assignChange.new !== req.session.userId) {
      const assignerRow = await client.query('SELECT full_name FROM users WHERE id = $1', [req.session.userId]);
      const assignerName = assignerRow.rows[0]?.full_name || 'Someone';
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, ticket_id, ticket_number)
         VALUES ($1, 'TICKET_ASSIGNED', $2, $3, $4, $5)`,
        [
          assignChange.new,
          `Ticket assigned to you`,
          `${assignerName} assigned ${ticket.ticket_number} to you — ${ticket.short_description || ''}`,
          ticket.id,
          ticket.ticket_number,
        ]
      );
    }

    await client.query('COMMIT');

    // Fire email notifications (non-blocking)
    const capturedTicket = ticket;
    const capturedChanges = auditChanges;
    const actorId = req.session.userId;
    fireEmail(async () => {
      const actorRow = await pool.query('SELECT full_name FROM users WHERE id = $1', [actorId]);
      const actorName = actorRow.rows[0]?.full_name || 'Someone';

      const assignChange = capturedChanges.find(c => c.field === 'assigned_to');
      if (assignChange?.new) {
        const assigneeRow = await pool.query('SELECT email FROM users WHERE id = $1', [assignChange.new]);
        await emailService.notifyTicketAssigned(capturedTicket, actorName, assigneeRow.rows[0]?.email);
      }

      const statusChange = capturedChanges.find(c => c.field === 'status');
      if (statusChange) {
        const recipientIds = [capturedTicket.created_by, capturedTicket.assigned_to].filter(Boolean);
        const emailsRow = await pool.query('SELECT email FROM users WHERE id = ANY($1)', [recipientIds]);
        const emails = emailsRow.rows.map(r => r.email);
        if (statusChange.new === 'RESOLVED' || statusChange.new === 'CLOSED') {
          await emailService.notifyTicketResolved({ ...capturedTicket, status: statusChange.new }, actorName, emails);
        } else {
          await emailService.notifyStatusChanged(capturedTicket, statusChange.old, statusChange.new, actorName, emails);
        }
      }
    });

    logger.info(`Ticket ${ticket.ticket_number} updated by ${req.session.username}`);
    res.json({ success: true, ticket: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function remove(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const existing = await client.query('SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = existing.rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!isAdmin && ticket.created_by !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await client.query('UPDATE tickets SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [req.session.userId, id]);
    await logAudit(client, id, req.session.userId, 'DELETED', null, null, null, req.ip);
    await client.query('COMMIT');
    logger.info(`Ticket ${ticket.ticket_number} soft-deleted by ${req.session.username}`);
    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function addComment(req, res, next) {
  try {
    const { id } = req.params;
    const { body, type = 'COMMENT' } = req.body;
    if (!body) return res.status(400).json({ success: false, message: 'Comment body required' });

    const ticket = await pool.query('SELECT id, created_by, assigned_to FROM tickets WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (ticket.rows.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const isAdmin = req.session.role === 'admin';
    const t = ticket.rows[0];
    if (!isAdmin && t.created_by !== req.session.userId && t.assigned_to !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }


    const result = await pool.query(
      `INSERT INTO ticket_comments (ticket_id, user_id, body, type) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.session.userId, body, type]
    );
    const comment = result.rows[0];
    const userResult = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.session.userId]);

    // Fire email to the other party (non-blocking)
    const actorId = req.session.userId;
    const capturedBody = body;
    const capturedType = type;
    const ticketId = id;
    fireEmail(async () => {
      const [actorRow, ticketRow] = await Promise.all([
        pool.query('SELECT full_name FROM users WHERE id = $1', [actorId]),
        pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]),
      ]);
      const tk = ticketRow.rows[0];
      const actorName = actorRow.rows[0]?.full_name || 'Someone';
      const recipientIds = [tk.created_by, tk.assigned_to].filter(Boolean).filter(uid => uid !== actorId);
      if (recipientIds.length) {
        const emailsRow = await pool.query('SELECT email FROM users WHERE id = ANY($1)', [recipientIds]);
        await emailService.notifyCommentAdded(tk, capturedBody, actorName, capturedType, emailsRow.rows.map(r => r.email));
      }
    });

    res.status(201).json({ success: true, comment: { ...comment, author_name: userResult.rows[0].full_name } });
  } catch (err) {
    next(err);
  }
}

async function nextNumber(req, res, next) {
  try {
    const { typeId } = req.query;
    if (typeId) {
      const row = await pool.query(
        `SELECT tt.prefix, COALESCE(tc.counter, 0) AS counter
         FROM ticket_types tt
         LEFT JOIN ticket_type_counters tc ON tc.type_id = tt.id
         WHERE tt.id = $1`,
        [typeId]
      );
      if (row.rows.length === 0) return res.json({ number: 'TKT000001' });
      const { prefix, counter } = row.rows[0];
      return res.json({ number: `${prefix || 'TKT'}${String(Number(counter) + 1).padStart(6, '0')}` });
    }
    const result = await pool.query(
      `SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS next FROM ticket_number_seq`
    );
    res.json({ number: `PSH${String(result.rows[0].next).padStart(6, '0')}` });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, getOne, update, remove, addComment, nextNumber };
