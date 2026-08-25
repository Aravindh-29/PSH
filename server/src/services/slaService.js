const pool = require('../db/pool');
const logger = require('../utils/logger');

// Called inside a transaction client on every status change.
// client: pg transaction client (from ticketController)
async function onStatusChange(client, ticketId, oldStatus, newStatus) {
  try {
    // Respect global SLA toggle
    const { rows: settings } = await client.query('SELECT is_enabled FROM sla_settings WHERE id = 1');
    if (!settings[0]?.is_enabled) return;

    const { rows: defs } = await client.query(
      'SELECT * FROM sla_definitions WHERE is_active = true'
    );

    for (const def of defs) {
      const stopStatuses  = Array.isArray(def.stop_statuses)  ? def.stop_statuses  : [];
      const pauseStatuses = Array.isArray(def.pause_statuses) ? def.pause_statuses : [];

      // A. Complete active/paused instances when entering a STOP status
      if (stopStatuses.includes(newStatus)) {
        await client.query(`
          UPDATE ticket_sla_instances
          SET stage = 'completed', completed_at = NOW()
          WHERE ticket_id = $1 AND sla_definition_id = $2 AND stage IN ('active','paused')
        `, [ticketId, def.id]);
      }

      // B. Pause active instances when entering a PAUSE status
      if (pauseStatuses.includes(newStatus)) {
        await client.query(`
          UPDATE ticket_sla_instances
          SET stage = 'paused', pause_started_at = NOW()
          WHERE ticket_id = $1 AND sla_definition_id = $2 AND stage = 'active'
        `, [ticketId, def.id]);
      }

      // C. Resume paused instances when leaving a PAUSE status (and not going to STOP)
      if (pauseStatuses.includes(oldStatus) && !pauseStatuses.includes(newStatus) && !stopStatuses.includes(newStatus)) {
        const { rows: paused } = await client.query(`
          SELECT * FROM ticket_sla_instances
          WHERE ticket_id = $1 AND sla_definition_id = $2 AND stage = 'paused'
        `, [ticketId, def.id]);

        for (const inst of paused) {
          if (!inst.pause_started_at) continue;
          const pausedMs = Date.now() - new Date(inst.pause_started_at).getTime();
          const pausedMinutes = pausedMs / 60000;
          const newTotalPause = parseFloat(inst.total_pause_minutes) + pausedMinutes;
          // Push the target forward by the time spent paused
          const newTargetAt = new Date(new Date(inst.target_at).getTime() + pausedMs);
          await client.query(`
            UPDATE ticket_sla_instances
            SET stage = 'active',
                pause_started_at = NULL,
                total_pause_minutes = $3,
                target_at = $4
            WHERE id = $5
          `, [ticketId, def.id, newTotalPause, newTargetAt, inst.id]);
        }
      }

      // D. Start a new instance when entering the START status (if none active/paused)
      if (def.start_status === newStatus && !stopStatuses.includes(newStatus)) {
        const { rows: existing } = await client.query(`
          SELECT id FROM ticket_sla_instances
          WHERE ticket_id = $1 AND sla_definition_id = $2 AND stage IN ('active','paused')
        `, [ticketId, def.id]);

        if (existing.length === 0) {
          const targetAt = new Date(Date.now() + def.duration_minutes * 60000);
          await client.query(`
            INSERT INTO ticket_sla_instances
              (ticket_id, sla_definition_id, duration_minutes, started_at, target_at)
            VALUES ($1, $2, $3, NOW(), $4)
          `, [ticketId, def.id, def.duration_minutes, targetAt]);
        }
      }
    }
  } catch (err) {
    logger.error(`SLA onStatusChange error for ticket ${ticketId}`, err);
    throw err;
  }
}

// Background job: check for breaches, warn, critical thresholds.
// Returns count of newly breached instances.
async function runSLAChecker() {
  // Skip if globally disabled
  const { rows: settings } = await pool.query('SELECT is_enabled FROM sla_settings WHERE id = 1');
  if (!settings[0]?.is_enabled) return { newlyBreached: [], warnInstances: [], critInstances: [] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Mark active instances past target_at as breached
    const { rows: newlyBreached } = await client.query(`
      UPDATE ticket_sla_instances
      SET stage = 'breached', breached_at = NOW()
      WHERE stage = 'active' AND target_at <= NOW()
      RETURNING id, ticket_id, sla_definition_id, duration_minutes, started_at, target_at, total_pause_minutes
    `);

    // 2. Get instances needing warn notification (50% elapsed, not yet notified)
    const { rows: warnInstances } = await client.query(`
      SELECT tsi.*, sd.warn_pct, sd.notify_on_warn, sd.name AS sla_name
      FROM ticket_sla_instances tsi
      JOIN sla_definitions sd ON tsi.sla_definition_id = sd.id
      WHERE tsi.stage = 'active'
        AND tsi.notified_warn = FALSE
        AND sd.notify_on_warn = TRUE
        AND EXTRACT(EPOCH FROM (NOW() - tsi.started_at))/60 - tsi.total_pause_minutes
            >= (tsi.duration_minutes * sd.warn_pct / 100.0)
    `);

    // 3. Get instances needing critical notification (75% elapsed, not yet notified)
    const { rows: critInstances } = await client.query(`
      SELECT tsi.*, sd.critical_pct, sd.notify_on_critical, sd.name AS sla_name
      FROM ticket_sla_instances tsi
      JOIN sla_definitions sd ON tsi.sla_definition_id = sd.id
      WHERE tsi.stage = 'active'
        AND tsi.notified_critical = FALSE
        AND sd.notify_on_critical = TRUE
        AND EXTRACT(EPOCH FROM (NOW() - tsi.started_at))/60 - tsi.total_pause_minutes
            >= (tsi.duration_minutes * sd.critical_pct / 100.0)
    `);

    // Mark warn/critical as notified
    if (warnInstances.length) {
      const ids = warnInstances.map(r => r.id);
      await client.query(`UPDATE ticket_sla_instances SET notified_warn = TRUE WHERE id = ANY($1)`, [ids]);
    }
    if (critInstances.length) {
      const ids = critInstances.map(r => r.id);
      await client.query(`UPDATE ticket_sla_instances SET notified_critical = TRUE WHERE id = ANY($1)`, [ids]);
    }

    // Mark newly breached as notified_breach
    if (newlyBreached.length) {
      const ids = newlyBreached.map(r => r.id);
      await client.query(`UPDATE ticket_sla_instances SET notified_breach = TRUE WHERE id = ANY($1)`, [ids]);
    }

    await client.query('COMMIT');

    return { newlyBreached, warnInstances, critInstances };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('SLA checker error', err);
    return { newlyBreached: [], warnInstances: [], critInstances: [] };
  } finally {
    client.release();
  }
}

// Get SLA instances for a ticket (with definition details)
async function getTicketSLAs(ticketId) {
  const { rows } = await pool.query(`
    SELECT
      tsi.*,
      sd.name         AS sla_name,
      sd.description  AS sla_description,
      sd.start_status,
      sd.warn_pct,
      sd.critical_pct
    FROM ticket_sla_instances tsi
    JOIN sla_definitions sd ON tsi.sla_definition_id = sd.id
    WHERE tsi.ticket_id = $1
    ORDER BY tsi.created_at DESC
  `, [ticketId]);
  return rows;
}

module.exports = { onStatusChange, runSLAChecker, getTicketSLAs };
