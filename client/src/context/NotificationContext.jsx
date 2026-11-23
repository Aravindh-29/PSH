import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const POLL_INTERVAL = 10_000; // 10 seconds

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const timerRef = useRef(null);
  const [queryUnopened,setQueryUnopened]=useState(0);
  const queryRequest=useRef(0);
  const identity=useRef(user?.id);identity.current=user?.id;
  const userId=user?.id,canQuery=!!(user?.role==='admin'||user?.permissions?.['query.view']);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.get('/notifications');
      if(identity.current!==userId)return;
      setNotifications(res.data.notifications || []);
      setUnread(res.data.unread || 0);
    } catch {
      // silently ignore — network may be down
    }
  }, [userId]);

  const refreshQuery=useCallback(async()=>{
    if(!userId||!canQuery){setQueryUnopened(0);return}
    const request=++queryRequest.current;
    try{const{data}=await api.get('/dashboard/query/badge');if(identity.current===userId&&request===queryRequest.current)setQueryUnopened(Number(data.unopened)||0)}catch{}
  },[userId,canQuery]);
  const markTicketOpened=useCallback(async(ticketId,revision)=>{
    if(!userId||!canQuery||identity.current!==userId)return true;
    try{await api.post(`/tickets/${ticketId}/opened`,{revision:String(revision)});if(identity.current===userId)await refreshQuery();return true}catch{return false}
  },[userId,canQuery,refreshQuery]);
  useEffect(()=>{
    setNotifications([]);setUnread(0);setQueryUnopened(0);
    if(!userId)return;
    fetchNotifications();refreshQuery();
    const update=()=>{fetchNotifications();refreshQuery()};
    timerRef.current=setInterval(update,POLL_INTERVAL);
    window.addEventListener('focus',update);
    return()=>{clearInterval(timerRef.current);window.removeEventListener('focus',update)};
  },[userId,fetchNotifications,refreshQuery]);

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
    <NotificationContext.Provider value={{ notifications, unread, markRead, markAllRead, queryUnopened, refreshQuery, markTicketOpened, refetch: fetchNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
