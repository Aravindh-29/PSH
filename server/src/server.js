require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const pool = require('./db/pool');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'psh.sid',
  cookie: {
    secure: isProd && (process.env.CLIENT_URL || '').startsWith('https'),
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/mfa',  require('./routes/mfa'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/kb',      require('./routes/kb'));
app.use('/api/audit',        require('./routes/audit'));
app.use('/api/admin-audit',  require('./routes/adminAudit'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/groups',        require('./routes/groups'));
app.use('/api/subcategories', require('./routes/subcategories'));
app.use('/api/sla',           require('./routes/sla'));

if (isProd) {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.use(errorHandler);

async function runSLABreachChecker() {
  try {
    const { runSLAChecker } = require('./services/slaService');
    const emailService = require('./services/emailService');
    const { newlyBreached, warnInstances, critInstances } = await runSLAChecker();

    // Send emails for breach, warn, critical
    const sendSLAEmail = async (inst, type) => {
      try {
        const ticketRow = await pool.query(
          `SELECT t.*, u1.email AS assignee_email, u2.email AS creator_email
           FROM tickets t
           LEFT JOIN users u1 ON t.assigned_to = u1.id
           LEFT JOIN users u2 ON t.created_by = u2.id
           WHERE t.id = $1 AND t.deleted_at IS NULL`, [inst.ticket_id]
        );
        if (!ticketRow.rows.length) return;
        const ticket = ticketRow.rows[0];
        const emails = [ticket.assignee_email, ticket.creator_email].filter(Boolean);
        if (!emails.length) return;

        const now = Date.now();
        if (type === 'breach') {
          const overdueMinutes = (now - new Date(inst.target_at).getTime()) / 60000;
          await emailService.notifySLABreach(ticket, inst.sla_name || inst.name || 'SLA', overdueMinutes, emails);
        } else if (type === 'critical') {
          const elapsedMs = now - new Date(inst.started_at).getTime() - (parseFloat(inst.total_pause_minutes) * 60000);
          const pct = (elapsedMs / 60000 / inst.duration_minutes) * 100;
          const remainingMinutes = inst.duration_minutes - elapsedMs / 60000;
          await emailService.notifySLACritical(ticket, inst.sla_name || inst.name || 'SLA', pct, remainingMinutes, emails);
        } else if (type === 'warn') {
          const elapsedMs = now - new Date(inst.started_at).getTime() - (parseFloat(inst.total_pause_minutes) * 60000);
          const pct = (elapsedMs / 60000 / inst.duration_minutes) * 100;
          const remainingMinutes = inst.duration_minutes - elapsedMs / 60000;
          await emailService.notifySLAWarn(ticket, inst.sla_name || inst.name || 'SLA', pct, remainingMinutes, emails);
        }
      } catch (e) { logger.error(`SLA email error (${type})`, e); }
    };

    for (const inst of newlyBreached) await sendSLAEmail(inst, 'breach');
    for (const inst of critInstances) await sendSLAEmail(inst, 'critical');
    for (const inst of warnInstances)  await sendSLAEmail(inst, 'warn');

    if (newlyBreached.length) logger.info(`SLA: ${newlyBreached.length} tickets newly breached`);
  } catch (err) {
    logger.error('SLA breach checker error', err);
  }
}

async function runRetentionCleanup() {
  try {
    const { rows } = await pool.query('SELECT enabled, retention_days FROM audit_retention_settings WHERE id = 1');
    const cfg = rows[0];
    if (!cfg?.enabled || !cfg.retention_days) return;
    const result = await pool.query(
      `DELETE FROM ticket_audit_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [cfg.retention_days]
    );
    if (result.rowCount > 0) logger.info(`Audit retention: deleted ${result.rowCount} log entries older than ${cfg.retention_days} days`);
  } catch (err) {
    logger.error('Audit retention cleanup failed', err);
  }
}

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connected');
    await require('./dbInit')();
    logger.info('Database ready');
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

    // Run retention cleanup once at startup, then every 24 hours
    setTimeout(async () => {
      await runRetentionCleanup();
      setInterval(runRetentionCleanup, 24 * 60 * 60 * 1000);
    }, 5000);

    // SLA breach checker — runs every 60 seconds
    setTimeout(async () => {
      await runSLABreachChecker();
      setInterval(runSLABreachChecker, 60 * 1000);
    }, 10000);
  } catch (err) {
    logger.error('Failed to connect to database', err);
    process.exit(1);
  }
}

start();
