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
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/kb',      require('./routes/kb'));
app.use('/api/audit',   require('./routes/audit'));
app.use('/api/notifications', require('./routes/notifications'));

if (isProd) {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.use(errorHandler);

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
  } catch (err) {
    logger.error('Failed to connect to database', err);
    process.exit(1);
  }
}

start();
