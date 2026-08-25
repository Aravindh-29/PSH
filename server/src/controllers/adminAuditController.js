const pool = require('../db/pool');

// Fire-and-forget helper — never throws, never blocks the caller
async function logAdminAudit(userId, action, entityType, entityId, entityName, details = {}, ip = null) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (user_id, action, entity_type, entity_id, entity_name, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId || null, action, entityType, String(entityId || ''), entityName || '', JSON.stringify(details), ip || null]
    );
  } catch (e) {
    console.error('[AdminAudit]', e.message);
  }
}

async function getAdminLogs(req, res, next) {
  try {
    const { date, year, month, page = 1, limit = 50 } = req.query;
    const tz = req.query.tz || 'UTC';
    const LIMIT  = Math.min(parseInt(limit)  || 50, 200);
    const PAGE   = Math.max(parseInt(page)   || 1,  1);
    const OFFSET = (PAGE - 1) * LIMIT;

    const params  = [];
    let dateWhere = '';
    if (date) {
      params.push(date, tz);
      dateWhere = `WHERE DATE(al.created_at AT TIME ZONE $2) = $1::date`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM admin_audit_logs al ${dateWhere}`,
      params
    );
    const total = parseInt(countRes.rows[0].count);

    const logsRes = await pool.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.entity_name,
              al.details, al.ip_address, al.created_at,
              u.full_name AS admin_name, u.email AS admin_email, u.role AS admin_role
       FROM admin_audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${dateWhere}
       ORDER BY al.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, LIMIT, OFFSET]
    );

    // Active days for calendar dots
    let activeDays = [];
    if (year && month) {
      const activeRes = await pool.query(
        `SELECT DISTINCT DATE(created_at AT TIME ZONE $1)::text AS day
         FROM admin_audit_logs
         WHERE EXTRACT(YEAR  FROM created_at AT TIME ZONE $1) = $2
           AND EXTRACT(MONTH FROM created_at AT TIME ZONE $1) = $3`,
        [tz, parseInt(year), parseInt(month)]
      );
      activeDays = activeRes.rows.map(r => r.day);
    }

    const adminSet = new Set(logsRes.rows.map(r => r.admin_name).filter(Boolean));

    res.json({
      success: true,
      logs: logsRes.rows,
      summary: { total, admins: adminSet.size },
      activeDays,
      pagination: { page: PAGE, limit: LIMIT, total, pages: Math.ceil(total / LIMIT) || 1 },
    });
  } catch (err) { next(err); }
}

module.exports = { logAdminAudit, getAdminLogs };
