import React,{useEffect,useState} from 'react';
import {Users,Search,Building2,ShieldCheck,ChevronLeft,ChevronRight,RefreshCw} from 'lucide-react';
import api from '../../api/axios';
import {useAuth} from '../../context/AuthContext';
import './UserDirectory.css';

export default function UserDirectory(){
 const{user}=useAuth();const membershipKey=[...(user?.memberGroups||[])].sort().join(',');
 const [departments,setDepartments]=useState([]),[users,setUsers]=useState([]),[departmentId,setDepartmentId]=useState('');
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[paging,setPaging]=useState({pages:0,total:0});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{setDepartmentId('');setPage(1)},[membershipKey]);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1)},300);return()=>clearTimeout(timer)},[search]);
 useEffect(()=>{let active=true;const controller=new AbortController();setLoading(true);
 const params=new URLSearchParams({page:String(page),limit:'50'});if(query)params.set('search',query);if(departmentId)params.set('departmentId',departmentId);
 api.get('/users/directory?'+params,{signal:controller.signal}).then(({data})=>{if(active){setDepartments(data.departments);setUsers(data.users);setPaging(data.pagination);setError('');if(data.pagination.pages&&page>data.pagination.pages)setPage(data.pagination.pages)}}).catch(e=>{if(active&&!controller.signal.aborted)setError(e.response?.data?.message||'Could not load your department directory.')}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false;controller.abort()};
 },[query,departmentId,page,refresh,membershipKey]);
 const sections=departments.filter(d=>(!departmentId||d.id===departmentId)&&users.some(u=>u.memberships.some(m=>m.department_id===d.id)));
 return <div className="user-directory">
  <header className="udr-heading"><div><span className="udr-eyebrow">PEOPLE / MY DEPARTMENTS</span><h1>Users</h1><p>Find the people in your departments, organised by department.</p></div><span className="udr-readonly"><ShieldCheck size={16}/> View only</span></header>
  <div className="udr-overview"><span className="udr-overview-icon"><Users size={24}/></span><div><strong>Your department directory</strong><p>Browse coworkers and department managers. This directory does not give access to their tickets or account settings.</p></div><span className="udr-department-count">{departments.length} {departments.length===1?'department':'departments'}</span></div>
  <div className="udr-tools"><div className="udr-search"><Search size={18}/><input aria-label="Search department users" placeholder="Search name, username, email or role…" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filter directory by department" value={departmentId} onChange={e=>{setDepartmentId(e.target.value);setPage(1)}}><option value="">All my departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}{d.region_name?' — '+d.region_name:''}</option>)}</select><button type="button" aria-label="Refresh user directory" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={18}/></button></div>
  {error&&<p className="udr-error" role="alert">{error}<button onClick={()=>setRefresh(n=>n+1)}>Retry</button></p>}
  <div className="udr-results-heading"><strong>{loading?'Loading…':`${paging.total} ${paging.total===1?'person':'people'} found`}</strong><span>Scroll to browse · Search and department filters available</span></div>
  <div className="udr-scroll" aria-label="Users by department" tabIndex={0}>{!loading&&!error&&sections.map(department=>{
   const people=users.filter(u=>u.memberships.some(m=>m.department_id===department.id));
   return <section className="udr-department" key={department.id}><header><span className="udr-building"><Building2 size={19}/></span><div><h2>{department.name}</h2><p>{department.region_name||'Department directory'}</p></div><span>{people.length} on this page</span></header>
    <div className="udr-columns" aria-hidden="true"><span>PERSON</span><span>ROLE</span><span>DEPARTMENT ACCESS</span><span>STATUS</span></div>
    {people.map(person=>{const membership=person.memberships.filter(m=>m.department_id===department.id);return <article className="udr-person" key={person.id}><div className="udr-person-name"><span className="udr-avatar">{person.full_name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span><div><strong>{person.full_name}</strong><span>{person.email}</span><small>@{person.username}</small></div></div><span className={'udr-role '+(person.role_name==='Manager'?'is-manager':'')}>{person.role_name}</span><div className="udr-membership">{membership.map((m,i)=><span key={m.group_id+':'+m.supervises}>{m.supervises?'Manages: ':''}{m.sub_department||'Whole department'}</span>)}</div><span className={'udr-status '+(!person.is_active?'is-inactive':'')}>{person.is_active?'Active':'Inactive'}</span></article>})}
   </section>
  })}{loading&&<div className="udr-empty"><Users size={32}/><h3>Loading your coworkers…</h3></div>}{!loading&&!error&&!sections.length&&<div className="udr-empty"><Users size={36}/><h3>{departments.length?'No matching users':'No department membership yet'}</h3><p>{departments.length?'Try another name, email, role or department.':'Ask Admin to add you to a department or sub department to see its people.'}</p></div>}</div>
  <footer className="udr-pagination"><span>A person in multiple departments may appear in more than one section.</span><div><button type="button" aria-label="Previous directory page" disabled={loading||page===1} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={17}/></button><span>Page {page} of {Math.max(1,paging.pages)}</span><button type="button" aria-label="Next directory page" disabled={loading||page>=paging.pages} onClick={()=>setPage(n=>n+1)}><ChevronRight size={17}/></button></div></footer>
 </div>;
}
