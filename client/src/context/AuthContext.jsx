import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try { const res=await api.get('/auth/me');setUser(res.data.user); }
    catch(error) { if(error.response?.status===401)setUser(null); }
    finally {setLoading(false);}
  };
  useEffect(() => {
    refresh();
    const denied=()=>{toast.error("You don't have permission to perform this action.");refresh();};
    const focus=()=>refresh();
    window.addEventListener('servit-permission-denied',denied);
    window.addEventListener('focus',focus);
    const timer=setInterval(refresh,15000);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('servit-permission-denied',denied);};
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    // No MFA required path → full session + user returned immediately
    if (res.data.user) await refresh();
    return res.data;
  };

  const completeMfa = (userData) => {
    setUser(userData);
    refresh();
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, completeMfa, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
