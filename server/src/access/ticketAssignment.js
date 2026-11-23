// Use the same eligibility rule in assignment pickers and write authorization.
// A manager can receive work within managed teams without ordinary membership.
function eligibleAssigneeSQL(user,groupIds){
 return `${user}.is_active AND ${user}.deleted_at IS NULL AND EXISTS(
  SELECT 1 FROM access_roles assignee_role WHERE assignee_role.key=${user}.role AND assignee_role.is_active
  AND (EXISTS(SELECT 1 FROM user_groups assignment_member WHERE assignment_member.user_id=${user}.id AND assignment_member.group_id=ANY(${groupIds}))
   OR assignee_role.role_kind='manager' AND EXISTS(SELECT 1 FROM user_managed_groups assignment_manager WHERE assignment_manager.user_id=${user}.id AND assignment_manager.group_id=ANY(${groupIds}))))`;
}
module.exports={eligibleAssigneeSQL};
