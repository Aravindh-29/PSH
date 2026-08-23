const pool = require('../db/pool');
const logger = require('../utils/logger');
const path = require('path');

const ALLOWED_MIME_TYPES = [
  'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
  'application/pdf',
  'text/plain','text/csv','text/html',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip','application/x-zip-compressed','application/x-zip','multipart/x-zip',
  'application/json',
  'application/octet-stream', // generic binary (e.g. .zip on some OS/browser combos)
  'video/mp4','video/webm',
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file

async function upload(req, res, next) {
  try {
    const { id: ticketId } = req.params;
    const ticket = await pool.query('SELECT id, created_by, assigned_to FROM tickets WHERE id = $1 AND deleted_at IS NULL', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const isAdmin = req.session.role === 'admin';
    const t = ticket.rows[0];
    if (!isAdmin && t.created_by !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });

    const attachments = [];
    const errors = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) { errors.push(`${file.originalname}: too large (max 25MB)`); continue; }
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) { errors.push(`${file.originalname}: type "${file.mimetype}" not allowed`); continue; }

      const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_');
      const result = await pool.query(
        `INSERT INTO ticket_attachments (ticket_id, file_name, mime_type, file_size, file_data, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, file_name, mime_type, file_size, uploaded_at`,
        [ticketId, safeName, file.mimetype, file.size, file.buffer, req.session.userId]
      );
      await pool.query(
        `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, new_value, ip_address)
         VALUES ($1,$2,'ATTACHMENT_ADDED','attachment',$3,$4)`,
        [ticketId, req.session.userId, safeName, req.ip]
      );
      attachments.push(result.rows[0]);
      logger.info(`Attachment uploaded: ${safeName} to ticket ${ticketId} by ${req.session.username}`);
    }

    res.status(201).json({ success: true, attachments, errors });
  } catch (err) {
    next(err);
  }
}

async function download(req, res, next) {
  try {
    const { attachmentId } = req.params;
    const result = await pool.query(
      `SELECT ta.*, t.created_by, t.assigned_to FROM ticket_attachments ta
       JOIN tickets t ON ta.ticket_id = t.id
       WHERE ta.id = $1`,
      [attachmentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Attachment not found' });

    const att = result.rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!isAdmin && att.created_by !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const PREVIEWABLE = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf','text/plain'];
    const preview = req.query.preview === 'true' && PREVIEWABLE.includes(att.mime_type);
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${att.file_name}"`);
    res.setHeader('Content-Length', att.file_size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(att.file_data);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { attachmentId } = req.params;
    const result = await pool.query(
      `SELECT ta.*, t.created_by FROM ticket_attachments ta JOIN tickets t ON ta.ticket_id = t.id WHERE ta.id = $1`,
      [attachmentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Attachment not found' });

    const att = result.rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!isAdmin && att.uploaded_by !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.query('DELETE FROM ticket_attachments WHERE id = $1', [attachmentId]);
    await pool.query(
      `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, ip_address)
       VALUES ($1,$2,'ATTACHMENT_DELETED','attachment',$3,$4)`,
      [att.ticket_id, req.session.userId, att.file_name, req.ip]
    );

    logger.info(`Attachment deleted: ${att.file_name} by ${req.session.username}`);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { upload, download, remove };
