import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Search, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import useAccess from '../../hooks/useAccess';
import './RBAC.css';

const blank = { fullName:'',username:'',email:'',password:'',groupIds:[] };
export default function TeamUsers() {
  const { can } = useAccess();
  const [users,setUsers]=useState([]),[groups,setGroups]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [form,setForm]=useState(null),[visible,setVisible]=useState(false),[saving,setSaving]=useState(false),[reviewed,setReviewed]=useState(false);
  const [search,setSearch]=useState(''),[groupFilter,setGroupFilter]=useState('');
  const load=async()=>{
    setLoading(true);setError('');
    try{const [u,g]=await Promise.all([api.get('/users/team'),api.get('/groups?picker=true')]);setUsers(u.data.users);setGroups(g.data.groups.filter(group=>group.is_active))}
    catch(e){setError(e.response?.data?.message||'Could not load your team users.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  const update=(key,value)=>{setForm(previous=>({...previous,[key]:value}));setReviewed(false)};
  const valid=form&&form.fullName.trim()&&form.fullName.length<=255&&/^[a-z0-9._-]{1,50}$/i.test(form.username)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)&&form.email.length<=255&&form.password.length>=8&&form.password.length<=256&&form.groupIds.length>0;
  const save=async event=>{
    event.preventDefault();if(!valid||!reviewed||saving)return;
    setSaving(true);
    try{
      await api.post('/users/team',{...form,role:'employee',mfaRequired:true,managedGroupIds:[]});
      setForm(null);setVisible(false);toast.success('Team user created successfully');await load();
    }catch(e){toast.error(e.response?.data?.message||'Could not create this team user.')}
    finally{setSaving(false)}
  };
  const filtered=users.filter(user=>(!groupFilter||user.groups.some(g=>g.id===groupFilter))&&[user.full_name,user.username,user.email,user.role_name].some(value=>value?.toLowerCase().includes(search.trim().toLowerCase())));
  return <div className="rbac">
    <div className="rbac-heading"><div><span className="rbac-eyebrow">TEAM / USERS</span><h2>{form?'Create Team User':'My Team Users'}</h2><p>View users in your Managed Groups and create Employee accounts for your teams.</p></div>{form?<button className="cfg-btn-cancel" disabled={saving} onClick={()=>{setForm(null);setVisible(false)}}><ArrowLeft size={16}/>Back to Users</button>:<div className="rbac-actions">{can('tickets.group_view')&&<Link className="cfg-btn-cancel" to="/my-tickets?tab=group">View Team Tickets</Link>}{can('users.team_create')&&<button className="cfg-btn-save" disabled={loading||!groups.length} onClick={()=>{setForm({...blank,groupIds:groups.length===1?[groups[0].id]:[]});setReviewed(false);setVisible(false)}}><Plus size={16}/>Add User</button>}</div>}</div>
    {error&&<p className="rbac-note" role="alert">{error} <button type="button" className="cfg-btn-cancel" onClick={load}>Retry</button></p>}
    {!loading&&!error&&!groups.length&&<p className="rbac-note">No Managed Groups are assigned to you. Ask an administrator to select your teams under Users → Access → Managed Groups.</p>}
    {form?<form className="rbac-card rbac-user-form" onSubmit={save}>
      <fieldset disabled={saving} style={{border:0,padding:0,minWidth:0}}>
        <h3>Account details</h3><div className="rbac-grid">
          <label>Full Name *<input required maxLength={255} value={form.fullName} onChange={e=>update('fullName',e.target.value)}/></label>
          <label>Username *<input required maxLength={50} pattern="[a-zA-Z0-9._-]+" autoComplete="off" value={form.username} onChange={e=>update('username',e.target.value)}/></label>
          <label>Email *<input type="email" required maxLength={255} value={form.email} onChange={e=>update('email',e.target.value)}/></label>
          <div className="rbac-password-field"><label htmlFor="team-user-password">Password *</label><div className="rbac-password-control"><input id="team-user-password" type={visible?'text':'password'} required minLength={8} maxLength={256} autoComplete="new-password" value={form.password} onChange={e=>update('password',e.target.value)}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
        </div><h3>Team access</h3><p>Role: <strong>User / Employee</strong> · <ShieldCheck size={14}/> MFA required</p>
        <fieldset className="rbac-group-picker"><legend>Groups *</legend><div className="rbac-group-options">{groups.map(group=><label className="rbac-group-option" key={group.id}><input type="checkbox" checked={form.groupIds.includes(group.id)} onChange={e=>update('groupIds',e.target.checked?[...form.groupIds,group.id]:form.groupIds.filter(id=>id!==group.id))}/>{group.name}</label>)}</div><small>Select at least one team you manage. The new user becomes a member; they do not receive management access.</small></fieldset>
        <label className="rbac-inline"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I have reviewed this Employee account and its team assignments.</label>
      </fieldset><div className="rbac-actions"><button type="button" className="cfg-btn-cancel" disabled={saving} onClick={()=>{setForm(null);setVisible(false)}}>Cancel</button><button type="submit" className="cfg-btn-save" disabled={saving||!valid||!reviewed}>{saving?'Creating…':'Create User'}</button></div>
    </form>:<>
      <div className="rbac-stats">{[[Users,'Team users',users.length],[ShieldCheck,'Managed Groups',groups.length]].map(([Icon,label,count])=><div className="rbac-stat" key={label}><span className="rbac-stat-icon"><Icon size={21}/></span><div><span>{label}</span><strong>{count}</strong></div></div>)}</div>
      <div className="rbac-toolbar"><Search size={17}/><input aria-label="Search team users" placeholder="Search name, username, email or role…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter team users by group" value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}><option value="">All Managed Groups</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
      <div className="rbac-card rbac-table-wrap"><div className="rbac-section-title"><h3>Team members</h3><span>{filtered.length} users</span></div><table className="cfg-table"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Groups</th><th>Status</th></tr></thead><tbody>{filtered.map(user=><tr key={user.id}><td><strong>{user.full_name}</strong></td><td>{user.username}</td><td>{user.email}</td><td>{user.role_name}</td><td>{user.groups.map(g=>g.name).join(', ')}</td><td><span className={'rbac-badge '+(user.is_active?'is-active':'is-inactive')}>{user.is_active?'Active':'Inactive'}</span></td></tr>)}</tbody></table>{!filtered.length&&<p>{loading?'Loading team users…':'No users match your teams or search.'}</p>}</div>
    </>}
  </div>;
}
