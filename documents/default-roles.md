# Ready-made roles

Installations and updates include the following roles. Existing accounts keep their roles. An existing role with the same name or key is preserved rather than replaced.

| Role | Responsibility | Ticket scope |
| --- | --- | --- |
| Admin | Full application administration; protected | All |
| User / Employee | Existing employee permissions remain unchanged | Existing own/member-team rules |
| Support Agent | View member-team tickets; work on own/assigned tickets, add notes and resolve issues | View own/member teams; changes limited to own/assigned |
| Manager | View team users, create Employee accounts in managed teams, assign and supervise team tickets, close tickets and review/export team performance | Managed Groups |
| Read-only Viewer | Read tickets, comments, attachments and reports; no record changes | Managed Groups |
| Knowledge Author | Read articles and shared drafts; create/edit drafts | No ticket access |
| Knowledge Manager | Manage shared drafts and publish articles; no article deletion | No ticket access |
| SLA / QA Analyst | Read tickets and export reports, SLA and QA analysis; no ticket changes | Managed Groups |
| Configuration Manager | Maintain fields, categories, types, templates and SLA definitions; no deletion or resets | No ticket access |

New defaults never grant global user administration, group administration, role delegation, email/SSO administration, audit administration or ticket deletion. Manager includes two specific permissions: **View users in Managed Groups** and **Create Employee users in Managed Groups**. They do not grant user editing, deletion, password/MFA resets or access to the global user directory. Profile and personal notification permissions are included. Knowledge permissions apply to shared articles, not only an author's own articles. Changing published content requires publishing permission.

## Assigning a role

Use **Users → Add User / View or Edit → Access**. Choose one role. For Manager, Read-only Viewer and SLA / QA Analyst, select the teams under **Managed Groups**. Without Managed Groups these defaults have no group-scoped ticket access. Support Agents use **Groups** for team visibility and can work on tickets they created, own or are assigned.

For example, David and Sarah share the Manager role. David manages L1 Support; Sarah manages L2 Support. David sees L1 tickets and users; Sarah sees L2 tickets and users. Assignment Group on each ticket determines the ticket boundary. The Manager's Users page lists only members of Managed Groups. Managers can create Employee accounts only in their active Managed Groups, with MFA required and no Managed Groups granted to the new account. A ticket assignee must be an active member of that ticket's Assignment Group. Managed Groups does not establish direct employee reporting lines.

The Manager permission upgrade runs once for the default Manager and existing roles named Manager. Later permission customizations are preserved. Other custom roles can opt in through Configuration → Roles. Do not grant **View users** or other global user permissions to a role intended to have only the restricted team Users page.

## Customizing defaults

Open **Configuration → Roles → View / Edit**. New defaults are labeled **Default · Customizable**. Change their name, responsibility, permission checkboxes and scopes as needed. Changes affect all assigned users. Copy a role for a separate variation. Unused defaults can be deactivated; they cannot be deleted. The original Admin and User / Employee built-in protections remain unchanged.

Updates insert missing defaults without overwriting saved names, permissions, delegation, active status or user assignments. If a custom role already has a default name, it is preserved; review its existing permissions before assigning it. No new role is assigned to existing accounts automatically.

## Deployment and verification

Both `scripts/install.sh` and `scripts/update.sh` use the common database migration. Standalone `database/schema.sql` also contains the defaults.

Default definitions live in `server/src/access/defaultRoles.js`. After changing definitions, run `node server/scripts/sync-default-roles.js` to refresh the generated schema block. This only changes the initial defaults, not existing customized roles.

Validation commands:

```sh
node server/scripts/sync-default-roles.js --check
node server/scripts/test-default-roles.js
node server/scripts/test-team-users.js
node server/scripts/test-migrations.js
npm run build:client
```
