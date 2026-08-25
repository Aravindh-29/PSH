const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const { logAdminAudit } = require('./adminAuditController');

const MASKED = '••••••••';

async function getConfig(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM email_config WHERE id = 1');
    const cfg = rows[0] || {};
    res.json({
      success: true,
      config: {
        smtp_host:   cfg.smtp_host   || '',
        smtp_port:   cfg.smtp_port   || 587,
        smtp_user:   cfg.smtp_user   || '',
        smtp_pass:   cfg.smtp_pass   ? MASKED : '',
        from_name:   cfg.from_name   || '',
        from_email:  cfg.from_email  || '',
        encryption:  cfg.encryption  || 'tls',
        is_enabled:  cfg.is_enabled  ?? false,
        updated_at:  cfg.updated_at  || null,
      },
    });
  } catch (err) { next(err); }
}

async function saveConfig(req, res, next) {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, encryption, is_enabled } = req.body;

    let actualPass = smtp_pass;
    if (smtp_pass === MASKED) {
      const { rows } = await pool.query('SELECT smtp_pass FROM email_config WHERE id = 1');
      actualPass = rows[0]?.smtp_pass || '';
    }

    await pool.query(`
      INSERT INTO email_config (id, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, encryption, is_enabled, updated_at, updated_by)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
      ON CONFLICT (id) DO UPDATE SET
        smtp_host  = $1, smtp_port   = $2, smtp_user  = $3, smtp_pass  = $4,
        from_name  = $5, from_email  = $6, encryption = $7, is_enabled = $8,
        updated_at = NOW(), updated_by = $9
    `, [smtp_host || '', parseInt(smtp_port) || 587, smtp_user || '', actualPass || '',
        from_name || '', from_email || '', encryption || 'tls', is_enabled !== false,
        req.session.userId]);

    logAdminAudit(req.session?.userId, 'EMAIL_CONFIG_UPDATED', 'email_config', '1', 'Email Configuration', { smtp_host, smtp_port, from_email, is_enabled }, req.ip);
    res.json({ success: true, message: 'Email configuration saved' });
  } catch (err) { next(err); }
}

async function testConfig(req, res, next) {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, encryption, test_to } = req.body;

    let actualPass = smtp_pass;
    if (smtp_pass === MASKED) {
      const { rows } = await pool.query('SELECT smtp_pass FROM email_config WHERE id = 1');
      actualPass = rows[0]?.smtp_pass || '';
    }

    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port) || 587,
      secure: encryption === 'ssl',
      requireTLS: encryption === 'tls',
      auth: { user: smtp_user, pass: actualPass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();

    const recipient = test_to || smtp_user;
    await transporter.sendMail({
      from: `"${from_name || 'PSH Notifications'}" <${from_email || smtp_user}>`,
      to: recipient,
      subject: 'Test Email — Pure Storage Horizon',
      html: `<!DOCTYPE html><html><head><style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9}
.wrap{max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden}
.head{background:#0D1B2A;padding:20px 28px}
.head h1{margin:0;color:#fff;font-size:18px;font-weight:700}
.head span{color:#E85D04}
.body{padding:24px 28px}
</style></head><body>
<div class="wrap">
  <div class="head"><h1>Pure Storage <span>Horizon</span></h1></div>
  <div class="body">
    <p style="font-size:15px;font-weight:600;color:#0D1B2A;margin:0 0 12px">Email configuration is working!</p>
    <p style="font-size:13px;color:#475569;margin:0">This test email confirms that your SMTP settings are configured correctly. Email notifications for ticket actions will now be delivered.</p>
  </div>
</div></body></html>`,
    });

    res.json({ success: true, message: `Test email sent to ${recipient}` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = { getConfig, saveConfig, testConfig };
