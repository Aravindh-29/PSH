/**
 * Seed script: inserts 500 realistic tickets spread across all users
 * Run: node scripts/seed-tickets.js  (from /server directory)
 */
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const STATUSES   = ['NEW','OPEN','ASSIGNED','IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','CANCELLED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];
const IMPACTS    = ['LOW','MEDIUM','HIGH'];
const URGENCIES  = ['LOW','MEDIUM','HIGH'];

const MODULES = [
  'Network Infrastructure','Active Directory','Email Services','VPN & Remote Access',
  'Hardware','Software Installation','Cybersecurity','Cloud Storage','Backup & Recovery',
  'Printing Services','Database Administration','Telephony','End-User Support',
  'Procurement','Asset Management',
];

const SUBJECTS = [
  'Cannot connect to VPN from home office',
  'Outlook not syncing emails after update',
  'Laptop battery draining faster than expected',
  'Printer offline in conference room B',
  'MFA enrollment failing for new hire',
  'Azure AD account locked after password reset',
  'Shared drive permissions incorrectly set',
  'Teams calls dropping every few minutes',
  'Monitor flickering on desktop workstation',
  'Antivirus definitions out of date across fleet',
  'JIRA unable to load project boards',
  'Slow internet on floor 3 workstations',
  'New employee onboarding — account setup needed',
  'SSL certificate expiring in 7 days on web portal',
  'Scheduled backup job failed overnight',
  'Request for Adobe Creative Cloud license',
  'Mac keyboard unresponsive after macOS update',
  'Users getting 403 on internal SharePoint site',
  'Database connection timeout in CRM application',
  'Service desk queue not routing tickets correctly',
  'WiFi drops after 15 minutes of inactivity',
  'External hard drive not recognized by system',
  'Employee offboarding — disable accounts',
  'SLA report showing incorrect resolution times',
  'Slack notifications not delivering on mobile',
  'PowerBI dashboard failing to refresh data',
  'Request to provision new VM in Azure',
  'DNS resolution errors for internal domains',
  'USB ports disabled on secure workstations',
  'Zoom meeting link expired before call started',
  'High CPU usage on production DB server',
  'Disk space alert — /var at 95% on server-01',
  'Cannot open attached PDFs in email client',
  'Firewall blocking legitimate HTTPS traffic',
  'Request for additional display monitor',
  'Windows Update causing application crashes',
  'Remote desktop session freezing intermittently',
  'DHCP lease exhaustion in branch office subnet',
  'User unable to reset password via self-service',
  'Asset inventory report showing stale data',
  'Barcode scanner not pairing via Bluetooth',
  'Application login loop on Safari browser',
  'Voicemail system not recording messages',
  'New software deployment failing via SCCM',
  'Access request for finance reporting portal',
  'RAID array degraded on NAS device',
  'Laptop overheating during video calls',
  'Quarterly access review — user list needed',
  'License compliance audit — CAL count mismatch',
  'Critical patch not applied to legacy servers',
];

const CUSTOMER_NAMES = [
  'Rajesh Patel','Ananya Sharma','Mohammed Al-Farsi','Priya Nair','Chen Wei',
  'Sarah Mitchell','David Okonkwo','Elena Vasquez','James Thornton','Fatima Hassan',
  'Lucas Ferreira','Mei Lin','Robert Kauffman','Aisha Diallo','Tom Bergström',
  'Kavya Reddy','Marco Rossi','Yuki Tanaka','Lena Müller','Carlos Mendez',
  'Amira Nkosi','William Park','Sofia Johansson','Haruto Sato','Nadia Kozlov',
  'Patrick O\'Brien','Deepa Krishnan','André Leclerc','Zanele Dlamini','Ivan Petrov',
  'Chloe Dubois','Arjun Mehta','Nina Hoffmann','Omar Abdullah','Grace Chen',
  'Samuel Osei','Isabella Martinez','Kenji Yamamoto','Alinta Watson','Soren Hansen',
  'Pooja Iyer','Liam O\'Connor','Valentina Rossi','Ahmed Mansour','Priyanka Singh',
  'Tobias Bauer','Camille Leblanc','Raj Kumar','Zara Thompson','Felix Wagner',
];

const DESCRIPTIONS = [
  'User reported the issue starting Monday morning. Attempted basic troubleshooting (restart, reconnect) without resolution. Escalation required.',
  'Reproduced on multiple devices. Likely related to the recent policy change pushed on Friday. Please investigate urgently.',
  'Ticket raised on behalf of the affected user by team lead. Impact extends to 5 other members of the same department.',
  'Issue first observed post-maintenance window. Rollback of the latest change may resolve the problem. Awaiting approval.',
  'Single user affected. Initial triage done — logs captured and attached. Assigning to Level 2 for further analysis.',
  'Widespread impact across department. Business operations partially halted. Executive visibility required.',
  'Low-impact issue but has been persisting for over a week. User has been patient but requires resolution.',
  'Intermittent issue — difficult to reproduce consistently. Workaround in place but permanent fix needed.',
  'Standard request per company onboarding procedure. All required approvals obtained from HR and manager.',
  'Security-flagged item. SLA is 4 hours. Immediate response required per InfoSec policy.',
  'Performance degradation noticed during peak hours only. Off-hours testing shows no issue. Load-related cause suspected.',
  'Third-party vendor involvement may be required. Account team has been notified. Waiting on vendor response.',
  'Duplicate of PSH000012 — merging context here for tracking purposes. Root cause identified as config drift.',
  'User followed KB article steps but issue persists. Knowledge base article may need updating after this resolution.',
  'Hardware warranty claim may apply. Asset tag logged. Procurement team to be looped in if replacement required.',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickWeighted(arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
function randDaysAgo(max) {
  return new Date(Date.now() - Math.floor(Math.random() * max) * 86400000);
}

async function seed() {
  const client = await pool.connect();
  try {
    // Fetch users
    const { rows: users } = await pool.query(`SELECT id, full_name FROM users WHERE is_active = true ORDER BY created_at`);
    if (!users.length) throw new Error('No active users found. Seed users first.');
    console.log(`Found ${users.length} users: ${users.map(u => u.full_name).join(', ')}`);

    // Fetch categories
    const { rows: categories } = await pool.query(`SELECT id, name FROM categories ORDER BY id`);
    if (!categories.length) throw new Error('No categories found.');
    console.log(`Found ${categories.length} categories.`);

    let inserted = 0;
    const TOTAL = 500;

    await client.query('BEGIN');

    for (let i = 0; i < TOTAL; i++) {
      const owner     = pick(users);
      const creator   = pick(users);
      const assignee  = Math.random() > 0.25 ? pick(users) : null;
      const category  = pick(categories);

      const status   = pickWeighted(STATUSES, [8,12,10,15,10,5,18,15,7]);
      const priority = pickWeighted(PRIORITIES, [30,35,22,13]);
      const impact   = pick(IMPACTS);
      const urgency  = pick(URGENCIES);

      const createdAt = randDaysAgo(90);
      const updatedAt = new Date(createdAt.getTime() + Math.floor(Math.random() * 7 * 86400000));

      const seqRes = await client.query(`SELECT nextval('ticket_number_seq') AS seq`);
      const ticketNumber = `PSH${String(seqRes.rows[0].seq).padStart(6, '0')}`;

      const subject  = `${pick(SUBJECTS)}`;
      const customer = pick(CUSTOMER_NAMES);
      const module   = pick(MODULES);
      const desc     = pick(DESCRIPTIONS);

      await client.query(`
        INSERT INTO tickets (
          ticket_number, customer_name, module_text, category_id,
          short_description, description, status, priority, impact, urgency,
          assigned_to, assignment_group, ticket_owner, created_by, updated_by,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13,$14,$15,$16)
      `, [
        ticketNumber, customer, module, category.id,
        subject, desc, status, priority, impact, urgency,
        assignee?.id ?? null, owner.id, creator.id, creator.id,
        createdAt, updatedAt,
      ]);

      inserted++;
      if (inserted % 50 === 0) process.stdout.write(`  ${inserted}/${TOTAL} inserted...\n`);
    }

    await client.query('COMMIT');
    console.log(`\nDone! ${inserted} tickets seeded successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
