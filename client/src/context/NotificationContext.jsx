import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const POLL_INTERVAL = 30_000; // 30 seconds

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const timerRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnread(res.data.unread || 0);
    } catch {
      // silently ignore — network may be down
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    timerRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchNotifications]);

  const markRead = useCallback(async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch {}
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unread, markRead, markAllRead, refetch: fetchNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
