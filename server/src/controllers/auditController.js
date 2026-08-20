const pool = require('../db/pool');

async function getLogs(req, res, next) {
  try {
    const { date, year, month, page = 1, limit = 100 } = req.query;

    // Resolve target date (default = today)
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // Resolve calendar month (default = month of targetDate)
    const calMonth = (year && month)
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : targetDate;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 1. Logs for the selected date
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
       WHERE tal.created_at AT TIME ZONE 'UTC' >= ($1::date)
         AND tal.created_at AT TIME ZONE 'UTC' <  ($1::date + INTERVAL '1 day')
       ORDER BY tal.created_at DESC
       LIMIT $2 OFFSET $3`,
      [targetDate, parseInt(limit), offset]
    );

    // 2. Count for the date
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM ticket_audit_logs
       WHERE created_at AT TIME ZONE 'UTC' >= ($1::date)
         AND created_at AT TIME ZONE 'UTC' <  ($1::date + INTERVAL '1 day')`,
      [targetDate]
    );

    // 3. Active days in the calendar month (for dot indicators)
    const activeDaysRes = await pool.query(
      `SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date AS day
       FROM ticket_audit_logs
       WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') =
             DATE_TRUNC('month', $1::date)
       ORDER BY day`,
      [calMonth]
    );

    // 4. Per-day summary for sparkline (count per day in the month)
    const sparkRes = await pool.query(
      `SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS cnt
       FROM ticket_audit_logs
       WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') =
             DATE_TRUNC('month', $1::date)
       GROUP BY 1 ORDER BY 1`,
      [calMonth]
    );

    const total = parseInt(countRes.rows[0].count);

    // Build lookup maps for UUID → human-readable resolution
    const [usersRes, catsRes] = await Promise.all([
      pool.query('SELECT id, full_name FROM users'),
      pool.query('SELECT id, name FROM categories'),
    ]);
    const userMap = Object.fromEntries(usersRes.rows.map(u => [u.id, u.full_name]));
    const catMap  = Object.fromEntries(catsRes.rows.map(c => [c.id, c.name]));

    const logs = logsRes.rows.map(l => ({
      ...l,
      old_value: resolveValue(l.field_name, l.old_value, userMap, catMap),
      new_value: resolveValue(l.field_name, l.new_value, userMap, catMap),
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
      activeDays: activeDaysRes.rows.map(r => r.day.toISOString().slice(0, 10)),
      sparkline: sparkRes.rows.map(r => ({
        day: r.day.toISOString().slice(0, 10),
        count: parseInt(r.cnt),
      })),
    });
  } catch (err) { next(err); }
}

// Resolve a raw value to a human-readable label given the field name.
// Uses pre-fetched lookup maps so we only query once per request.
function resolveValue(field, rawVal, userMap, catMap) {
  if (!rawVal || rawVal === 'null') return null;
  if (['ticket_owner','assigned_to','created_by','updated_by','deleted_by','user_id'].includes(field)) {
    return userMap[rawVal] || rawVal;
  }
  if (field === 'category_id') {
    return catMap[rawVal] || rawVal;
  }
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
    const [usersRes, catsRes] = await Promise.all([
      pool.query('SELECT id, full_name FROM users'),
      pool.query('SELECT id, name FROM categories'),
    ]);
    const userMap = Object.fromEntries(usersRes.rows.map(u => [u.id, u.full_name]));
    const catMap  = Object.fromEntries(catsRes.rows.map(c => [c.id, c.name]));

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
      old_value: resolveValue(l.field_name, l.old_value, userMap, catMap),
      new_value: resolveValue(l.field_name, l.new_value, userMap, catMap),
    }));

    res.json({ success: true, ticket, logs });
  } catch (err) { next(err); }
}

module.exports = { getLogs, getTicketHistory };
