const pool = require('../db/pool');
const logger = require('../utils/logger');

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
    const { page = 1, limit = 25, status, priority, module: mod, category, search, assignedTo, myTickets, createdBy } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['t.deleted_at IS NULL'];
    const params = [];

    if (!isAdmin) {
      params.push(userId);
      conditions.push(`(t.created_by = $${params.length} OR t.assigned_to = $${params.length})`);
    } else if (myTickets === 'true') {
      params.push(userId);
      conditions.push(`t.created_by = $${params.length}`);
    } else if (createdBy) {
      params.push(createdBy);
      conditions.push(`t.created_by = $${params.length}`);
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
      ORDER BY t.updated_at DESC
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
    const {
      customerName, moduleText, categoryId, shortDescription, description,
      status = 'NEW', priority = 'MEDIUM', impact = 'MEDIUM', urgency = 'MEDIUM',
    } = req.body;

    if (!customerName || !shortDescription || !description || !moduleText || !categoryId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }

    const seqResult = await client.query(`SELECT nextval('ticket_number_seq') AS seq`);
    const ticketNumber = `PSH${String(seqResult.rows[0].seq).padStart(6, '0')}`;

    // ticket_owner is always the logged-in user — never trusted from the client
    const result = await client.query(`
      INSERT INTO tickets (ticket_number, customer_name, module_text, category_id, short_description,
        description, status, priority, impact, urgency, assigned_to, assignment_group,
        ticket_owner, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,$11,$11,$11)
      RETURNING *
    `, [ticketNumber, customerName, moduleText, categoryId, shortDescription, description,
        status, priority, impact, urgency, req.session.userId]);

    const ticket = result.rows[0];
    await logAudit(client, ticket.id, req.session.userId, 'CREATED', null, null, null, req.ip);
    await client.query('COMMIT');

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
             u1.full_name AS assigned_to_name, u1.id AS assigned_to_id,
             u2.full_name AS created_by_name,
             u3.full_name AS updated_by_name,
             u4.full_name AS ticket_owner_name
      FROM tickets t
      LEFT JOIN modules m ON t.module_id = m.id
      LEFT JOIN categories c ON t.category_id = c.id
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
    if (!isAdmin && ticket.created_by !== req.session.userId && ticket.assigned_to_id !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [attachments, comments, audit] = await Promise.all([
      pool.query('SELECT id, file_name, mime_type, file_size, uploaded_by, uploaded_at, (SELECT full_name FROM users WHERE id = uploaded_by) AS uploader_name FROM ticket_attachments WHERE ticket_id = $1 ORDER BY uploaded_at DESC', [id]),
      pool.query('SELECT tc.*, u.full_name AS author_name FROM ticket_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.ticket_id = $1 ORDER BY tc.created_at ASC', [id]),
      pool.query('SELECT tal.*, u.full_name AS user_name FROM ticket_audit_logs tal LEFT JOIN users u ON tal.user_id = u.id WHERE tal.ticket_id = $1 ORDER BY tal.created_at ASC', [id]),
    ]);

    res.json({
      success: true,
      ticket,
      attachments: attachments.rows,
      comments: comments.rows,
      audit: audit.rows,
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
    if (!isAdmin && ticket.created_by !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Employees can update ticket fields but never ownership — only admins may change ticket_owner
    const UUID_COLS = new Set(['ticket_owner', 'assigned_to', 'category_id']);
    const fieldMap = {
      customerName: 'customer_name', moduleText: 'module_text', categoryId: 'category_id',
      shortDescription: 'short_description', description: 'description', status: 'status',
      priority: 'priority', impact: 'impact', urgency: 'urgency',
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

    await client.query('COMMIT');
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
    if (type === 'WORK_NOTE' && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Work notes are admin only' });
    }

    const result = await pool.query(
      `INSERT INTO ticket_comments (ticket_id, user_id, body, type) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.session.userId, body, type]
    );
    const comment = result.rows[0];
    const userResult = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.session.userId]);
    res.status(201).json({ success: true, comment: { ...comment, author_name: userResult.rows[0].full_name } });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, getOne, update, remove, addComment };
