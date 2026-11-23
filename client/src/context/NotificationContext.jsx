import React,{createContext,useContext,useState,useEffect,useCallback,useRef} from 'react';
import api from '../api/axios';
import {useAuth} from './AuthContext';
const NotificationContext=createContext(null);
const POLL_INTERVAL=10000;
export function NotificationProvider({children}){
 const {user}=useAuth(),userId=user?.id;
 const [notifications,setNotifications]=useState([]),[unread,setUnread]=useState(0),[queryUnopened,setQueryUnopened]=useState(0),[otherUnread,setOtherUnread]=useState(0);
 const identity=useRef(userId),request=useRef(0);identity.current=userId;
 const fetchNotifications=useCallback(async()=>{
  if(!userId)return;
  const sequence=++request.current;
  try{
   const {data}=await api.get('/notifications');
   if(identity.current!==userId||sequence!==request.current)return;
   // One server snapshot updates both badges, avoiding independent read states.
   setNotifications(data.notifications||[]);setUnread(Number(data.unread)||0);
   setQueryUnopened(Number(data.ticketUnread)||0);setOtherUnread(Number(data.otherUnread)||0);
  }catch{}
 },[userId]);
 const markTicketOpened=useCallback(async(ticketId,revision)=>{
  if(!userId||identity.current!==userId)return true;
  try{await api.post(`/tickets/${ticketId}/opened`,{revision:String(revision)});if(identity.current===userId)await fetchNotifications();return true}catch{return false}
 },[userId,fetchNotifications]);
 useEffect(()=>{
  setNotifications([]);setUnread(0);setQueryUnopened(0);setOtherUnread(0);request.current++;
  if(!userId)return;
  fetchNotifications();const timer=setInterval(fetchNotifications,POLL_INTERVAL);
  window.addEventListener('focus',fetchNotifications);
  return()=>{clearInterval(timer);window.removeEventListener('focus',fetchNotifications)};
 },[userId,fetchNotifications]);
 const markRead=useCallback(async id=>{try{await api.patch(`/notifications/${id}/read`);if(identity.current===userId)await fetchNotifications()}catch{}},[userId,fetchNotifications]);
 const markAllRead=useCallback(async()=>{try{await api.patch('/notifications/read-all');if(identity.current===userId)await fetchNotifications()}catch{}},[userId,fetchNotifications]);
 return <NotificationContext.Provider value={{notifications,unread,otherUnread,markRead,markAllRead,queryUnopened,refreshQuery:fetchNotifications,markTicketOpened,refetch:fetchNotifications}}>{children}</NotificationContext.Provider>;
}
export function useNotifications(){return useContext(NotificationContext);}
