/**
 * Seeds audit_log entries for existing tickets.
 * Each ticket gets a CREATED entry; older/resolved tickets get additional UPDATE entries.
 * Run: node reseed-audit.js
 */

require('./server/node_modules/dotenv').config({ path: './.env' });
const { Pool } = require('./server/node_modules/pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function addHours(dateStr, h, m = 0) {
  const d = new Date(dateStr);
  d.setUTCHours(d.getUTCHours() + h, d.getUTCMinutes() + m);
  return d.toISOString();
}

const statusChanges = [
  ['NEW', 'OPEN'], ['OPEN', 'IN_PROGRESS'], ['IN_PROGRESS', 'WORK_IN_PROGRESS'],
  ['IN_PROGRESS', 'PENDING'], ['PENDING', 'IN_PROGRESS'], ['IN_PROGRESS', 'RESOLVED'],
  ['RESOLVED', 'CLOSED'], ['OPEN', 'RESOLVED'], ['NEW', 'IN_PROGRESS'],
];
const priorityChanges = [['LOW','MEDIUM'],['MEDIUM','HIGH'],['HIGH','CRITICAL'],['MEDIUM','LOW']];
const fieldLabels = {
  status:           'Status',
  priority:         'Priority',
  short_description:'Short Description',
  customer_name:    'Customer / Client',
  impact:           'Impact',
  urgency:          'Urgency',
};

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected.');

    // Fetch all tickets
    const tRes = await client.query(
      `SELECT id, ticket_number, status, priority, created_by, ticket_owner, created_at
       FROM tickets WHERE deleted_at IS NULL ORDER BY created_at ASC`
    );
    const tickets = tRes.rows;
    console.log(`Found ${tickets.length} tickets.`);

    // Fetch all users
    const uRes = await client.query(`SELECT id, username, role FROM users`);
    const users = uRes.rows;
    const adminUser = users.find(u => u.role === 'admin');
    const empUsers  = users.filter(u => u.role === 'employee');
    const allUsers  = users;

    // Clear existing audit logs
    await client.query('DELETE FROM ticket_audit_logs');
    console.log('Cleared audit logs.');

    let totalInserted = 0;

    for (const ticket of tickets) {
      const creator = allUsers.find(u => u.id === ticket.created_by) || adminUser;
      const createdAt = new Date(ticket.created_at);

      // ── 1. CREATED entry ────────────────────────────────────────────
      await client.query(
        `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, created_at)
         VALUES ($1,$2,'CREATED',NULL,NULL,$3,$4)`,
        [ticket.id, creator.id, ticket.ticket_number, ticket.created_at]
      );
      totalInserted++;

      // ── 2. Update entries — older tickets get more history ───────────
      const ageHours = (Date.now() - createdAt.getTime()) / 3600000;

      // Tickets > 3 days old get status progression
      if (ageHours > 72) {
        const [fromSt, toSt] = pick(statusChanges);
        const editor = pick(allUsers);
        await client.query(
          `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, created_at)
           VALUES ($1,$2,'UPDATED','status',$3,$4,$5)`,
          [ticket.id, editor.id, fromSt, toSt, addHours(ticket.created_at, 2)]
        );
        totalInserted++;
      }

      // Tickets > 5 days old get a second status change
      if (ageHours > 120) {
        const [fromSt2, toSt2] = pick(statusChanges);
        const editor2 = pick(allUsers);
        await client.query(
          `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, created_at)
           VALUES ($1,$2,'UPDATED','status',$3,$4,$5)`,
          [ticket.id, editor2.id, fromSt2, toSt2, addHours(ticket.created_at, 24)]
        );
        totalInserted++;
      }

      // ~40% of tickets get a priority change
      if (Math.random() < 0.4 && ageHours > 48) {
        const [fromPr, toPr] = pick(priorityChanges);
        const editor = pick(allUsers);
        await client.query(
          `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, created_at)
           VALUES ($1,$2,'UPDATED','priority',$3,$4,$5)`,
          [ticket.id, editor.id, fromPr, toPr, addHours(ticket.created_at, 1, 30)]
        );
        totalInserted++;
      }

      // ~25% of tickets get an impact/urgency update
      if (Math.random() < 0.25 && ageHours > 24) {
        const field = pick(['impact', 'urgency']);
        const vals = ['LOW','MEDIUM','HIGH'];
        const old = pick(vals), nw = pick(vals.filter(v => v !== old));
        const editor = pick(allUsers);
        await client.query(
          `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, created_at)
           VALUES ($1,$2,'UPDATED',$3,$4,$5,$6)`,
          [ticket.id, editor.id, field, old, nw, addHours(ticket.created_at, 4)]
        );
        totalInserted++;
      }

      // Resolved/Closed tickets get a final closure entry
      if (['RESOLVED','CLOSED'].includes(ticket.status)) {
        const closer = pick(allUsers);
        await client.query(
          `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, created_at)
           VALUES ($1,$2,'UPDATED','status','IN_PROGRESS',$3,$4)`,
          [ticket.id, closer.id, ticket.status, addHours(ticket.created_at, 48)]
        );
        totalInserted++;
      }
    }

    console.log(`\nDone! ${totalInserted} audit log entries inserted across ${tickets.length} tickets.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
