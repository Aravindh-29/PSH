import { useAuth } from '../context/AuthContext';
export default function useAccess() {
  const { user } = useAuth();
  const can = key => !!(user?.role === 'admin' || user?.permissions?.[key]);
  const record = (key, ticket) => {
    if (user?.role === 'admin') return true;
    const scope=user?.permissions?.[key];
    if (!scope) return false;
    if (scope==='all') return true;
    const own=[ticket?.created_by,ticket?.assigned_to,ticket?.ticket_owner].includes(user?.id);
    const group=(user?.managedGroups||[]).includes(ticket?.assignment_group_id);
    return scope==='own'?own:scope==='groups'?group:scope==='related'?(own||group||(user?.memberGroups||[]).includes(ticket?.assignment_group_id)):false;
  };
  return {can,record,user,any:keys=>keys.some(can)};
}
