import { useAuth } from '../context/AuthContext';
import { canAccessTicket } from '../utils/ticketAccess';
export default function useAccess() {
  const { user } = useAuth();
  const can = key => !!(user?.role === 'admin' || user?.permissions?.[key]);
  const record = (key, ticket) => {
    return canAccessTicket(user,key,ticket);
  };
  return {can,record,user,any:keys=>keys.some(can)};
}
