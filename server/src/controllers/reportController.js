const pool = require('../db/pool');

async function getReport(req, res, next) {
  try {
    const userId    = req.session.userId;
    const startDate = req.query.startDate || null;
    const endDate   = req.query.endDate   || null;

    // Base params: always filter by user
    const baseParams = [userId];

    // Date clause appended when a range is selected
    let dateCond = '';
    const dateParams = [];
    if (startDate && endDate) {
      dateParams.push(startDate, endDate);
      const s = baseParams.length + 1;
      dateCond = `AND t.created_at >= $${s}::date AND t.created_at < ($${s + 1}::date + INTERVAL '1 day')`;
    }
    const filteredParams = [...baseParams, ...dateParams];

    const summaryResult = await pool.query(`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE t.status IN ('NEW','OPEN'))                   AS open_count,
        COUNT(*) FILTER (WHERE t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS in_progress_count,
        COUNT(*) FILTER (WHERE t.status IN ('PENDING','ON_HOLD'))            AS pending_count,
        COUNT(*) FILTER (WHERE t.status = 'RESOLVED')                        AS resolved_count,
        COUNT(*) FILTER (WHERE t.status = 'CLOSED')                          AS closed_count,
        COUNT(*) FILTER (WHERE t.priority = 'CRITICAL')                      AS critical_count,
        COUNT(*) FILTER (WHERE t.priority = 'HIGH')                          AS high_count,
        AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600)
          FILTER (WHERE t.status IN ('RESOLVED','CLOSED'))                   AS avg_resolution_hours
      FROM tickets t
      WHERE t.deleted_at IS NULL AND t.created_by = $1 ${dateCond}
    `, filteredParams);

    // Monthly / weekly charts always show fixed 12-month / 12-week windows for trend context
    const monthlyResult = await pool.query(`
      SELECT
        TO_CHAR(months.month, 'Mon YYYY') AS label,
        COUNT(t.id)                        AS created,
        COUNT(t.id) FILTER (WHERE t.status = 'RESOLVED') AS resolved,
        COUNT(t.id) FILTER (WHERE t.status = 'CLOSED')   AS closed
      FROM (
        SELECT DATE_TRUNC('month', NOW() - (n || ' months')::INTERVAL)::date AS month
        FROM generate_series(11, 0, -1) AS n
      ) months
      LEFT JOIN tickets t
        ON DATE_TRUNC('month', t.created_at)::date = months.month
        AND t.deleted_at IS NULL
        AND t.created_by = $1
      GROUP BY months.month
      ORDER BY months.month ASC
    `, baseParams);

    const weeklyResult = await pool.query(`
      SELECT
        TO_CHAR(weeks.week_start, 'Mon DD') AS label,
        COUNT(t.id)                          AS created,
        COUNT(t.id) FILTER (WHERE t.status = 'RESOLVED') AS resolved
      FROM (
        SELECT DATE_TRUNC('week', NOW() - (n || ' weeks')::INTERVAL)::date AS week_start
        FROM generate_series(11, 0, -1) AS n
      ) weeks
      LEFT JOIN tickets t
        ON DATE_TRUNC('week', t.created_at)::date = weeks.week_start
        AND t.deleted_at IS NULL
        AND t.created_by = $1
      GROUP BY weeks.week_start
      ORDER BY weeks.week_start ASC
    `, baseParams);

    const statusResult = await pool.query(`
      SELECT t.status AS name, COUNT(*) AS value
      FROM tickets t
      WHERE t.deleted_at IS NULL AND t.created_by = $1 ${dateCond}
      GROUP BY t.status
      ORDER BY value DESC
    `, filteredParams);

    const priorityResult = await pool.query(`
      SELECT t.priority AS name, COUNT(*) AS value
      FROM tickets t
      WHERE t.deleted_at IS NULL AND t.created_by = $1 ${dateCond}
      GROUP BY t.priority
      ORDER BY CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END
    `, filteredParams);

    const allTicketsResult = await pool.query(`
      SELECT
        t.ticket_number, t.short_description, t.customer_name,
        COALESCE(t.module_text, m.name, '') AS module_name,
        COALESCE(c.name, '')                AS category_name,
        t.status, t.priority, t.impact, t.urgency,
        u2.full_name AS created_by_name,
        u3.full_name AS ticket_owner_name,
        t.created_at, t.updated_at,
        t.custom_data
      FROM tickets t
      LEFT JOIN modules m    ON t.module_id = m.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u2     ON t.created_by = u2.id
      LEFT JOIN users u3     ON t.ticket_owner = u3.id
      WHERE t.deleted_at IS NULL AND t.created_by = $1 ${dateCond}
      ORDER BY t.created_at DESC
    `, filteredParams);

    const s = summaryResult.rows[0];
    res.json({
      success: true,
      summary: {
        total:      parseInt(s.total),
        open:       parseInt(s.open_count),
        inProgress: parseInt(s.in_progress_count),
        pending:    parseInt(s.pending_count),
        resolved:   parseInt(s.resolved_count),
        closed:     parseInt(s.closed_count),
        critical:   parseInt(s.critical_count),
        high:       parseInt(s.high_count),
        avgResolutionHours: s.avg_resolution_hours
          ? parseFloat(parseFloat(s.avg_resolution_hours).toFixed(1))
          : null,
      },
      monthly: monthlyResult.rows.map(r => ({
        label:    r.label,
        Created:  parseInt(r.created),
        Resolved: parseInt(r.resolved),
        Closed:   parseInt(r.closed),
      })),
      weekly: weeklyResult.rows.map(r => ({
        label:    r.label,
        Created:  parseInt(r.created),
        Resolved: parseInt(r.resolved),
      })),
      byStatus:   statusResult.rows.map(r => ({ name: r.name.replace(/_/g, ' '), value: parseInt(r.value) })),
      byPriority: priorityResult.rows.map(r => ({ name: r.name, value: parseInt(r.value) })),
      allTickets: allTicketsResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

async function getGlobalReport(req, res, next) {
  try {
    const [summaryRes, usersRes, monthlyRes, weeklyRes, statusRes, priorityRes, employeeRes, allTicketsRes] =
      await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)                                                                    AS total,
            COUNT(*) FILTER (WHERE t.status IN ('NEW','OPEN'))                         AS open_count,
            COUNT(*) FILTER (WHERE t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS in_progress_count,
            COUNT(*) FILTER (WHERE t.status IN ('PENDING','ON_HOLD'))                  AS pending_count,
            COUNT(*) FILTER (WHERE t.status = 'RESOLVED')                              AS resolved_count,
            COUNT(*) FILTER (WHERE t.status = 'CLOSED')                                AS closed_count,
            COUNT(*) FILTER (WHERE t.priority = 'CRITICAL')                            AS critical_count,
            COUNT(*) FILTER (WHERE t.priority = 'HIGH')                                AS high_count,
            AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))/3600)
              FILTER (WHERE t.status IN ('RESOLVED','CLOSED'))                         AS avg_resolution_hours
          FROM tickets t WHERE t.deleted_at IS NULL
        `),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active = true) AS active FROM users`),
        pool.query(`
          SELECT TO_CHAR(months.month, 'Mon YYYY') AS label,
                 COUNT(t.id) AS created,
                 COUNT(t.id) FILTER (WHERE t.status = 'RESOLVED') AS resolved,
                 COUNT(t.id) FILTER (WHERE t.status = 'CLOSED')   AS closed
          FROM (SELECT DATE_TRUNC('month', NOW() - (n||' months')::INTERVAL)::date AS month
                FROM generate_series(11,0,-1) n) months
          LEFT JOIN tickets t ON DATE_TRUNC('month', t.created_at)::date = months.month AND t.deleted_at IS NULL
          GROUP BY months.month ORDER BY months.month ASC
        `),
        pool.query(`
          SELECT TO_CHAR(weeks.week_start, 'Mon DD') AS label,
                 COUNT(t.id) AS created,
                 COUNT(t.id) FILTER (WHERE t.status = 'RESOLVED') AS resolved
          FROM (SELECT DATE_TRUNC('week', NOW() - (n||' weeks')::INTERVAL)::date AS week_start
                FROM generate_series(11,0,-1) n) weeks
          LEFT JOIN tickets t ON DATE_TRUNC('week', t.created_at)::date = weeks.week_start AND t.deleted_at IS NULL
          GROUP BY weeks.week_start ORDER BY weeks.week_start ASC
        `),
        pool.query(`
          SELECT t.status AS name, COUNT(*) AS value FROM tickets t
          WHERE t.deleted_at IS NULL GROUP BY t.status ORDER BY value DESC
        `),
        pool.query(`
          SELECT t.priority AS name, COUNT(*) AS value FROM tickets t
          WHERE t.deleted_at IS NULL GROUP BY t.priority
          ORDER BY CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END
        `),
        pool.query(`
          SELECT u.id, u.full_name, u.email, u.username, u.role, u.is_active,
            COUNT(t.id)                                                             AS total_tickets,
            COUNT(t.id) FILTER (WHERE t.status IN ('NEW','OPEN'))                  AS open_tickets,
            COUNT(t.id) FILTER (WHERE t.status IN ('IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED')) AS inp_tickets,
            COUNT(t.id) FILTER (WHERE t.status = 'RESOLVED')                       AS resolved_tickets,
            COUNT(t.id) FILTER (WHERE t.status = 'CLOSED')                         AS closed_tickets,
            COUNT(t.id) FILTER (WHERE t.priority = 'CRITICAL')                     AS critical_tickets,
            AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))/3600)
              FILTER (WHERE t.status IN ('RESOLVED','CLOSED'))                      AS avg_resolution_hours
          FROM users u
          LEFT JOIN tickets t ON t.created_by = u.id AND t.deleted_at IS NULL
          GROUP BY u.id, u.full_name, u.email, u.username, u.role, u.is_active
          ORDER BY total_tickets DESC, u.full_name ASC
        `),
        pool.query(`
          SELECT t.ticket_number, t.short_description, t.customer_name,
                 COALESCE(t.module_text, m.name, '') AS module_name,
                 COALESCE(c.name, '')                AS category_name,
                 t.status, t.priority, t.impact, t.urgency,
                 u2.full_name AS created_by_name, u3.full_name AS ticket_owner_name,
                 t.created_at, t.updated_at, t.custom_data
          FROM tickets t
          LEFT JOIN modules m    ON t.module_id = m.id
          LEFT JOIN categories c ON t.category_id = c.id
          LEFT JOIN users u2     ON t.created_by = u2.id
          LEFT JOIN users u3     ON t.ticket_owner = u3.id
          WHERE t.deleted_at IS NULL
          ORDER BY t.created_at DESC
          LIMIT 500
        `),
      ]);

    const s = summaryRes.rows[0];
    const u = usersRes.rows[0];
    res.json({
      success: true,
      summary: {
        total:       parseInt(s.total),
        open:        parseInt(s.open_count),
        inProgress:  parseInt(s.in_progress_count),
        pending:     parseInt(s.pending_count),
        resolved:    parseInt(s.resolved_count),
        closed:      parseInt(s.closed_count),
        critical:    parseInt(s.critical_count),
        high:        parseInt(s.high_count),
        totalUsers:  parseInt(u.total),
        activeUsers: parseInt(u.active),
        avgResolutionHours: s.avg_resolution_hours
          ? parseFloat(parseFloat(s.avg_resolution_hours).toFixed(1)) : null,
      },
      monthly:    monthlyRes.rows.map(r => ({ label: r.label, Created: parseInt(r.created), Resolved: parseInt(r.resolved), Closed: parseInt(r.closed) })),
      weekly:     weeklyRes.rows.map(r => ({ label: r.label, Created: parseInt(r.created), Resolved: parseInt(r.resolved) })),
      byStatus:   statusRes.rows.map(r => ({ name: r.name.replace(/_/g, ' '), value: parseInt(r.value) })),
      byPriority: priorityRes.rows.map(r => ({ name: r.name, value: parseInt(r.value) })),
      employees:  employeeRes.rows.map(r => ({
        id: r.id, fullName: r.full_name, email: r.email, username: r.username,
        role: r.role, isActive: r.is_active,
        total:      parseInt(r.total_tickets),
        open:       parseInt(r.open_tickets),
        inProgress: parseInt(r.inp_tickets),
        resolved:   parseInt(r.resolved_tickets),
        closed:     parseInt(r.closed_tickets),
        critical:   parseInt(r.critical_tickets),
        avgResolutionHours: r.avg_resolution_hours
          ? parseFloat(parseFloat(r.avg_resolution_hours).toFixed(1)) : null,
      })),
      allTickets: allTicketsRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getReport, getGlobalReport };
