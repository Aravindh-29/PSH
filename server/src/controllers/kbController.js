const pool = require('../db/pool');

const SEED_ARTICLES = [
  {
    title: 'Getting Started with PSH Ticketing System',
    category: 'General',
    content: `# Welcome to Pure Storage Horizon

This guide will help you get familiar with the PSH Ticketing System.

## Logging In

Use your company email and the password provided by your administrator. If you forget your password, contact an admin to reset it.

## Creating Your First Ticket

- Click **Create Ticket** in the left sidebar
- Fill in the short description (what is the issue?)
- Select the appropriate priority level
- Choose the relevant module and category
- Provide a detailed description in the body
- Click **Submit Ticket**

## Tracking Your Tickets

Navigate to **My Tickets** to see all tickets you have created. You can filter by status, priority, and search by keyword.

## Need Help?

Browse this Knowledge Base for answers, or create a ticket if your question is not covered.`,
  },
  {
    title: 'Ticket Priority Guidelines',
    category: 'FAQ',
    content: `# Understanding Ticket Priorities

Choosing the right priority ensures your issue is handled within the correct timeframe.

## Priority Levels

**CRITICAL** — System is down or severely impacted. Immediate attention required.
SLA Target: 4 hours

**HIGH** — Major functionality is impaired but a workaround exists.
SLA Target: 8 hours

**MEDIUM** — Partial functionality loss. Work can continue with minor interruption.
SLA Target: 24 hours

**LOW** — Cosmetic issue or minor inconvenience. No immediate impact.
SLA Target: 72 hours

## Tips

- Do not mark tickets CRITICAL unless the system is truly down
- Incorrect priority assignment may delay your ticket
- Admins may adjust priority based on impact assessment`,
  },
  {
    title: 'How to Reset Your Password',
    category: 'Policy',
    content: `# Password Reset Process

## Self-Service Reset

Currently, password resets are handled by administrators. Follow these steps:

- Contact your system administrator
- Request a password reset for your account
- The admin will set a temporary password
- Log in with the temporary password
- You can then use the system normally

## Password Requirements

- Minimum 6 characters
- Recommended: mix of uppercase, lowercase, numbers, and symbols
- Do not share your password with anyone
- Passwords are stored securely using Argon2id hashing

## Security Tips

- Log out after each session on shared computers
- Never write passwords on sticky notes
- Report any suspicious login attempts to your admin immediately`,
  },
  {
    title: 'Common Storage Issues and Solutions',
    category: 'Troubleshooting',
    content: `# Common Storage Issues

This article covers the most frequently reported storage-related issues and how to resolve them.

## Issue: Cannot Access Storage Volume

**Symptoms:** Drive not mounting, access denied errors

**Steps to resolve:**
- Verify network connectivity to the storage array
- Check that your user account has the required permissions
- Restart the storage client service
- If issue persists, raise a CRITICAL ticket

## Issue: Slow Read/Write Speeds

**Symptoms:** Applications loading slowly, file transfers taking too long

**Steps to resolve:**
- Check current IOPS utilization in the dashboard
- Look for other processes consuming high bandwidth
- Check for scheduled backup jobs running during peak hours
- Contact your storage admin if degradation continues

## Issue: Storage Capacity Warning

**Symptoms:** Warning emails, capacity alerts in dashboard

**Steps to resolve:**
- Identify and archive old, unused files
- Request a capacity expansion if usage is legitimate
- Review retention policies for backup data`,
  },
  {
    title: 'How to Write a Good Ticket Description',
    category: 'How-To Guide',
    content: `# Writing Effective Ticket Descriptions

A well-written ticket gets resolved faster. Follow this guide to write better tickets.

## Required Information

- **What happened?** Describe the problem clearly
- **When did it start?** Provide the date and time
- **How often?** Is this a one-time or recurring issue?
- **Impact:** How many users or systems are affected?
- **Steps to reproduce:** What were you doing when the error occurred?

## What to Include

- Error messages (copy the exact text)
- Screenshots if applicable (use the attachment feature)
- System or application version numbers
- Any recent changes made before the issue started

## What to Avoid

- Vague descriptions like "it is broken" or "not working"
- Multiple unrelated issues in one ticket
- Marking everything as CRITICAL when it is not

## Example of a Good Description

"Since this morning at 9:00 AM, I am unable to log into the inventory application. The error message reads: Authentication timeout. I have tried on two different browsers. Five colleagues in my team have the same issue. No changes were made to our systems yesterday."`,
  },
  {
    title: 'How to Format Knowledge Base Articles',
    category: 'How-To Guide',
    content: `# How to Write and Format KB Articles

This guide is for **administrators** who create and maintain articles in the PSH Knowledge Base.

## Creating an Article

- Log in as an **Administrator**
- Click **Knowledge Base** in the left sidebar
- Click the orange **New Article** button (top-right)
- Fill in the Title, Category, and Status fields
- Write your content in the editor
- Click **Publish Article** to make it live

## Formatting Syntax

The editor uses simple text formatting. Here are all supported styles:

## Headings

# Main Heading — use a single # and a space
## Sub-heading — use ## and a space

## Lists

- Start a line with "- " (dash + space) to create a bullet point
- Each line becomes its own bullet item
- Indent is not required

## Bold Text

Wrap any word or phrase in **double asterisks** to make it bold.
Example: **Important Note** will appear in bold.

## Paragraphs

Just type normally. Each block of text becomes a paragraph.
An empty line between blocks creates visual separation.

## Category Guide

- **General** — Announcements, overviews, welcome guides
- **FAQ** — Frequently asked questions and quick answers
- **Troubleshooting** — Step-by-step error resolution
- **How-To Guide** — Task-based instructions
- **Policy** — Rules, compliance, security policies
- **Technical** — Specs, architecture, developer docs

## Publishing vs Draft

- **Published** — Visible to all employees immediately
- **Draft** — Only visible to admins, for work-in-progress articles

## Best Practices

- Keep titles short and search-friendly
- Lead with the most important information
- Use bullet lists for steps — numbered steps go top to bottom
- Review for typos before publishing
- Update articles when processes change
- If an article is outdated, edit it — do not create a duplicate`,
  },
];

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
  for (const art of SEED_ARTICLES) {
    const { rows } = await pool.query('SELECT id FROM kb_articles WHERE title = $1 LIMIT 1', [art.title]);
    if (!rows.length) {
      await pool.query(
        'INSERT INTO kb_articles (title, content, category, status) VALUES ($1, $2, $3, $4)',
        [art.title, art.content, art.category, 'PUBLISHED']
      );
    }
  }
}

initTable().catch(err => console.error('KB table init error:', err));

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

module.exports = { list, listAdmin, getOne, create, update, remove };
