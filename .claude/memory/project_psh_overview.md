---
name: project-psh-overview
description: Pure Storage Horizon internal ticketing system - Phase 1 requirements and architecture
metadata: 
  node_type: memory
  type: project
  originSessionId: 7be858f0-1fe3-44f0-9408-2c45405b5259
  modified: 2026-08-19T15:47:51.286Z
---

Phase 1 of Pure Storage Horizon internal ticketing system for ~1000 users.

**Why:** Replace/replicate ServiceNow-like ticketing internally for Pure Storage Horizon team.

**How to apply:** All development decisions should follow monolith-first, keep-it-simple principles. Do not over-engineer.

Architecture: Modular monolith — React + Node.js/Express + PostgreSQL. One repo, one docker compose up --build command.
- Frontend: React.js + Vite
- Backend: Node.js + Express REST API
- Database: PostgreSQL (Prisma or pg)
- Auth: Argon2id/bcrypt + HTTP-only session cookies + RBAC
- Attachments: PostgreSQL BYTEA (no S3)
- Roles: ADMIN and EMPLOYEE
- Ticket IDs: Auto-generated PSH000001, PSH000002...
- Soft delete for tickets (deleted_at, deleted_by)
- Full audit logging per field change
