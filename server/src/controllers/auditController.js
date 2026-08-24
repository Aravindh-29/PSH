const pool = require('../db/pool');

async function getLogs(req, res, next) {
  try {
    const { date, year, month, page = 1, limit = 100, tz = 'UTC' } = req.query;

    // Validate timezone to prevent injection (IANA names + POSIX offsets only)
    const timezone = /^[A-Za-z0-9/_+\-]{1,64}$/.test(tz) ? tz : 'UTC';

    // Resolve target date (default = today)
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // Resolve calendar month (default = month of targetDate)
    const calMonth = (year && month)
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : targetDate;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 1. Logs for the selected date (compare using caller's local timezone)
    const logsRes = await pool.query(
      `SELECT
         tal.id, tal.action, tal.field_name, tal.old_value, tal.new_value,
         tal.ip_address, tal.created_at,
         u.full_name  AS employee_name,
         u.role       AS employee_role,
         u.username   AS employee_username,
         t.ticket_number,
         t.short_description AS ticket_subject
       FROM ticket_audit_logs tal
       LEFT JOIN users u   ON tal.user_id   = u.id
       LEFT JOIN tickets t ON tal.ticket_id = t.id
       WHERE (tal.created_at AT TIME ZONE $4)::date = $1::date
       ORDER BY tal.created_at DESC
       LIMIT $2 OFFSET $3`,
      [targetDate, parseInt(limit), offset, timezone]
    );

    // 2. Count for the date
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM ticket_audit_logs
       WHERE (created_at AT TIME ZONE $2)::date = $1::date`,
      [targetDate, timezone]
    );

    // 3. Active days in the calendar month (for dot indicators)
    const activeDaysRes = await pool.query(
      `SELECT DISTINCT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day
       FROM ticket_audit_logs
       WHERE to_char(created_at AT TIME ZONE $2, 'YYYY-MM') = to_char($1::date, 'YYYY-MM')
       ORDER BY day`,
      [calMonth, timezone]
    );

    // 4. Per-day summary for sparkline (count per day in the month)
    const sparkRes = await pool.query(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, COUNT(*) AS cnt
       FROM ticket_audit_logs
       WHERE to_char(created_at AT TIME ZONE $2, 'YYYY-MM') = to_char($1::date, 'YYYY-MM')
       GROUP BY 1 ORDER BY 1`,
      [calMonth, timezone]
    );

    const total = parseInt(countRes.rows[0].count);

    // Build lookup maps for UUID → human-readable resolution
    const [usersRes, catsRes, typesRes] = await Promise.all([
      pool.query('SELECT id, full_name FROM users'),
      pool.query('SELECT id, name FROM categories'),
      pool.query('SELECT id, name FROM ticket_types'),
    ]);
    const userMap = Object.fromEntries(usersRes.rows.map(u => [u.id, u.full_name]));
    const catMap  = Object.fromEntries(catsRes.rows.map(c => [c.id, c.name]));
    const typeMap = Object.fromEntries(typesRes.rows.map(t => [t.id, t.name]));

    const logs = logsRes.rows.map(l => ({
      ...l,
      old_value: resolveValue(l.field_name, l.old_value, userMap, catMap, typeMap),
      new_value: resolveValue(l.field_name, l.new_value, userMap, catMap, typeMap),
    }));

    // Derive per-day summary
    const employees    = new Set(logs.map(l => l.employee_name).filter(Boolean)).size;
    const ticketsTouched = new Set(logs.map(l => l.ticket_number).filter(Boolean)).size;

    res.json({
      success: true,
      date: targetDate,
      summary: { total, employees, ticketsTouched },
      logs,
      pagination: {
        total, page: parseInt(page), limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      activeDays: activeDaysRes.rows.map(r => r.day),
      sparkline: sparkRes.rows.map(r => ({
        day: r.day,
        count: parseInt(r.cnt),
      })),
    });
  } catch (err) { next(err); }
}

// Resolve a raw value to a human-readable label given the field name.
// Uses pre-fetched lookup maps so we only query once per request.
function resolveValue(field, rawVal, userMap, catMap, typeMap = {}) {
  if (!rawVal || rawVal === 'null') return null;
  if (['ticket_owner','assigned_to','created_by','updated_by','deleted_by','user_id'].includes(field)) {
    return userMap[rawVal] || rawVal;
  }
  if (field === 'category_id') return catMap[rawVal] || rawVal;
  if (field === 'type_id')     return typeMap[rawVal] || rawVal;
  return rawVal;
}

async function getTicketHistory(req, res, next) {
  try {
    const { ticketNumber } = req.params;

    // Get ticket basic info
    const ticketRes = await pool.query(
      `SELECT t.id, t.ticket_number, t.short_description, t.status, t.priority,
              t.created_at, u.full_name AS created_by_name
       FROM tickets t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.ticket_number = $1`,
      [ticketNumber]
    );
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = ticketRes.rows[0];

    // Build lookup maps
    const [usersRes, catsRes, typesRes2] = await Promise.all([
      pool.query('SELECT id, full_name FROM users'),
      pool.query('SELECT id, name FROM categories'),
      pool.query('SELECT id, name FROM ticket_types'),
    ]);
    const userMap = Object.fromEntries(usersRes.rows.map(u => [u.id, u.full_name]));
    const catMap  = Object.fromEntries(catsRes.rows.map(c => [c.id, c.name]));
    const typeMap = Object.fromEntries(typesRes2.rows.map(t => [t.id, t.name]));

    // All audit entries for this ticket, oldest first (to show timeline)
    const logsRes = await pool.query(
      `SELECT tal.id, tal.action, tal.field_name, tal.old_value, tal.new_value,
              tal.ip_address, tal.created_at,
              u.full_name AS employee_name, u.role AS employee_role
       FROM ticket_audit_logs tal
       LEFT JOIN users u ON tal.user_id = u.id
       WHERE tal.ticket_id = $1
       ORDER BY tal.created_at ASC`,
      [ticket.id]
    );

    const logs = logsRes.rows.map(l => ({
      ...l,
      old_value: resolveValue(l.field_name, l.old_value, userMap, catMap, typeMap),
      new_value: resolveValue(l.field_name, l.new_value, userMap, catMap, typeMap),
    }));

    res.json({ success: true, ticket, logs });
  } catch (err) { next(err); }
}

async function getRetention(req, res, next) {
  try {
    const row = await pool.query('SELECT * FROM audit_retention_settings WHERE id = 1');
    res.json({ success: true, settings: row.rows[0] });
  } catch (err) { next(err); }
}

async function updateRetention(req, res, next) {
  try {
    const { enabled, retention_days } = req.body;
    if (retention_days !== undefined && (isNaN(retention_days) || retention_days < 1)) {
      return res.status(400).json({ success: false, message: 'retention_days must be at least 1' });
    }
    const row = await pool.query(
      `UPDATE audit_retention_settings
       SET enabled        = COALESCE($1, enabled),
           retention_days = COALESCE($2, retention_days),
           updated_at     = NOW(),
           updated_by     = $3
       WHERE id = 1 RETURNING *`,
      [enabled ?? null, retention_days ?? null, req.session.userId]
    );
    res.json({ success: true, settings: row.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { getLogs, getTicketHistory, getRetention, updateRetention };
