const pool   = require('../db/pool');
const argon2 = require('argon2');
const { getTicketSLAs } = require('../services/slaService');

// Standard ITIL/ServiceNow SLA defaults
const DEFAULT_SLAS = [
  { start_status: 'NEW',              name: 'New — Acknowledgement SLA',      duration_minutes: 60,   description: 'Ticket must be acknowledged within 1 hour' },
  { start_status: 'OPEN',             name: 'Open — Response SLA',            duration_minutes: 240,  description: 'Open ticket must be picked up within 4 hours' },
  { start_status: 'ASSIGNED',         name: 'Assigned — Pickup SLA',          duration_minutes: 120,  description: 'Assignee must start work within 2 hours' },
  { start_status: 'IN_PROGRESS',      name: 'In Progress — Resolution SLA',   duration_minutes: 480,  description: 'Must progress or resolve within 8 hours' },
  { start_status: 'WORK_IN_PROGRESS', name: 'Work In Progress — Update SLA',  duration_minutes: 480,  description: 'Must be updated or resolved within 8 hours' },
  { start_status: 'PENDING',          name: 'Pending — Response Wait SLA',    duration_minutes: 1440, description: 'Max 24 hours waiting for customer response' },
  { start_status: 'ON_HOLD',          name: 'On Hold — Max Hold SLA',         duration_minutes: 2880, description: 'Ticket must not remain on hold beyond 48 hours' },
  { start_status: 'REOPENED',         name: 'Reopened — Re-response SLA',     duration_minutes: 120,  description: 'Reopened ticket must be re-addressed within 2 hours' },
];

async function verifyAdminPassword(userId, plainPassword) {
  if (!plainPassword) return false;
  const row = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!row.rows.length) return false;
  return argon2.verify(row.rows[0].password_hash, plainPassword);
}

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

async function getSettings(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM sla_settings WHERE id = 1');
    res.json({ success: true, settings: rows[0] || { is_enabled: true } });
  } catch (err) { next(err); }
}

async function toggleSettings(req, res, next) {
  try {
    const { is_enabled, adminPassword } = req.body;
    const valid = await verifyAdminPassword(req.session.userId, adminPassword);
    if (!valid) return res.status(403).json({ success: false, message: 'Incorrect admin password' });

    const { rows } = await pool.query(
      `UPDATE sla_settings SET is_enabled = $1, updated_at = NOW(), updated_by = $2 WHERE id = 1 RETURNING *`,
      [is_enabled, req.session.userId]
    );
    res.json({ success: true, settings: rows[0] });
  } catch (err) { next(err); }
}

async function applyDefaults(req, res, next) {
  try {
    const { adminPassword } = req.body;
    const valid = await verifyAdminPassword(req.session.userId, adminPassword);
    if (!valid) return res.status(403).json({ success: false, message: 'Incorrect admin password' });

    const stopStatuses  = JSON.stringify(['RESOLVED','CLOSED','CANCELLED']);
    const pauseStatuses = JSON.stringify(['ON_HOLD','PENDING']);
    let created = 0;

    for (const d of DEFAULT_SLAS) {
      // Skip if an active definition already exists for this start_status
      const existing = await pool.query(
        'SELECT id FROM sla_definitions WHERE start_status = $1 AND is_active = TRUE',
        [d.start_status]
      );
      if (existing.rows.length > 0) continue;

      await pool.query(`
        INSERT INTO sla_definitions
          (name, description, start_status, stop_statuses, pause_statuses,
           duration_minutes, warn_pct, critical_pct,
           notify_on_warn, notify_on_critical, notify_on_breach, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,50,75,TRUE,TRUE,TRUE,TRUE)
      `, [d.name, d.description, d.start_status, stopStatuses, pauseStatuses, d.duration_minutes]);
      created++;
    }

    res.json({ success: true, created, message: `${created} default SLA(s) applied` });
  } catch (err) { next(err); }
}

module.exports = {
  listDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  getTicketSLAInstances,
  getBreachedTickets,
  getSettings,
  toggleSettings,
  applyDefaults,
};
