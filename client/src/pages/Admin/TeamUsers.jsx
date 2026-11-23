import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Plus,Search,Users} from 'lucide-react';
import api from '../../api/axios';
import useAccess from '../../hooks/useAccess';
import {AddOrganizationMembers} from './Departments';
import './RBAC.css';
import './Departments.css';
export default function TeamUsers(){
 const{can}=useAccess();const[users,setUsers]=useState([]),[groups,setGroups]=useState([]),[settings,setSettings]=useState({}),[add,setAdd]=useState(false),[search,setSearch]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);try{const[u,g]=await Promise.all([api.get('/users/team'),api.get('/departments/tree')]);setUsers(u.data.users);setGroups(g.data.groups);setSettings(g.data.settings);setError('')}catch(e){setError(e.response?.data?.message||'Could not load team users.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const filtered=users.filter(u=>[u.full_name,u.email,u.username,u.role_name].some(v=>v?.toLowerCase().includes(search.toLowerCase())));
 return <div className="rbac org-page org-team-users"><div className="rbac-heading"><div><span className="rbac-eyebrow">TEAM / USERS</span><h2>My Team Users</h2><p>Users within your managed departments and sub departments. Only Admin creates user accounts.</p></div><div className="rbac-actions"><Link className="cfg-btn-cancel" to="/my-tickets?tab=group">View Team Tickets</Link>{can('users.team_add')&&<button className="cfg-btn-save org-blue" disabled={!groups.length} onClick={()=>setAdd(true)}><Plus size={16}/>Add Existing Users</button>}</div></div>{error&&<p role="alert" className="rbac-note">{error}</p>}{!loading&&!groups.length&&<p className="rbac-note">Ask Admin to assign Managed Departments and Sub Departments to you.</p>}<section className="rbac-card org-members-panel" aria-label="Team user directory">
 <div className="org-members-toolbar"><div><h3>Team directory <span className="org-member-count">{users.length}</span></h3><p>Members of your managed departments and sub departments.</p></div></div>
 <div className="org-members-search"><Search size={18}/><input aria-label="Search team users" placeholder="Search by name, username, email or role…" value={search} onChange={e=>setSearch(e.target.value)}/><span>{filtered.length} {filtered.length===1?'user':'users'}</span></div>
 <div className="org-team-columns" aria-hidden="true"><span>USER</span><span>ROLE</span><span>DEPARTMENT / SUB DEPARTMENT</span><span>STATUS</span></div>
 <div className="org-members-directory" aria-busy={loading}>{filtered.map(u=><article className="org-team-row" key={u.id}>
   <div className="org-member-person"><span className="org-member-avatar" aria-hidden="true">{u.full_name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span><div><div className="org-team-name-line"><strong>{u.full_name}</strong><small>@{u.username}</small></div><span>{u.email}</span></div></div>
   <div className="org-member-role-cell"><span className={'org-member-role'+(u.role_name?.toLowerCase().includes('manager')?' is-manager':'')}>{u.role_name}</span></div>
   <div className="org-team-memberships">{u.groups.length?u.groups.map(g=><span key={g.id}>{groups.find(n=>n.id===g.id)?.label||g.name}</span>):<span>No membership</span>}</div>
   <span className={'org-subgroup-status'+(u.is_active?'':' is-inactive')}>{u.is_active?'Active':'Inactive'}</span>
 </article>)}{!filtered.length&&<div className="org-members-empty"><Users size={28}/><h3>{loading?'Loading team users…':users.length?'No matching users':'No team users yet'}</h3>{!loading&&<p>{users.length?'Try another name, username, email or role.':'Add existing users to your managed teams.'}</p>}</div>}</div>
 </section>{add&&<AddOrganizationMembers groups={groups} settings={settings} onClose={()=>setAdd(false)} onSaved={load}/>}</div>;
}
