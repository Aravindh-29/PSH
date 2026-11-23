const {uuid} = require('./context');

// A Department grant covers its subgroups; a subgroup grant also includes
// people with inherited membership from the parent Department. Managers are
// included through their management responsibility even without membership.
function managedMembership(userAlias, parameter) {
  return `(EXISTS(SELECT 1 FROM user_groups ug
    JOIN assignment_groups membership ON membership.id=ug.group_id
    JOIN assignment_groups managed ON managed.id=ANY(${parameter}::uuid[])
      AND (membership.id=managed.id OR membership.parent_id=managed.id OR membership.id=managed.parent_id)
    WHERE ug.user_id=${userAlias}.id)
    OR EXISTS(SELECT 1 FROM user_managed_groups um
      JOIN access_roles manager_role ON manager_role.key=${userAlias}.role AND manager_role.role_kind='manager' AND manager_role.is_active
      JOIN assignment_groups responsibility ON responsibility.id=um.group_id
      JOIN assignment_groups managed ON managed.id=ANY(${parameter}::uuid[])
        AND (responsibility.id=managed.id OR responsibility.parent_id=managed.id OR responsibility.id=managed.parent_id)
      WHERE um.user_id=${userAlias}.id))`;
}
async function requireManagedUser(req, pool, id) {
  if(!uuid(id))throw Object.assign(new Error('Invalid user identifier.'),{status:400});
  if(req.access.admin)return;
  const result=await pool.query(`SELECT u.id FROM users u WHERE u.id=$1 AND u.deleted_at IS NULL AND ${managedMembership('u','$2')}`,[id,req.access.managedGroups]);
  if(!result.rowCount)throw Object.assign(new Error("You don't have permission to access this user."),{status:403,code:'PERMISSION_DENIED'});
}
module.exports={managedMembership,requireManagedUser};
