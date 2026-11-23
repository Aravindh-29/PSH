# Application roles: Admin, User and Manager

The application provides three fixed roles. Configuration no longer has a Roles tab. Roles cannot be created, renamed, edited or deleted through the API.

| Role | Responsibilities | Managed Departments selector |
| --- | --- | --- |
| Admin | Manage the application, accounts, departments, tickets, knowledge and configuration | Hidden; Admin already has global administration |
| User | Create and edit permitted personal and department tickets; assign to eligible team members; view published knowledge | Hidden |
| Manager | Personal ticket work plus oversight of departments/sub departments assigned by Admin; team tickets, eligible assignments, sub department management, adding existing unassigned users and reporting | Shown |

## Assigning a role

Open Users, create or edit an account, and choose Admin, User or Manager on Access. Only Admin creates accounts or grants access. A Manager can add eligible existing unassigned accounts to managed teams but cannot create accounts or change roles.

Membership means the person works in a team and can receive ticket assignments there. Managed Departments means the Manager supervises that team. The fields are separate. An active Manager can receive ticket assignments within managed departments/sub departments even without ordinary membership. Whole-department management includes its children; sub-department-only management does not allow parent-only or sibling tickets.

A Manager without managed departments can still use permitted personal tickets. Team Dashboard and team management remain empty. Select one or more managed departments/sub departments to give team oversight. Whole-department grants include current and future sub departments. Management grants can span several departments even when ordinary multiple membership is OFF.

My Tickets and My Dashboard show only tickets assigned to the signed-in person. Team Dashboard shows only managed-team tickets, including unassigned tickets. Reassign a ticket if a person should stop working on their personal assignment; removing management access does not delete tickets.

## Checkbox membership

Configuration has no Roles or Departments tab. Multiple membership is always enabled. On a user Access form, select any number of department/sub department checkboxes. Checked means selected; unchecked means no direct grant. A whole-department checkbox includes all its current and future sub departments, whose boxes show inherited access. Unchecking that department removes inherited access; any sub departments selected independently remain checked. Uncheck those as well to remove the remaining sub department memberships.

The old ON/OFF switch is removed. Previous OFF settings upgrade to multiple membership without changing existing assignments. API and database checks prevent old clients from restoring OFF. Geography management is available to Admin under Departments -> Regions & Countries.

Manager oversight is a separate set of checkboxes, visible only for Manager. Manager additions still accept only eligible existing unassigned users within their managed teams; multiple membership does not allow taking users from another Manager.

## Data preservation

The upgrade retains existing Admin, User and Manager account assignments, including a legacy Manager role with a UUID key. Extra role definitions are deactivated and archived, not deleted. On an older installation where accounts use other roles, those accounts become User, with the former role recorded in retired_user_roles. Memberships, historical managed grants, tickets, passwords, comments, attachments and articles are retained. Non-Manager historical managed grants do not authorize oversight.

Both startup/update migrations and standalone schema installation install the same three-role model. Fixed permissions are restored on migration; they are no longer customizable. Repeated migrations preserve IDs, business data and retirement history.

```sh
node server/scripts/sync-default-roles.js --check
node server/scripts/sync-organization.js --check
node server/scripts/sync-fixed-roles.js --check
node server/scripts/test-default-roles.js
node server/scripts/test-organization.js
node server/scripts/test-migrations.js
npm run build:client
```

## User department directory

User accounts have a view-only Users menu. The directory groups coworkers by parent department, supports name/username/email/role search, department filtering, scrolling and pagination. Membership in one sub department allows contact-directory viewing across that parent department, including its managers. It does not permit viewing sibling tickets or editing accounts. No account authentication data is returned. Membership changes apply to subsequent requests; the page reloads its scope when the signed-in membership changes.

## My Query ticket inbox

The sidebar highlights My Query and counts tickets that the person has not opened. The inbox contains tickets assigned to that person plus unassigned tickets they already have permission to read. Unassigned is an assignment condition, independent of the ticket state. All states are included, with clickable state filters, search, dates and pagination.

Open a full ticket to acknowledge its current assignment/routing revision. Opening My Query, reading the bell, filtering, or loading a ticket in the background does not clear the count. Opening two of three arrivals leaves one unopened. Receipts are per account and persist across reloads/devices. Reassignment or routing changes create a new arrival; ordinary edits and state changes do not reset the opened flag. An old, delayed acknowledgement cannot clear a newer assignment. The bell's read flag is separate from this ticket-opened receipt.

The inbox and badge refresh every ten seconds. A whole-department unassigned queue can be visible to several people; each person has their own opened state. Removing membership or managed access removes queue items that are no longer readable. Personal assignments remain subject to normal ticket permissions.

The schema includes tickets.inbox_revision and ticket_inbox_receipts. Run node server/scripts/sync-ticket-inbox.js --check to check the standalone installation schema.

## Shared department ticket work

Users can edit tickets in departments/sub departments they belong to, including unassigned tickets and tickets assigned to coworkers. They can assign those tickets to themselves or another active member eligible for that ticket department/sub department. Whole-department membership includes all child teams; a single sub department does not grant access to sibling ticket queues. Assignment and state changes still require a work note. This does not grant ticket ownership changes, department administration or deletion of coworkers’ tickets. Removing membership removes shared editing access; personal assignments retain their existing permissions.
