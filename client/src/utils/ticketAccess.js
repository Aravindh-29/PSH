export const canHaveManagedAccess = role => role?.role_kind === 'manager' || role?.roleKind === 'manager' || role?.key === 'manager' || role?.role === 'manager';

// Keep this policy equivalent to server/access/context.js recordAllowed.
export function canAccessTicket(user, key, ticket) {
  if (user?.role === 'admin') return true;
  const scope=user?.permissions?.[key];
  if (!scope || !ticket || !user?.id) return false;
  if (scope==='all') return true;
  const ids=[ticket.assignment_group_id,ticket.subgroup_id].filter(Boolean);
  const managed=canHaveManagedAccess(user)&&ids.some(id=>(user.managedGroups||[]).includes(id));
  const member=ids.some(id=>(user.memberGroups||[]).includes(id));
  const own=[ticket.created_by,ticket.assigned_to,ticket.ticket_owner].includes(user.id);
  const personal=ticket.assigned_to===user.id || own&&(managed||member||!ticket.assignment_group_id);
  return scope==='own'?personal:scope==='groups'?(key==='tickets.group_view'?managed:managed||personal):scope==='related'?managed||member||personal:false;
}
