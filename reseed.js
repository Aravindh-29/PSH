/**
 * Reseed script — clears all ticket data and inserts ~65 realistic tickets
 * spanning 2026-07-20 to 2026-08-19 (yesterday).
 * Run: node reseed.js
 */

require('./server/node_modules/dotenv').config({ path: './.env' });
const { Pool } = require('./server/node_modules/pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────

// Returns a timestamp string within the given day at a random hour:minute
function ts(yyyy, mm, dd, hh, min) {
  const p = (n) => String(n).padStart(2, '0');
  return `${yyyy}-${p(mm)}-${p(dd)} ${p(hh)}:${p(min)}:00+00`;
}

// Pick a random element from an array
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Ticket data ───────────────────────────────────────────────────────────────

const subjects = [
  ['Disk space alert — /var at 95% on srv-prod-01', 'Server /var partition has reached 95% capacity. Services may stop writing logs. Immediate cleanup or expansion required.'],
  ['VPN client fails to connect after Windows update', 'After applying KB5034441, employees cannot connect to the corporate VPN. Error: "Authentication failed".'],
  ['Outlook not syncing emails since this morning', 'User reports Outlook desktop client stopped syncing at 08:30. Webmail works fine. Likely profile corruption.'],
  ['Printer offline in conference room B', 'HP LaserJet M404dn shows offline in print queue. Physical inspection shows paper jam cleared but still shows offline.'],
  ['Cannot access SharePoint document library', 'User receives "Access Denied" when opening the shared documents library. Was working yesterday.'],
  ['Azure AD account locked after password reset', 'User account locked 15 minutes after a self-service password reset. MFA still showing old device.'],
  ['Laptop battery not charging — ThinkPad X1 Carbon', 'Battery icon shows plugged in but not charging. Tried different power adapters. Battery health check needed.'],
  ['Firewall blocking legitimate HTTPS traffic', 'Several outbound HTTPS connections to approved SaaS vendors being blocked by the perimeter firewall since 14:00.'],
  ['Mac keyboard unresponsive after macOS Ventura update', 'Bluetooth keyboard stopped working after OS update. USB keyboard works. Bluetooth driver reinstall needed.'],
  ['Database connection pool exhausted on api-gateway', 'Application logs show "connection pool exhausted" errors. DB server CPU is normal but max_connections hit.'],
  ['Wi-Fi drops every 30 minutes in Building 3', 'Multiple users in Building 3 (floors 2-4) experience Wi-Fi disconnections every ~30 minutes since Monday.'],
  ['New employee onboarding — request user accounts', 'New hire starting Monday needs accounts: AD, Slack, GitHub, Jira, and VPN certificate provisioned.'],
  ['SSL certificate expiry on api.internal in 7 days', 'SSL certificate for api.internal expires in 7 days. Needs renewal and deployment before expiry.'],
  ['Slow response times on customer-facing portal', 'Portal response times degraded from ~200ms to ~4s. APM shows slow DB queries. Investigation required.'],
  ['Email phishing campaign targeting Finance team', 'Security team detected a spear-phishing campaign targeting Finance. 3 employees clicked the link. Contain and remediate.'],
  ['Request to provision new S3 bucket for backups', 'Infrastructure team requests a new S3 bucket (us-east-1) with versioning and lifecycle rules for DB backups.'],
  ['JIRA instance running out of disk on server', 'JIRA server disk at 88%. Attachments and log files growing fast. Need disk expansion or cleanup.'],
  ['CCTV camera feed lost in Parking Lot A', 'Camera #07 in Parking Lot A not showing feed since last night. Possible power or cable issue.'],
  ['Request for elevated permissions on prod DB', 'Developer requests temporary read-only access to production PostgreSQL for debugging a production issue.'],
  ['Teams calls dropping after network switch replacement', 'Microsoft Teams calls dropping mid-conversation. Issue started after the core switch replacement yesterday.'],
  ['Antivirus flagging internal tool as malware', 'CrowdStrike flagging deploy-tool.exe as suspicious. Need whitelist exception after verification.'],
  ['Jenkins pipeline failing on build stage', 'CI/CD pipeline for main branch failing at the Docker build stage. Error: "no space left on device".'],
  ['Request to increase Office 365 mailbox quota', 'User mailbox at 49.8 GB (limit 50 GB). Requesting quota increase to 100 GB or archive policy.'],
  ['NTP desync detected on 3 production servers', 'Monitoring alert: NTP drift > 2 seconds on srv-prod-02, 03, 04. Needs chrony service restart.'],
  ['User unable to log in after account migration', 'Following AD domain migration, 5 users cannot log in. Profiles not yet migrated to new domain controller.'],
  ['Kafka broker disk usage at 90%', 'Kafka broker kafka-01 disk at 90%. Log retention policy needs adjustment or storage expansion.'],
  ['Zoom room equipment not detecting in conference hall', 'Zoom room camera and microphone not recognized after power cycle. Likely USB hub issue.'],
  ['Request to create distribution group for project', 'Project team requests a new Exchange distribution group "project-atlas@company.com" for 12 members.'],
  ['Memory leak in order-service causing OOM crashes', 'Order service pod restarting every ~6 hours due to OOM kill. Heap profiling shows unbounded cache growth.'],
  ['Backup job failed for SQL Server overnight', 'Nightly SQL Server backup job failed at 02:15. Error: "backup device is unavailable". Check VSS service.'],
  ['Request to reset 2FA for remote employee', 'Remote employee lost phone with authenticator app. Needs 2FA reset with identity verification process.'],
  ['Load balancer health checks failing for app-server-02', 'HAProxy marking app-server-02 as DOWN due to failed health checks. Server is up but health endpoint returning 503.'],
  ['Unauthorized login attempt detected from unknown IP', 'Security alert: 47 failed login attempts to admin panel from IP 185.220.x.x. Account not compromised. Needs IP block.'],
  ['Scheduled maintenance — patch Tuesday servers', 'Monthly patch Tuesday maintenance for 12 production servers. Scheduled 22:00-02:00 Saturday. Change approval needed.'],
  ['Request: migrate legacy app from Python 2.7 to 3.11', 'Legacy billing service still running Python 2.7. Migration to 3.11 required before end of quarter.'],
  ['GitHub Actions runner out of disk space', 'Self-hosted GitHub Actions runner running out of disk. Docker image cache needs pruning. Cron job needed.'],
  ['SLA breach risk — ticket open >72h unassigned', 'Ticket PSH escalation: high-priority ticket open for 72+ hours without owner assignment. Needs escalation.'],
  ['Grafana dashboard not loading after upgrade', 'After Grafana upgrade from 9.x to 10.x, several dashboards returning "panel plugin not found" errors.'],
  ['Request to provision dev environment for new project', 'Dev team requests new Kubernetes namespace with resource quotas and RBAC for Project Phoenix.'],
  ['Network drive mapping broken after GP update', 'Group Policy update pushed last night broke mapped network drives for ~30 users. Drive letter conflicts.'],
];

const customers = [
  'TechCorp Inc.', 'Finova Ltd.', 'CloudBase Systems',
  'MedTech Corp.', 'RetailMax Inc.', 'Synapse Analytics',
  'PrimeLink Solutions', 'Nexora Group',
];

const statuses = [
  'NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS',
  'PENDING','ON_HOLD','RESOLVED','CLOSED','CANCELLED'
];

const priorities = ['LOW','LOW','MEDIUM','MEDIUM','MEDIUM','HIGH','HIGH','CRITICAL'];
const impacts   = ['LOW','MEDIUM','MEDIUM','HIGH'];
const urgencies = ['LOW','MEDIUM','MEDIUM','HIGH'];

// Tickets distributed over 31 days (Jul 20 – Aug 19)
// Each day gets 2-3 tickets; statuses skew older=resolved, newer=open
const ticketDefs = [];

// Helper: day offset 0 = Jul 20, 30 = Aug 19
function dayToDate(offset) {
  const base = new Date('2026-07-20T00:00:00Z');
  base.setDate(base.getDate() + offset);
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}

function statusForAge(dayOffset) {
  // Older tickets → resolved/closed; recent → open/in-progress
  if (dayOffset < 7)  return pick(['RESOLVED','RESOLVED','CLOSED','CLOSED','PENDING']);
  if (dayOffset < 15) return pick(['RESOLVED','CLOSED','IN_PROGRESS','ON_HOLD','PENDING','WORK_IN_PROGRESS']);
  if (dayOffset < 22) return pick(['OPEN','IN_PROGRESS','WORK_IN_PROGRESS','ASSIGNED','RESOLVED','PENDING']);
  return pick(['NEW','NEW','OPEN','IN_PROGRESS','ASSIGNED','PENDING']);
}

let subjIndex = 0;
for (let d = 0; d <= 30; d++) {
  const count = d % 3 === 0 ? 3 : 2;
  for (let t = 0; t < count; t++) {
    const s = subjects[subjIndex % subjects.length];
    subjIndex++;
    const { year, month, day } = dayToDate(d);
    const hour = 7 + Math.floor(Math.random() * 11);    // 07-17
    const min  = Math.floor(Math.random() * 60);
    // updated_at is 0-24h after created_at (with a bit of randomness)
    const updHour = Math.min(23, hour + Math.floor(Math.random() * 5));
    const updMin  = Math.floor(Math.random() * 60);
    ticketDefs.push({
      subject: s[0],
      description: s[1],
      priority: pick(priorities),
      impact:   pick(impacts),
      urgency:  pick(urgencies),
      customer: pick(customers),
      status: statusForAge(d),
      createdTs: ts(year, month, day, hour, min),
      updatedTs: ts(year, month, day, updHour, updMin),
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected to database.');

    // 1. Fetch user IDs
    const usersRes = await client.query(
      `SELECT id, username, full_name, role FROM users ORDER BY role DESC, full_name ASC`
    );
    const users = usersRes.rows;
    const admin   = users.find(u => u.role === 'admin');
    const employees = users.filter(u => u.role === 'employee');
    if (!admin) throw new Error('No admin user found — run the server first to init users.');
    console.log(`Users: admin=${admin.full_name}, employees=${employees.map(u=>u.full_name).join(', ')}`);

    // 2. Fetch category IDs
    const catRes = await client.query(`SELECT id, name FROM categories`);
    const cats = catRes.rows;
    const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]));
    const catList = ['Incident','Incident','Service Request','Service Request','Access Request','Problem','Change'];

    // 3. Delete all ticket-related data
    console.log('Clearing ticket data...');
    await client.query('DELETE FROM ticket_audit_logs');
    await client.query('DELETE FROM ticket_comments');
    await client.query('DELETE FROM ticket_attachments');
    await client.query('DELETE FROM tickets');
    await client.query(`ALTER SEQUENCE ticket_number_seq RESTART WITH 1`);
    console.log('Cleared.');

    // 4. Insert new tickets
    console.log(`Inserting ${ticketDefs.length} tickets...`);
    let inserted = 0;
    for (const def of ticketDefs) {
      const seqRes = await client.query(`SELECT nextval('ticket_number_seq') AS seq`);
      const num = parseInt(seqRes.rows[0].seq);
      const ticketNumber = `PSH${String(num).padStart(6, '0')}`;

      const createdBy   = pick([admin, ...employees]);
      const ownerUser   = pick([admin, ...employees]);
      const catId       = catMap[pick(catList)] || cats[0].id;

      await client.query(
        `INSERT INTO tickets (
          ticket_number, customer_name, category_id, short_description, description,
          status, priority, impact, urgency,
          ticket_owner, created_by, custom_data,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          ticketNumber,
          def.customer,
          catId,
          def.subject,
          def.description,
          def.status,
          def.priority,
          def.impact,
          def.urgency,
          ownerUser.id,
          createdBy.id,
          '{}',
          def.createdTs,
          def.updatedTs,
        ]
      );
      inserted++;
      if (inserted % 10 === 0) process.stdout.write(`  ${inserted}/${ticketDefs.length}...\n`);
    }

    console.log(`\nDone! ${inserted} tickets inserted.`);
    console.log('Date range: 2026-07-20 → 2026-08-19');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
