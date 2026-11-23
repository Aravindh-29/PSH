import {useEffect,useState} from 'react';
import api from '../api/axios';

export default function useTicketAssignees(departmentId,subgroupId){
  const [state,setState]=useState({key:'',users:[],loading:false,error:''});
  const key=departmentId?`${departmentId}/${subgroupId||''}`:'';
  useEffect(()=>{
    let active=true;
    if(!departmentId){setState({key:'',users:[],loading:false,error:''});return;}
    setState({key,users:[],loading:true,error:''});
    api.get('/departments/assignees',{params:{departmentId,subgroupId:subgroupId||undefined}})
      .then(r=>{if(active)setState({key,users:r.data.users||[],loading:false,error:''});})
      .catch(()=>{if(active)setState({key,users:[],loading:false,error:'Could not load assignees. Reload the page to retry.'});});
    return()=>{active=false;};
  },[departmentId,subgroupId,key]);
  const current=state.key===key?state:{users:[],loading:!!key,error:''};
  return {...current,options:current.users.map(u=>({value:String(u.id),label:u.full_name,sublabel:`@${u.username}`,searchExtra:u.username}))};
}
