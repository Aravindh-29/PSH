/**
 * SERV-IT — Demo data loader
 * Creates 3 employee users + 500 tickets with realistic data.
 * Run via:  sudo bash /opt/PSH/scripts/dump500tickets.sh
 */
require('dotenv').config({ path: '/opt/PSH/.env' });
const { Pool } = require('pg');
const argon2   = require('argon2');
const crypto   = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Demo users ───────────────────────────────────────────────────
const DEMO_USERS = [
  { username: 'alice.johnson', email: 'alice.johnson@company.com', fullName: 'Alice Johnson' },
  { username: 'bob.williams',  email: 'bob.williams@company.com',  fullName: 'Bob Williams'  },
  { username: 'carol.smith',   email: 'carol.smith@company.com',   fullName: 'Carol Smith'   },
];

// ── Ticket variety data ──────────────────────────────────────────
const STATUSES    = ['NEW','OPEN','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','RESOLVED','CLOSED'];
const PRIORITIES  = ['LOW','LOW','MEDIUM','MEDIUM','MEDIUM','HIGH','HIGH','CRITICAL'];
const IMPACTS     = ['LOW','MEDIUM','HIGH'];
const URGENCIES   = ['LOW','MEDIUM','HIGH'];
const MODULES     = ['Network','Storage','Cloud','Security','Hardware','Software','Database','Email','VPN','Backup'];
const CUSTOMERS   = [
  'TechCorp Inc.','Infosys Ltd.','Wipro Solutions','DataSoft LLC',
  'CloudBase Systems','NetWork Pro','Alpha Industries','Beta Services',
  'Gamma Technologies','Delta Corp','Sigma Labs','Apex Solutions',
];
const SHORT_DESCS = [
  'Unable to access email','Laptop not connecting to WiFi','VPN connection dropping',
  'Printer offline in conference room','Application crashing on startup',
  'Password reset required','Monitor display issues','Slow internet connection',
  'Cannot open PDF files','Software installation request','USB ports not working',
  'Blue screen of death','Outlook not syncing emails','Teams audio not working',
  'Request for new software license','Hard disk running out of space',
  'System running very slow','Cannot access shared drive',
  'Two-factor auth not working','Video conferencing issues',
  'Keyboard not responding','Browser keeps crashing',
  'Need access to project folder','Remote desktop connection failed',
  'Server backup failed','Database connection timeout',
  'Website unreachable from office','Excel file not opening',
  'Antivirus blocking application','Network drive not mapping',
  'CPU running at 100%','RAM upgrade request','SSD replacement needed',
  'Firewall blocking internal app','SSL certificate expired',
  'User account locked out','New hardware setup request',
  'Software license renewal','Cloud storage quota exceeded',
  'Data migration request','API integration issue',
];

const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const genPw = ()    => 'Pass' + crypto.randomBytes(3).toString('hex').toUpperCase() + '@1';

async function main() {
  console.log('');
  const passwords = {};
  const allUserIds = [];

  // ── Create 3 demo users ────────────────────────────────────────
  process.stdout.write('  Creating 3 demo users...');
  for (const u of DEMO_USERS) {
    const pw   = genPw();
    const hash = await argon2.hash(pw);
    passwords[u.username] = pw;

    const existing = await pool.query(
      `SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL`, [u.username]
    );
    let id;
    if (existing.rows.length > 0) {
      id = existing.rows[0].id;
      await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id]);
    } else {
      const r = await pool.query(
        `INSERT INTO users (username, email, full_name, password_hash, role)
         VALUES ($1,$2,$3,$4,'employee') RETURNING id`,
        [u.username, u.email, u.fullName, hash]
      );
      id = r.rows[0].id;
    }
    allUserIds.push(id);
  }
  console.log(' done');

  // Add admin to the mix for created_by/assigned_to variety
  const adminRow = await pool.query(
    `SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL`
  );
  if (adminRow.rows.length > 0) allUserIds.push(adminRow.rows[0].id);

  // Get a category id
  const catRow    = await pool.query(`SELECT id FROM categories LIMIT 1`);
  const categoryId = catRow.rows.length > 0 ? catRow.rows[0].id : null;

  // ── Generate 500 ticket numbers at once ────────────────────────
  process.stdout.write('  Generating ticket numbers...');
  const seqRows = await pool.query(
    `SELECT nextval('ticket_number_seq') AS n FROM generate_series(1,500)`
  );
  const ticketNumbers = seqRows.rows.map(r => `PSH${String(r.n).padStart(6, '0')}`);
  console.log(' done');

  // ── Insert tickets in batches of 100 ──────────────────────────
  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < 500; i += BATCH) {
    const batchNums = ticketNumbers.slice(i, i + BATCH);
    const values    = [];
    const rows      = [];

    batchNums.forEach((ticketNum, idx) => {
      const base      = idx * 13;
      const createdBy = pick(allUserIds);
      const assignedTo = Math.random() > 0.35 ? pick(allUserIds) : null;
      const daysAgo   = Math.floor(Math.random() * 180);
      const ts        = new Date(Date.now() - daysAgo * 86400000).toISOString();

      rows.push(
        `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},` +
        `$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13})`
      );
      values.push(
        ticketNum, createdBy, assignedTo,
        pick(STATUSES), pick(PRIORITIES), pick(IMPACTS), pick(URGENCIES),
        pick(SHORT_DESCS), pick(CUSTOMERS), pick(MODULES), categoryId,
        ts, ts
      );
    });

    await pool.query(
      `INSERT INTO tickets
         (ticket_number,created_by,assigned_to,status,priority,impact,urgency,
          short_description,customer_name,module_text,category_id,created_at,updated_at)
       VALUES ${rows.join(',')}`,
      values
    );

    inserted += batchNums.length;
    process.stdout.write(`\r  Inserting tickets... ${inserted}/500`);
  }
  console.log('\r  Inserting tickets... 500/500  done');

  return passwords;
}

main()
  .then(passwords => {
    const GREEN = '\x1b[32m'; const BOLD = '\x1b[1m'; const RESET = '\x1b[0m'; const CYAN = '\x1b[36m';
    console.log('');
    console.log(GREEN + BOLD + '  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║   ✓  Demo data loaded — 3 users + 500 tickets        ║');
    console.log('  ╚══════════════════════════════════════════════════════╝' + RESET);
    console.log('');
    console.log(BOLD + '  Demo employee credentials:' + RESET);
    console.log('  ─────────────────────────────────────────────────────');
    for (const [username, pw] of Object.entries(passwords)) {
      console.log(`  ${CYAN}${username.padEnd(22)}${RESET}  password: ${BOLD}${pw}${RESET}`);
    }
    console.log('  ─────────────────────────────────────────────────────');
    console.log('');
    pool.end();
  })
  .catch(err => {
    console.error('\n  Error:', err.message);
    pool.end();
    process.exit(1);
  });
