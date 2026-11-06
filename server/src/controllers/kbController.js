const pool = require('../db/pool');

const fs = require('node:fs');
const path = require('node:path');
const SEED_ARTICLES = [
  [
    "Getting Started with PSH Ticketing System",
    "General",
    "01-getting-started.md",
    null
  ],
  [
    "Ticket Priority Guidelines",
    "FAQ",
    "02-priority.md",
    null
  ],
  [
    "How to Reset Your Password",
    "Policy",
    "03-passwords.md",
    null
  ],
  [
    "Common Storage Issues and Solutions",
    "Troubleshooting",
    "04-storage.md",
    null
  ],
  [
    "How to Write a Good Ticket Description",
    "How-To Guide",
    "05-ticket-description.md",
    null
  ],
  [
    "How to Format Knowledge Base Articles",
    "How-To Guide",
    "06-markdown-formatting.md",
    null
  ],
  [
    "How to Configure Email Notifications (SMTP)",
    "How-To Guide",
    "07-email.md",
    "email-configuration"
  ],
  [
    "How to Configure Single Sign-On (SSO)",
    "How-To Guide",
    "08-sso.md",
    "sso-configuration"
  ],
  [
    "Roles, Permissions, Groups and Managed Groups - Manager Example",
    "How-To Guide",
    "09-roles-manager.md",
    null
  ],
  [
    "Ticket Templates - Configuration and Everyday Use",
    "How-To Guide",
    "10-templates.md",
    null
  ]
].map(([title, category, file, slug]) => ({title, category, slug, content: fs.readFileSync(path.join(__dirname, '../../../database/knowledge-base', file), 'utf8')}));

async function initTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_articles (
      id         SERIAL PRIMARY KEY,
      title      VARCHAR(255) NOT NULL,
      content    TEXT         NOT NULL,
      category   VARCHAR(100) NOT NULL DEFAULT 'General',
      author_id  UUID REFERENCES users(id) ON DELETE SET NULL,
      status     VARCHAR(20)  NOT NULL DEFAULT 'PUBLISHED',
      views      INTEGER      NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await pool.query(`ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE`);
  for (const art of SEED_ARTICLES) {
    const { rows } = await pool.query('SELECT id FROM kb_articles WHERE title = $1 LIMIT 1', [art.title]);
    if (!rows.length) {
      await pool.query(
        'INSERT INTO kb_articles (title, content, category, status, slug) VALUES ($1, $2, $3, $4, $5)',
        [art.title, art.content, art.category, 'PUBLISHED', art.slug || null]
      );
    } else if (art.slug) {
      await pool.query(
        'UPDATE kb_articles SET slug = $1 WHERE id = $2 AND slug IS NULL',
        [art.slug, rows[0].id]
      );
    }
  }
}



async function list(req, res, next) {
  try {
    const { search = '', category = '' } = req.query;
    const params = [];
    const conditions = ['a.deleted_at IS NULL', "a.status = 'PUBLISHED'"];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.title ILIKE $${params.length} OR a.content ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`a.category = $${params.length}`);
    }

    const { rows } = await pool.query(`
      SELECT a.id, a.title, a.category, a.views, a.created_at, a.updated_at,
             LEFT(a.content, 200) AS excerpt,
             u.full_name AS author_name
      FROM kb_articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.updated_at DESC
    `, params);

    const cats = await pool.query(`
      SELECT DISTINCT category, COUNT(*) AS count
      FROM kb_articles
      WHERE deleted_at IS NULL AND status = 'PUBLISHED'
      GROUP BY category ORDER BY count DESC
    `);

    res.json({ success: true, articles: rows, categories: cats.rows });
  } catch (err) {
    next(err);
  }
}

async function listAdmin(req, res, next) {
  try {
    const { search = '', category = '', status = '' } = req.query;
    const params = [];
    const conditions = ['a.deleted_at IS NULL'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.title ILIKE $${params.length} OR a.content ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`a.category = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    const { rows } = await pool.query(`
      SELECT a.id, a.title, a.category, a.status, a.views, a.created_at, a.updated_at,
             LEFT(a.content, 200) AS excerpt,
             u.full_name AS author_name
      FROM kb_articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.updated_at DESC
    `, params);

    res.json({ success: true, articles: rows });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT a.*, u.full_name AS author_name
      FROM kb_articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.id = $1 AND a.deleted_at IS NULL
    `, [id]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Article not found' });

    await pool.query('UPDATE kb_articles SET views = views + 1 WHERE id = $1', [id]);
    res.json({ success: true, article: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function getBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const { rows } = await pool.query(`
      SELECT a.*, u.full_name AS author_name
      FROM kb_articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.slug = $1 AND a.deleted_at IS NULL AND a.status = 'PUBLISHED'
    `, [slug]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Article not found' });

    await pool.query('UPDATE kb_articles SET views = views + 1 WHERE id = $1', [rows[0].id]);
    res.json({ success: true, article: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { title, content, category, status = 'PUBLISHED' } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    const { rows } = await pool.query(`
      INSERT INTO kb_articles (title, content, category, status, author_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [title.trim(), content.trim(), category || 'General', status, req.session.userId]);

    res.status(201).json({ success: true, article: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { title, content, category, status } = req.body;
    const { rows } = await pool.query(`
      UPDATE kb_articles
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          category = COALESCE($3, category),
          status = COALESCE($4, status),
          updated_at = NOW()
      WHERE id = $5 AND deleted_at IS NULL
      RETURNING *
    `, [title?.trim(), content?.trim(), category, status, id]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Article not found' });
    res.json({ success: true, article: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(
      'UPDATE kb_articles SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
      [req.session.userId, id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Article not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { initTable, list, listAdmin, getOne, getBySlug, create, update, remove };
