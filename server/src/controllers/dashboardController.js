const pool = require('../db/pool');

function pctChange(curr, prev) {
  const c = parseInt(curr || 0);
  const p = parseInt(prev || 0);
  if (p === 0) return c > 0 ? 100 : 0;
  return parseFloat(((c - p) / p * 100).toFixed(1));
}

function formatDuration(hours) {
  const h = parseFloat(hours);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
  return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`;
}

async function getStats(req, res, next) {
  try {
    const isAdmin = req.session.role === 'admin';
    const userId = req.session.userId;
    const userFilter = !isAdmin ? ` AND (t.created_by = $1 OR t.assigned_to = $1)` : '';
    const params = !isAdmin ? [userId] : [];

    // Date range for chart (defaults: last 7 days)
    const today = new Date().toISOString().split('T')[0];
    const sevenAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
    const chartStart = req.query.startDate || sevenAgo;
    const chartEnd   = req.query.endDate   || today;

    // ── 1. Status counts (current snapshot) ──────────────
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE t.status IN ('NEW','OPEN')) AS open_count,
        COUNT(*) FILTER (WHERE t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS in_progress,
        COUNT(*) FILTER (WHERE t.status IN ('PENDING','ON_HOLD')) AS pending_count,
        COUNT(*) FILTER (WHERE t.status = 'RESOLVED') AS resolved_count,
        COUNT(*) FILTER (WHERE t.status = 'CLOSED') AS closed_count,
        COUNT(*) FILTER (WHERE t.priority = 'CRITICAL') AS critical_count,
        COUNT(*) FILTER (WHERE t.priority = 'HIGH') AS high_count,
        COUNT(*) FILTER (WHERE t.priority = 'MEDIUM') AS medium_count,
        COUNT(*) FILTER (WHERE t.priority = 'LOW') AS low_count
      FROM tickets t
      WHERE t.deleted_at IS NULL${userFilter}
    `, params);

    // ── 2. Trend: this week vs last week (by creation date) ──
    const trendResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days') AS total_this,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '14 days' AND t.created_at < NOW() - INTERVAL '7 days') AS total_last,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days' AND t.status IN ('NEW','OPEN')) AS open_this,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '14 days' AND t.created_at < NOW() - INTERVAL '7 days' AND t.status IN ('NEW','OPEN')) AS open_last,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days' AND t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS inp_this,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '14 days' AND t.created_at < NOW() - INTERVAL '7 days' AND t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS inp_last,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days' AND t.status IN ('PENDING','ON_HOLD')) AS pend_this,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '14 days' AND t.created_at < NOW() - INTERVAL '7 days' AND t.status IN ('PENDING','ON_HOLD')) AS pend_last,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days' AND t.status = 'RESOLVED') AS res_this,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '14 days' AND t.created_at < NOW() - INTERVAL '7 days' AND t.status = 'RESOLVED') AS res_last,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days' AND t.status = 'CLOSED') AS clos_this,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '14 days' AND t.created_at < NOW() - INTERVAL '7 days' AND t.status = 'CLOSED') AS clos_last
      FROM tickets t
      WHERE t.deleted_at IS NULL${userFilter}
    `, params);

    // ── 3. Chart data: date-range daily counts ──────────
    const chartParams = !isAdmin
      ? [chartStart, chartEnd, userId]
      : [chartStart, chartEnd];
    const chartResult = await pool.query(`
      SELECT
        TO_CHAR(days.day, 'Mon DD') AS date,
        COUNT(t.id) FILTER (WHERE t.status IN ('NEW','OPEN')) AS "Open",
        COUNT(t.id) FILTER (WHERE t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS "InProgress",
        COUNT(t.id) FILTER (WHERE t.status IN ('PENDING','ON_HOLD')) AS "Pending",
        COUNT(t.id) FILTER (WHERE t.status = 'RESOLVED') AS "Resolved",
        COUNT(t.id) FILTER (WHERE t.status = 'CLOSED') AS "Closed"
      FROM (
        SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day
      ) days
      LEFT JOIN tickets t
        ON DATE_TRUNC('day', t.created_at)::date = days.day
        AND t.deleted_at IS NULL
        ${!isAdmin ? 'AND (t.created_by = $3 OR t.assigned_to = $3)' : ''}
      GROUP BY days.day
      ORDER BY days.day ASC
    `, chartParams);

    // ── 4. SLA breaches: unresolved tickets exceeding SLA ──
    const slaResult = await pool.query(`
      SELECT t.id, t.ticket_number, t.short_description, t.priority, t.status,
             EXTRACT(EPOCH FROM (NOW() - t.created_at))/3600 AS hours_open
      FROM tickets t
      WHERE t.deleted_at IS NULL
        AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')
        AND (
          (t.priority = 'CRITICAL' AND t.created_at < NOW() - INTERVAL '4 hours')  OR
          (t.priority = 'HIGH'     AND t.created_at < NOW() - INTERVAL '8 hours')  OR
          (t.priority = 'MEDIUM'   AND t.created_at < NOW() - INTERVAL '24 hours') OR
          (t.priority = 'LOW'      AND t.created_at < NOW() - INTERVAL '72 hours')
        )
        ${!isAdmin ? 'AND (t.created_by = $1 OR t.assigned_to = $1)' : ''}
      ORDER BY
        CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
        hours_open DESC
      LIMIT 5
    `, !isAdmin ? [userId] : []);

    // ── 5. Recent tickets ─────────────────────────────────
    const recentResult = await pool.query(`
      SELECT t.id, t.ticket_number, t.short_description, t.status, t.priority,
             t.customer_name, t.updated_at,
             u2.full_name AS created_by_name,
             u3.full_name AS ticket_owner_name
      FROM tickets t
      LEFT JOIN users u2 ON t.created_by = u2.id
      LEFT JOIN users u3 ON t.ticket_owner = u3.id
      WHERE t.deleted_at IS NULL${userFilter}
      ORDER BY t.updated_at DESC
      LIMIT 20
    `, params);

    // ── Build response ────────────────────────────────────
    const s = statsResult.rows[0];
    const tr = trendResult.rows[0];

    const pendPct = pctChange(tr.pend_this, tr.pend_last);

    res.json({
      success: true,
      stats: {
        total:      parseInt(s.total),
        open:       parseInt(s.open_count),
        inProgress: parseInt(s.in_progress),
        pending:    parseInt(s.pending_count),
        resolved:   parseInt(s.resolved_count),
        closed:     parseInt(s.closed_count),
        critical:   parseInt(s.critical_count),
        high:       parseInt(s.high_count),
        medium:     parseInt(s.medium_count),
        low:        parseInt(s.low_count),
      },
      trends: {
        total:      { change: Math.abs(pctChange(tr.total_this, tr.total_last)),   up: pctChange(tr.total_this, tr.total_last) >= 0 },
        open:       { change: Math.abs(pctChange(tr.open_this, tr.open_last)),     up: pctChange(tr.open_this, tr.open_last) <= 0 },
        inProgress: { change: Math.abs(pctChange(tr.inp_this, tr.inp_last)),       up: pctChange(tr.inp_this, tr.inp_last) >= 0 },
        pending:    { change: Math.abs(pendPct),                                   up: pendPct <= 0 },
        resolved:   { change: Math.abs(pctChange(tr.res_this, tr.res_last)),       up: pctChange(tr.res_this, tr.res_last) >= 0 },
        closed:     { change: Math.abs(pctChange(tr.clos_this, tr.clos_last)),     up: pctChange(tr.clos_this, tr.clos_last) >= 0 },
      },
      chartData: chartResult.rows.map(r => ({
        date:       r.date,
        Open:       parseInt(r.Open),
        InProgress: parseInt(r.InProgress),
        Pending:    parseInt(r.Pending),
        Resolved:   parseInt(r.Resolved),
        Closed:     parseInt(r.Closed),
      })),
      slaBreaches: slaResult.rows.map(r => ({
        id:       r.ticket_number,
        ticketId: r.id,
        title:    r.short_description,
        priority: r.priority,
        time:     formatDuration(r.hours_open),
        hoursOpen: parseFloat(r.hours_open),
      })),
      recentTickets: recentResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
