import {useEffect,useState} from 'react';
import api from '../api/axios';

export default function useAccountAvailability({enabled,username='',email=''}){
  const [result,setResult]=useState({}),[attempt,setAttempt]=useState(0);
  const key=JSON.stringify([username,email]);
  const values={username,email};
  const fields=Object.fromEntries(Object.entries(values).map(([field,value])=>[field,{status:!value?'idle':(field==='username'?/^[a-zA-Z0-9._-]{1,50}$/.test(value):value.length<=255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))?'checking':'invalid'}]));
  useEffect(()=>{
    if(!enabled)return;
    const pending=Object.keys(fields).filter(field=>fields[field].status==='checking');
    setResult({key,attempt,fields});
    if(!pending.length)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{
        const {data}=await api.post('/users/check-availability',Object.fromEntries(pending.map(field=>[field,values[field]])),{signal:controller.signal});
        if(controller.signal.aborted)return;
        setResult({key,attempt,fields:{...fields,...Object.fromEntries(pending.map(field=>[field,{status:typeof data.availability?.[field]?.available!=='boolean'?'error':data.availability[field].available?'available':'exists'}]))}});
      }catch(error){
        if(!controller.signal.aborted)setResult({key,attempt,fields:{...fields,...Object.fromEntries(pending.map(field=>[field,{status:'error'}]))}});
      }
    },350);
    return()=>{clearTimeout(timer);controller.abort()};
  },[enabled,key,attempt]);
  const current=enabled&&result.key===key&&result.attempt===attempt?result.fields:fields;
  return {...current,ready:enabled&&Object.values(current).every(field=>field.status==='available'),recheck:()=>setAttempt(n=>n+1)};
}
