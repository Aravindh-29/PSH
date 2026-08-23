const pool = require('../db/pool');
const argon2 = require('argon2');

async function list(req, res, next) {
  try {
    const { scope } = req.query;

    // scope=with_tickets: include soft-deleted users who still have tickets (for User Wise Tickets page)
    // default: only active non-deleted users (for User Management)
    const whereClause = scope === 'with_tickets'
      ? `WHERE (u.deleted_at IS NULL OR EXISTS (
           SELECT 1 FROM tickets
           WHERE (assigned_to = u.id OR (assigned_to IS NULL AND created_by = u.id))
             AND deleted_at IS NULL
         ))`
      : `WHERE u.deleted_at IS NULL`;

    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at,
             u.deleted_at,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS ticket_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.priority = 'CRITICAL') AS critical_count
      FROM users u
      LEFT JOIN tickets t ON (t.assigned_to = u.id OR (t.assigned_to IS NULL AND t.created_by = u.id))
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.full_name
    `);
    res.json({ success: true, users: result.rows });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at, u.deleted_at,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS ticket_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.priority = 'CRITICAL') AS critical_count
      FROM users u
      LEFT JOIN tickets t ON (t.assigned_to = u.id OR (t.assigned_to IS NULL AND t.created_by = u.id))
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { username, email, fullName, password, role = 'employee' } = req.body;
    if (!username || !email || !fullName || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    const uname = username.toLowerCase();
    const uemail = email.toLowerCase();

    // Check if an active (non-deleted) user already has this username or email
    const activeConflict = await pool.query(
      `SELECT id FROM users WHERE (username = $1 OR email = $2) AND deleted_at IS NULL`,
      [uname, uemail]
    );
    if (activeConflict.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Username or email already exists' });
    }

    const hash = await argon2.hash(password);

    // If a soft-deleted user exists with the same username or email, restore that row
    // (preserves ticket history — all FKs reference the original UUID)
    const deleted = await pool.query(
      `SELECT id FROM users WHERE (username = $1 OR email = $2) AND deleted_at IS NOT NULL LIMIT 1`,
      [uname, uemail]
    );

    if (deleted.rows.length > 0) {
      const result = await pool.query(
        `UPDATE users SET username = $1, email = $2, full_name = $3, password_hash = $4,
         role = $5, is_active = TRUE, deleted_at = NULL, updated_at = NOW()
         WHERE id = $6
         RETURNING id, username, email, full_name, role`,
        [uname, uemail, fullName, hash, role, deleted.rows[0].id]
      );
      return res.status(201).json({ success: true, user: result.rows[0] });
    }

    const result = await pool.query(
      `INSERT INTO users (username, email, full_name, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, email, full_name, role`,
      [uname, uemail, fullName, hash, role]
    );
    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Username or email already exists' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { fullName, email, role, isActive } = req.body;
    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email),
       role = COALESCE($3, role), is_active = COALESCE($4, is_active), updated_at = NOW()
       WHERE id = $5 RETURNING id, username, email, full_name, role, is_active`,
      [fullName || null, email || null, role || null, isActive !== undefined ? isActive : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const hash = await argon2.hash(password);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [hash, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const deleteTickets = req.body?.deleteTickets === true;

    if (req.session?.userId === id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const user = await pool.query(
      'SELECT id, full_name FROM users WHERE id = $1 AND deleted_at IS NULL', [id]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (deleteTickets) {
      await pool.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE created_by = $1 AND deleted_at IS NULL',
        [id]
      );
    }

    // Soft-delete but immediately free the username/email so they can be reused.
    // Mangle credentials with a short suffix so the partial unique index
    // (WHERE deleted_at IS NULL) never sees these values again.
    const suffix = `_del_${id.substring(0, 8)}`;
    await pool.query(
      `UPDATE users SET
         username   = username || $1,
         email      = email    || $1,
         deleted_at = NOW(),
         is_active  = false,
         updated_at = NOW()
       WHERE id = $2`,
      [suffix, id]
    );
    res.json({ success: true, message: `User "${user.rows[0].full_name}" deleted` });
  } catch (err) { next(err); }
}

async function deleteAllTickets(req, res, next) {
  try {
    const { id } = req.params;
    const user = await pool.query('SELECT id, full_name FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const result = await pool.query(
      'UPDATE tickets SET deleted_at = NOW() WHERE created_by = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
    res.json({ success: true, deleted: result.rowCount, message: `${result.rowCount} ticket(s) deleted for "${user.rows[0].full_name}"` });
  } catch (err) { next(err); }
}

async function bulkCreate(req, res, next) {
  try {
    const { adminPassword, users } = req.body;
    if (!adminPassword || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ success: false, message: 'adminPassword and users array required' });
    }

    // Verify the calling admin's password
    const adminRow = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    if (!adminRow.rows.length) return res.status(403).json({ success: false, message: 'Admin not found' });
    const valid = await argon2.verify(adminRow.rows[0].password_hash, adminPassword);
    if (!valid) return res.status(403).json({ success: false, message: 'Incorrect admin password' });

    const created = [];
    const failed  = [];

    for (const u of users) {
      try {
        const { username, email, fullName, password, role = 'employee' } = u;
        if (!username || !email || !fullName || !password) {
          failed.push({ username, reason: 'Missing required fields' }); continue;
        }
        const uname  = username.toLowerCase().trim();
        const uemail = email.toLowerCase().trim();

        // Skip if active user already exists
        const conflict = await pool.query(
          `SELECT id FROM users WHERE (username = $1 OR email = $2) AND deleted_at IS NULL`,
          [uname, uemail]
        );
        if (conflict.rows.length > 0) {
          failed.push({ username: uname, reason: 'Username or email already exists' }); continue;
        }

        const hash = await argon2.hash(password);

        // Restore soft-deleted user if same username/email existed before
        const deleted = await pool.query(
          `SELECT id FROM users WHERE (username LIKE $1 OR email LIKE $2) AND deleted_at IS NOT NULL LIMIT 1`,
          [uname + '%', uemail + '%']
        );
        if (deleted.rows.length > 0) {
          await pool.query(
            `UPDATE users SET username=$1, email=$2, full_name=$3, password_hash=$4,
             role=$5, is_active=TRUE, deleted_at=NULL, updated_at=NOW() WHERE id=$6`,
            [uname, uemail, fullName, hash, role, deleted.rows[0].id]
          );
          created.push({ username: uname, fullName });
        } else {
          await pool.query(
            `INSERT INTO users (username, email, full_name, password_hash, role) VALUES ($1,$2,$3,$4,$5)`,
            [uname, uemail, fullName, hash, role]
          );
          created.push({ username: uname, fullName });
        }
      } catch (err) {
        failed.push({ username: u.username, reason: err.message });
      }
    }

    res.json({ success: true, created: created.length, failed, createdUsers: created });
  } catch (err) { next(err); }
}

async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, is_active, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function updateMe(req, res, next) {
  try {
    const { fullName, email, currentPassword, newPassword } = req.body;
    const existing = await pool.query(
      'SELECT id, email, full_name, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.session.userId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = existing.rows[0];

    const sets = [];
    const params = [];

    if (fullName && fullName.trim()) {
      params.push(fullName.trim()); sets.push(`full_name = $${params.length}`);
    }
    if (email && email.trim() && email.toLowerCase() !== user.email) {
      const conflict = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [email.toLowerCase(), req.session.userId]
      );
      if (conflict.rows.length > 0) return res.status(409).json({ success: false, message: 'Email already in use' });
      params.push(email.toLowerCase()); sets.push(`email = $${params.length}`);
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password required to set a new password' });
      const valid = await argon2.verify(user.password_hash, currentPassword);
      if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
      params.push(hash); sets.push(`password_hash = $${params.length}`);
    }

    if (sets.length === 0) return res.json({ success: true, message: 'No changes' });

    params.push(req.session.userId);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id, username, email, full_name, role`,
      params
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function bulkCheck(req, res, next) {
  try {
    const { usernames = [], emails = [] } = req.body;
    if (!usernames.length && !emails.length) {
      return res.json({ success: true, conflictUsernames: [], conflictEmails: [] });
    }
    const rows = await pool.query(
      `SELECT username, email FROM users
       WHERE deleted_at IS NULL
         AND (username = ANY($1) OR email = ANY($2))`,
      [
        usernames.map(u => String(u).toLowerCase().trim()),
        emails.map(e => String(e).toLowerCase().trim()),
      ]
    );
    res.json({
      success: true,
      conflictUsernames: rows.rows.map(r => r.username),
      conflictEmails:    rows.rows.map(r => r.email),
    });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, resetPassword, deleteUser, deleteAllTickets, bulkCreate, bulkCheck, getMe, updateMe };
