const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const logger = require('../utils/logger');

async function loadConfig() {
  const { rows } = await pool.query('SELECT * FROM email_config WHERE id = 1');
  return rows[0] || null;
}

function createTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: parseInt(cfg.smtp_port) || 587,
    secure: cfg.encryption === 'ssl',
    requireTLS: cfg.encryption === 'tls',
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    tls: { rejectUnauthorized: false },
  });
}

function ticketUrl(ticketId) {
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${base}/tickets/${ticketId}`;
}

function row(label, value) {
  return `<div class="field-row"><span class="label">${label}</span><span class="value">${value || '—'}</span></div>`;
}

function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:0;font-family:Inter,Arial,sans-serif;background:#f1f5f9}
.wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.header{background:#0D1B2A;padding:24px 32px}
.header h1{margin:0;color:#fff;font-size:20px;font-weight:700}
.header span{color:#E85D04}
.body{padding:28px 32px}
.title{font-size:18px;font-weight:700;color:#0D1B2A;margin:0 0 16px}
.field-row{display:flex;gap:8px;margin-bottom:10px;align-items:center}
.label{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;min-width:120px;flex-shrink:0}
.value{font-size:13px;color:#334155}
.change{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0}
.from{color:#dc2626;background:#fee2e2;border-radius:4px;padding:2px 8px;font-size:12px}
.to{color:#16a34a;background:#dcfce7;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600}
.btn{display:inline-block;background:#E85D04;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:20px 0 0}
.footer{background:#f8fafc;padding:16px 32px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0}
p{color:#475569;font-size:13px;margin:0 0 14px;line-height:1.6}
</style></head><body>
<div class="wrap">
  <div class="header"><h1>Pure Storage <span>Horizon</span></h1></div>
  <div class="body">
    <div class="title">${title}</div>
    ${bodyHtml}
  </div>
  <div class="footer">Pure Storage Horizon &mdash; Internal Ticketing System &mdash; Do not reply to this email</div>
</div></body></html>`;
}

async function sendMail(cfg, to, subject, html) {
  if (!cfg?.is_enabled || !to) return;
  try {
    const transporter = createTransporter(cfg);
    await transporter.sendMail({
      from: `"${cfg.from_name || 'PSH Notifications'}" <${cfg.from_email}>`,
      to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email send failed to ${to}: ${err.message}`);
  }
}

async function notifyTicketCreated(ticket, actorName, recipientEmail) {
  const cfg = await loadConfig();
  const html = baseTemplate(`New Ticket Assigned: ${ticket.ticket_number}`, `
    <p>${actorName} created a new ticket and assigned it to you.</p>
    ${row('Ticket ID', `<strong>${ticket.ticket_number}</strong>`)}
    ${row('Subject', ticket.short_description)}
    ${row('Customer', ticket.customer_name)}
    ${row('Priority', ticket.priority)}
    ${row('Status', ticket.status)}
    ${row('Created By', actorName)}
    <a href="${ticketUrl(ticket.id)}" class="btn">View Ticket &rarr;</a>
  `);
  await sendMail(cfg, recipientEmail, `[${ticket.ticket_number}] New ticket assigned to you`, html);
}

async function notifyTicketAssigned(ticket, actorName, recipientEmail) {
  const cfg = await loadConfig();
  const html = baseTemplate(`Ticket Assigned: ${ticket.ticket_number}`, `
    <p>${actorName} has assigned ticket <strong>${ticket.ticket_number}</strong> to you.</p>
    ${row('Ticket ID', `<strong>${ticket.ticket_number}</strong>`)}
    ${row('Subject', ticket.short_description)}
    ${row('Customer', ticket.customer_name)}
    ${row('Priority', ticket.priority)}
    ${row('Status', ticket.status)}
    <a href="${ticketUrl(ticket.id)}" class="btn">View Ticket &rarr;</a>
  `);
  await sendMail(cfg, recipientEmail, `[${ticket.ticket_number}] Ticket assigned to you by ${actorName}`, html);
}

async function notifyStatusChanged(ticket, oldStatus, newStatus, actorName, recipientEmails) {
  const cfg = await loadConfig();
  const html = baseTemplate(`Status Updated: ${ticket.ticket_number}`, `
    <p>${actorName} updated the status of ticket <strong>${ticket.ticket_number}</strong>.</p>
    ${row('Ticket ID', `<strong>${ticket.ticket_number}</strong>`)}
    ${row('Subject', ticket.short_description)}
    <div class="change">
      <div class="field-row">
        <span class="label">Status</span>
        <span class="from">${oldStatus}</span>
        <span style="color:#94a3b8;margin:0 8px">&rarr;</span>
        <span class="to">${newStatus}</span>
      </div>
    </div>
    <a href="${ticketUrl(ticket.id)}" class="btn">View Ticket &rarr;</a>
  `);
  for (const email of (recipientEmails || []).filter(Boolean)) {
    await sendMail(cfg, email, `[${ticket.ticket_number}] Status changed to ${newStatus}`, html);
  }
}

async function notifyTicketResolved(ticket, actorName, recipientEmails) {
  const cfg = await loadConfig();
  const html = baseTemplate(`Ticket Resolved: ${ticket.ticket_number}`, `
    <p>${actorName} has resolved ticket <strong>${ticket.ticket_number}</strong>.</p>
    ${row('Ticket ID', `<strong>${ticket.ticket_number}</strong>`)}
    ${row('Subject', ticket.short_description)}
    ${row('Customer', ticket.customer_name)}
    ${row('Resolved By', actorName)}
    <a href="${ticketUrl(ticket.id)}" class="btn">View Ticket &rarr;</a>
  `);
  for (const email of (recipientEmails || []).filter(Boolean)) {
    await sendMail(cfg, email, `[${ticket.ticket_number}] Ticket has been resolved`, html);
  }
}

async function notifyCommentAdded(ticket, commentBody, actorName, commentType, recipientEmails) {
  const cfg = await loadConfig();
  const typeLabel = commentType === 'WORK_NOTE' ? 'Work Note' : 'Comment';
  const html = baseTemplate(`New ${typeLabel}: ${ticket.ticket_number}`, `
    <p>${actorName} added a ${typeLabel.toLowerCase()} to ticket <strong>${ticket.ticket_number}</strong>.</p>
    ${row('Ticket ID', `<strong>${ticket.ticket_number}</strong>`)}
    ${row('Subject', ticket.short_description)}
    <div class="change">
      <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:8px;text-transform:uppercase">${typeLabel}</div>
      <div style="font-size:13px;color:#334155;line-height:1.6">${commentBody}</div>
    </div>
    <a href="${ticketUrl(ticket.id)}" class="btn">View Ticket &rarr;</a>
  `);
  for (const email of (recipientEmails || []).filter(Boolean)) {
    await sendMail(cfg, email, `[${ticket.ticket_number}] New ${typeLabel.toLowerCase()} from ${actorName}`, html);
  }
}

function slaBar(pct, stage) {
  const color = stage === 'breached' ? '#dc2626'
    : pct >= 75 ? '#f97316'
    : pct >= 50 ? '#f59e0b'
    : '#22c55e';
  const width = Math.min(Math.round(pct), 100);
  return `
    <div style="background:#f1f5f9;border-radius:99px;height:10px;overflow:hidden;margin:12px 0">
      <div style="height:100%;width:${width}%;background:${color};border-radius:99px;transition:width 0.4s"></div>
    </div>
    <div style="font-size:12px;color:${color};font-weight:700">${Math.round(pct)}% elapsed${stage === 'breached' ? ' — SLA BREACHED' : ''}</div>
  `;
}

async function notifySLAWarn(ticket, slaName, pct, remainingMinutes, recipientEmails) {
  const cfg = await loadConfig();
  const rem = remainingMinutes > 60
    ? `${Math.floor(remainingMinutes / 60)}h ${Math.round(remainingMinutes % 60)}m`
    : `${Math.round(remainingMinutes)}m`;
  const html = baseTemplate(`⚠ SLA Warning: ${ticket.ticket_number}`, `
    <p>SLA <strong>"${slaName}"</strong> for ticket <strong>${ticket.ticket_number}</strong> is ${Math.round(pct)}% elapsed.</p>
    ${row('Ticket', `<strong>${ticket.ticket_number}</strong> — ${ticket.short_description}`)}
    ${row('Status', ticket.status)}
    ${row('Priority', ticket.priority)}
    ${row('Remaining', `<strong style="color:#f59e0b">${rem}</strong>`)}
    ${slaBar(pct, 'warn')}
    <a href="${ticketUrl(ticket.id)}" class="btn">View Ticket &rarr;</a>
  `);
  for (const email of (recipientEmails || []).filter(Boolean)) {
    await sendMail(cfg, email, `⚠ SLA Warning [${ticket.ticket_number}] — ${rem} remaining`, html);
  }
}

async function notifySLACritical(ticket, slaName, pct, remainingMinutes, recipientEmails) {
  const cfg = await loadConfig();
  const rem = remainingMinutes > 60
    ? `${Math.floor(remainingMinutes / 60)}h ${Math.round(remainingMinutes % 60)}m`
    : `${Math.round(remainingMinutes)}m`;
  const html = baseTemplate(`🔴 SLA Critical: ${ticket.ticket_number}`, `
    <p>SLA <strong>"${slaName}"</strong> for ticket <strong>${ticket.ticket_number}</strong> is at ${Math.round(pct)}% — approaching breach!</p>
    ${row('Ticket', `<strong>${ticket.ticket_number}</strong> — ${ticket.short_description}`)}
    ${row('Status', ticket.status)}
    ${row('Priority', ticket.priority)}
    ${row('Remaining', `<strong style="color:#f97316">${rem}</strong>`)}
    ${slaBar(pct, 'critical')}
    <a href="${ticketUrl(ticket.id)}" class="btn" style="background:#f97316">View Ticket &rarr;</a>
  `);
  for (const email of (recipientEmails || []).filter(Boolean)) {
    await sendMail(cfg, email, `🔴 SLA Critical [${ticket.ticket_number}] — only ${rem} remaining`, html);
  }
}

async function notifySLABreach(ticket, slaName, overdueMinutes, recipientEmails) {
  const cfg = await loadConfig();
  const over = overdueMinutes > 60
    ? `${Math.floor(overdueMinutes / 60)}h ${Math.round(overdueMinutes % 60)}m`
    : `${Math.round(overdueMinutes)}m`;
  const html = baseTemplate(`🚨 SLA Breached: ${ticket.ticket_number}`, `
    <p>SLA <strong>"${slaName}"</strong> for ticket <strong>${ticket.ticket_number}</strong> has been <span style="color:#dc2626;font-weight:700">BREACHED</span>.</p>
    ${row('Ticket', `<strong>${ticket.ticket_number}</strong> — ${ticket.short_description}`)}
    ${row('Status', ticket.status)}
    ${row('Priority', ticket.priority)}
    ${row('Overdue By', `<strong style="color:#dc2626">${over}</strong>`)}
    ${slaBar(105, 'breached')}
    <a href="${ticketUrl(ticket.id)}" class="btn" style="background:#dc2626">View Ticket &rarr;</a>
  `);
  for (const email of (recipientEmails || []).filter(Boolean)) {
    await sendMail(cfg, email, `🚨 SLA BREACHED [${ticket.ticket_number}] — overdue by ${over}`, html);
  }
}

module.exports = {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyStatusChanged,
  notifyTicketResolved,
  notifyCommentAdded,
  notifySLAWarn,
  notifySLACritical,
  notifySLABreach,
};
