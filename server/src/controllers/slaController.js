const pool = require('../db/pool');
const { getTicketSLAs } = require('../services/slaService');

async function listDefinitions(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sla_definitions ORDER BY start_status, created_at'
    );
    res.json({ success: true, definitions: rows });
  } catch (err) { next(err); }
}

async function createDefinition(req, res, next) {
  try {
    const {
      name, description = '', start_status,
      stop_statuses  = ['RESOLVED','CLOSED','CANCELLED'],
      pause_statuses = ['ON_HOLD','PENDING'],
      duration_minutes, warn_pct = 50, critical_pct = 75,
      notify_on_warn = true, notify_on_critical = true, notify_on_breach = true,
      is_active = true,
    } = req.body;

    if (!name?.trim() || !start_status || !duration_minutes) {
      return res.status(400).json({ success: false, message: 'name, start_status and duration_minutes are required' });
    }

    const { rows } = await pool.query(`
      INSERT INTO sla_definitions
        (name, description, start_status, stop_statuses, pause_statuses,
         duration_minutes, warn_pct, critical_pct,
         notify_on_warn, notify_on_critical, notify_on_breach, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      name.trim(), description, start_status,
      JSON.stringify(stop_statuses), JSON.stringify(pause_statuses),
      parseInt(duration_minutes), warn_pct, critical_pct,
      notify_on_warn, notify_on_critical, notify_on_breach, is_active,
    ]);
    res.status(201).json({ success: true, definition: rows[0] });
  } catch (err) { next(err); }
}

async function updateDefinition(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name, description, start_status,
      stop_statuses, pause_statuses,
      duration_minutes, warn_pct, critical_pct,
      notify_on_warn, notify_on_critical, notify_on_breach, is_active,
    } = req.body;

    const existing = await pool.query('SELECT * FROM sla_definitions WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'SLA definition not found' });
    const d = existing.rows[0];

    const { rows } = await pool.query(`
      UPDATE sla_definitions SET
        name             = $1,
        description      = $2,
        start_status     = $3,
        stop_statuses    = $4,
        pause_statuses   = $5,
        duration_minutes = $6,
        warn_pct         = $7,
        critical_pct     = $8,
        notify_on_warn   = $9,
        notify_on_critical = $10,
        notify_on_breach = $11,
        is_active        = $12,
        updated_at       = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      name?.trim()        ?? d.name,
      description         ?? d.description,
      start_status        ?? d.start_status,
      JSON.stringify(stop_statuses  ?? d.stop_statuses),
      JSON.stringify(pause_statuses ?? d.pause_statuses),
      parseInt(duration_minutes ?? d.duration_minutes),
      warn_pct            ?? d.warn_pct,
      critical_pct        ?? d.critical_pct,
      notify_on_warn      ?? d.notify_on_warn,
      notify_on_critical  ?? d.notify_on_critical,
      notify_on_breach    ?? d.notify_on_breach,
      is_active           ?? d.is_active,
      id,
    ]);
    res.json({ success: true, definition: rows[0] });
  } catch (err) { next(err); }
}

async function deleteDefinition(req, res, next) {
  try {
    const { id } = req.params;
    // Soft-disable rather than hard delete to preserve history
    await pool.query('UPDATE sla_definitions SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function getTicketSLAInstances(req, res, next) {
  try {
    const instances = await getTicketSLAs(req.params.ticketId);
    res.json({ success: true, instances });
  } catch (err) { next(err); }
}

// GET /api/sla/breached — admin dashboard view
async function getBreachedTickets(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        tsi.id AS instance_id,
        tsi.stage, tsi.started_at, tsi.target_at, tsi.breached_at,
        tsi.duration_minutes, tsi.total_pause_minutes,
        sd.name AS sla_name, sd.start_status,
        t.id AS ticket_id, t.ticket_number, t.short_description,
        t.status, t.priority, t.assigned_to,
        u.full_name AS assigned_to_name
      FROM ticket_sla_instances tsi
      JOIN sla_definitions sd ON tsi.sla_definition_id = sd.id
      JOIN tickets t ON tsi.ticket_id = t.id AND t.deleted_at IS NULL
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE tsi.stage IN ('active','paused','breached')
      ORDER BY
        CASE tsi.stage WHEN 'breached' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        tsi.target_at ASC
      LIMIT 100
    `);
    res.json({ success: true, instances: rows });
  } catch (err) { next(err); }
}

module.exports = {
  listDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  getTicketSLAInstances,
  getBreachedTickets,
};
