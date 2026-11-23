import DepartmentFindings from '../../components/DepartmentFindings';
import React,{useEffect,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {Plus,Users,Building2,ArrowLeft,ArrowRight,MapPin,Edit2,Trash2,Save,Search,X,AlertCircle,CheckCircle2} from 'lucide-react';
import api from '../../api/axios';
import useAccess from '../../hooks/useAccess';
import OrganizationTree from '../../components/OrganizationTree';
import OrgDialog from '../../components/OrganizationDialog';
import DepartmentSettings from './DepartmentSettings';
export {OrgDialog};
import toast from 'react-hot-toast';
import './RBAC.css';
import './Departments.css';

export function AddOrganizationMembers({groups,settings,initial=[],onClose,onSaved}){
 const [users,setUsers]=useState([]),[chosen,setChosen]=useState([]),[ids,setIds]=useState(initial),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{api.get('/departments/candidates').then(r=>setUsers(r.data.users)).catch(e=>setError(e.response?.data?.message||'Could not load users.'))},[]);
 const visibleUsers=users.filter(u=>[u.full_name,u.email,u.username].some(s=>s?.toLowerCase().includes(query.toLowerCase())));
 const save=async()=>{if(busy)return;setBusy(true);setError('');try{await api.post('/departments/members',{groupIds:ids,userIds:chosen});toast.success('Department access saved successfully');onSaved();onClose()}catch(e){setError(e.response?.data?.message||'Could not add these users.')}finally{setBusy(false)}};
 return <OrgDialog title="Add existing users" className="org-add-members" onClose={()=>{if(!busy)onClose()}}>
   <header className="org-add-header"><span className="org-add-icon"><Users size={22}/></span><div><h2>Add Existing Users</h2><p>Select users and choose their department or sub department access.</p></div><button className="org-add-close" aria-label="Close Add Existing Users" disabled={busy} onClick={onClose}><X size={19}/></button></header>
   <div className="org-add-body">
     <div className="org-add-step"><span>1</span><h3>Select users</h3><small>Managers can add only completely unassigned users.</small></div>
     <div className="org-members-search"><Search size={18}/><input aria-label="Search existing users" placeholder="Search by name, username or email…" value={query} disabled={busy} onChange={e=>setQuery(e.target.value)}/></div>
     <div className="org-candidate-summary"><span>{visibleUsers.length} {visibleUsers.length===1?'user':'users'} available</span><strong>{chosen.length} selected</strong></div>
     <div className="org-candidate-list" role="group" aria-label="Available users">{visibleUsers.map(u=><label className={'org-candidate-row'+(chosen.includes(u.id)?' is-selected':'')} key={u.id}>
       <input type="checkbox" checked={chosen.includes(u.id)} disabled={busy} onChange={e=>setChosen(e.target.checked?[...chosen,u.id]:chosen.filter(id=>id!==u.id))}/>
       <span className="org-member-avatar" aria-hidden="true">{u.full_name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span>
       <span className="org-candidate-identity"><strong>{u.full_name}</strong><small>{u.email}</small></span>
       <span className={'org-candidate-role'+(u.role_name?.toLowerCase().includes('manager')?' is-manager':'')}>{u.role_name}</span>
     </label>)}{!visibleUsers.length&&<p className="org-candidate-empty">{users.length?'No users match your search.':'No eligible users. Admin can create an account and leave its memberships empty.'}</p>}</div>
     <div className="org-add-step org-add-step-access"><span>2</span><h3>Choose access</h3></div>
     <div className="org-add-tree"><OrganizationTree groups={groups} value={ids} onChange={setIds} disabled={busy}/></div>
     {error&&<p role="alert" className="rbac-error">{error}</p>}
   </div>
   <footer className="org-add-footer"><span>{chosen.length} {chosen.length===1?'user':'users'} selected · {ids.length} access {ids.length===1?'selection':'selections'}</span><div className="rbac-actions"><button className="cfg-btn-cancel" disabled={busy} onClick={onClose}>Cancel</button><button className="cfg-btn-save org-blue" disabled={busy||!chosen.length||!ids.length} onClick={save}><Save size={15}/>{busy?'Saving…':'Save Access'}</button></div></footer>
 </OrgDialog>;

}
export default function Departments(){
 const params=useParams(),id=params.id||params.groupId,navigate=useNavigate();const {can,user}=useAccess(),admin=user.role==='admin';
 const [managerSearch,setManagerSearch]=useState('');
 const [tree,setTree]=useState([]),[settings,setSettings]=useState({}),[geo,setGeo]=useState({regions:[],countries:[]}),[detail,setDetail]=useState(null),[members,setMembers]=useState([]),[tab,setTab]=useState('overview'),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [geographyOpen,setGeographyOpen]=useState(false);
 const [confirmError,setConfirmError]=useState(''),[formError,setFormError]=useState('');
 const [subgroupSearch,setSubgroupSearch]=useState(''),[departmentSearch,setDepartmentSearch]=useState('');
 const [form,setForm]=useState(null),[busy,setBusy]=useState(false),[add,setAdd]=useState(false),[search,setSearch]=useState(''),[confirm,setConfirm]=useState(null);
 const load=async()=>{setLoading(true);setError('');try{const [t,g]=await Promise.all([api.get('/departments/tree'),api.get('/departments/geography')]);setTree(t.data.groups);setSettings(t.data.settings);setGeo(g.data);if(id){const [d,m]=await Promise.all([api.get('/departments/'+id),api.get(`/departments/${id}/members`)]);setDetail(d.data);setMembers(m.data.users)}else{setDetail(null);setMembers([])}}catch(e){setError(e.response?.data?.message||'Could not load departments.')}finally{setLoading(false)}};
 useEffect(()=>{setTab('overview');setManagerSearch('');setSearch('');setSubgroupSearch('');setForm(null);setAdd(false);load()},[id]);
 const current=detail?.group,root=current?.parent_id?tree.find(g=>g.id===current.parent_id):current;
 const openConfirm=value=>{setConfirmError('');setConfirm(value)};
 const open=(g=null,parent=null)=>{setFormError('');setForm(g?{id:g.id,name:g.name,description:g.description||'',regionId:g.region_id||'',countryId:g.country_id||'',parentId:g.parent_id||'',is_active:g.is_active}:{name:'',description:'',regionId:parent?.region_id||'',countryId:'',parentId:parent?.id||'',is_active:true})};
 const save=async e=>{e.preventDefault();setFormError('');setBusy(true);try{const r=await api[form.id?'put':'post']('/departments'+(form.id?'/'+form.id:''),form);setForm(null);toast.success('Department details saved');if(!form.id)navigate('/departments/'+r.data.group.id);else await load()}catch(e){setFormError(e.response?.data?.message||'Could not save.')}finally{setBusy(false)}};
 const run=async()=>{setConfirmError('');setBusy(true);try{await confirm.run();setConfirm(null);toast.success('Change saved successfully');await load()}catch(e){setConfirmError(e.response?.data?.message||'Could not complete this action.')}finally{setBusy(false)}};
 const remove=g=>openConfirm({title:'Delete '+(g.parent_id?'sub department':'department')+'?',message:'Only unused records can be deleted. Records with tickets or access assignments must be deactivated.',run:async()=>{await api.delete('/departments/'+g.id);navigate('/departments')}});
 const children=detail?.children||[],canEdit=current&&(admin||current.parent_id&&can('departments.subgroups')&&current.full_control);
 const scopes=id?tree.filter(g=>g.id===(current?.parent_id||id)||g.parent_id===(current?.parent_id||id)).map(g=>current?.parent_id?{...g,full_control:g.id===current.id&&g.full_control}:g):tree;
 const departments=tree.filter(g=>!g.parent_id),visibleDepartments=departments.filter(g=>[g.name,g.region_name].some(v=>v?.toLowerCase().includes(departmentSearch.toLowerCase())));
 const visibleSubgroups=children.map(child=>({...child,country_name:tree.find(g=>g.id===child.id)?.country_name||''})).filter(child=>[child.name,child.country_name].some(v=>v.toLowerCase().includes(subgroupSearch.toLowerCase())));
 const visibleMembers=members.filter(u=>[u.full_name,u.email,u.role_name].some(v=>v?.toLowerCase().includes(search.toLowerCase())));
 return <div className="rbac org-page"><div className="rbac-heading"><div>{id&&<Link className="org-back" to={current?.parent_id?'/departments/'+current.parent_id:'/departments'}><ArrowLeft size={15}/>Back to {current?.parent_id?'Department':'Departments'}</Link>}<span className="rbac-eyebrow">ORGANIZATION / {current?.parent_id?'SUB DEPARTMENT':'DEPARTMENTS'}</span><h2>{id?current?.name||'Department':'Departments'}</h2><p>{admin?'Manage departments, sub departments and access.':'Only departments and sub departments assigned to you are shown.'}</p></div><div className="rbac-actions">{!id&&admin&&<button className="cfg-btn-save org-blue" onClick={()=>setGeographyOpen(true)}><MapPin size={16}/>Regions &amp; Countries</button>}{!id&&admin&&<button className="cfg-btn-save" onClick={()=>open()}><Plus size={16}/>Create Department</button>}{canEdit&&<><button className="cfg-btn-save org-blue" onClick={()=>open(current)}><Edit2 size={15}/>Edit {current.parent_id?'Sub Department':'Department'}</button><button className="cfg-btn-save org-red" onClick={()=>remove(current)}><Trash2 size={15}/>Delete</button></>}</div></div>
 {error&&<p role="alert" className="rbac-note">{error} <button className="cfg-btn-cancel" onClick={load}>Retry</button></p>}{loading?<p>Loading departments…</p>:!error&&!id?<section className="rbac-card org-members-panel" aria-label="Department directory">
   <div className="org-members-toolbar"><div><h3>Department directory <span className="org-member-count">{departments.length}</span></h3><p>{admin?'Manage your organization’s departments and their teams.':'Your assigned departments and management access.'}</p></div></div>
   <div className="org-members-search"><Search size={18}/><input aria-label="Search departments" placeholder="Search by department name or region…" value={departmentSearch} onChange={e=>setDepartmentSearch(e.target.value)}/><span>{visibleDepartments.length} {visibleDepartments.length===1?'department':'departments'}</span></div>
   <div className="org-department-columns" aria-hidden="true"><span>DEPARTMENT</span><span>REGION</span><span>YOUR ACCESS</span><span>STATUS</span><span>ACTION</span></div>
   <div className="org-members-directory">{visibleDepartments.map(g=><Link className="org-department-row" key={g.id} to={'/departments/'+g.id} aria-label={'Open department '+g.name}>
     <div className="org-subgroup-name"><span className="org-subgroup-icon"><Building2 size={18}/></span><strong>{g.name}</strong></div>
     <span className="org-subgroup-country"><MapPin size={14}/>{g.region_name||'Region not configured'}</span>
     <span className={'org-department-access'+(g.full_control?'':' is-partial')}>{admin?'Full administration':g.full_control?'Whole department':'Selected sub departments'}</span>
     <span className={'org-subgroup-status'+(g.is_active?'':' is-inactive')}>{g.is_active?'Active':'Inactive'}</span>
     <span className="org-subgroup-open">Open<ArrowRight size={14}/></span>
   </Link>)}{!visibleDepartments.length&&<div className="org-members-empty"><Building2 size={28}/><h3>{departments.length?'No matching departments':'No departments available'}</h3><p>{departments.length?'Try another department name or region.':admin?'Create a department to get started.':'Ask Admin to assign management access to you.'}</p></div>}</div>
 </section>:!error&&current&&<>
 <div className="rbac-stats">{[['Region',current.region_name||'Not configured'],[current.parent_id?'Country':'Sub Departments',current.country_name||children.length],['Members',members.length],['Status',current.is_active?'Active':'Inactive']].map(([label,value])=><div className="rbac-stat" key={label}><div><span>{label}</span><strong className="org-stat-value">{value}</strong></div></div>)}</div>
 <div className="rbac-tabs" role="tablist">{['overview',...!current.parent_id?['subgroups']:[],'members','findings'].map(t=><button role="tab" aria-selected={tab===t} className={tab===t?'selected':''} key={t} onClick={()=>setTab(t)}>{t==='subgroups'?'Sub Departments':t==='findings'?'Department Findings':t[0].toUpperCase()+t.slice(1)}</button>)}</div>
 {tab==='overview'&&<><div className="rbac-card"><h3>{current.name}</h3><p>{current.description||'No description provided.'}</p><p>{current.parent_id?'Sub Department access covers only this sub department.':'Whole-department membership and management include all current and future sub departments.'}</p>{!current.region_id&&<p className="rbac-note">Admin must select a Region before sub departments can be created.</p>}</div>
 <section className="rbac-card org-managers-panel" aria-label="Department managers">
   <div className="org-members-toolbar"><div><h3>Managers <span className="org-member-count">{(detail.managers||[]).length}</span></h3><p>See who manages this {current.parent_id?'sub department':'department'} and their responsibility.</p></div></div>
   <div className="org-members-search"><Search size={18}/><input aria-label="Search department managers" placeholder="Search manager name, email or responsibility…" value={managerSearch} onChange={e=>setManagerSearch(e.target.value)}/></div>
   <div className="org-manager-list" tabIndex={0} aria-label="Managers and responsibilities">
   {(detail.managers||[]).filter(m=>[m.full_name,m.username,m.email,...m.responsibilities.map(r=>r.whole_department?'Whole department':r.name)].some(v=>v?.toLowerCase().includes(managerSearch.toLowerCase()))).map(m=><article className="org-manager-row" key={m.id}>
     <span className="org-manager-avatar">{(m.full_name||m.username||'?').slice(0,1).toUpperCase()}</span>
     <div className="org-manager-identity"><strong>{m.full_name||m.username}</strong><span>@{m.username} · {m.email}</span></div>
     <div className="org-manager-scopes">{m.responsibilities.map(r=><span className={r.whole_department?'org-manager-whole':'org-manager-sub'} key={r.group_id}>{r.whole_department?(r.inherited?'Whole department · Inherited':'Whole department'):r.name}</span>)}{!m.is_active&&<span className="org-manager-inactive">Account inactive</span>}</div>
   </article>)}
   {!(detail.managers||[]).length?<p className="org-manager-empty">No Manager has been assigned yet. Admin can assign Managed Departments from Users → Access.</p>:!(detail.managers||[]).some(m=>[m.full_name,m.username,m.email,...m.responsibilities.map(r=>r.whole_department?'Whole department':r.name)].some(v=>v?.toLowerCase().includes(managerSearch.toLowerCase())))&&<p className="org-manager-empty">No managers match your search.</p>}
   </div>
 </section></>}
 {tab==='subgroups'&&<section className="rbac-card org-members-panel" aria-label="Department sub departments">
   <div className="org-members-toolbar"><div><h3>Sub Departments <span className="org-member-count">{children.length}</span></h3><p>Organize teams within {current.name} by country.</p></div>{current.full_control&&can('departments.subgroups')&&<button className="cfg-btn-save" disabled={!current.region_id||!current.is_active} onClick={()=>open(null,current)}><Plus size={16}/>Create New Sub Department</button>}</div>
   <div className="org-members-search"><Search size={18}/><input aria-label="Search sub departments" placeholder="Search by sub department name or country…" value={subgroupSearch} onChange={e=>setSubgroupSearch(e.target.value)}/><span>{visibleSubgroups.length} {visibleSubgroups.length===1?'sub department':'sub departments'}</span></div>
   <div className="org-subgroup-columns" aria-hidden="true"><span>SUB DEPARTMENT</span><span>COUNTRY</span><span>STATUS</span><span>ACTION</span></div>
   <div className="org-members-directory">{visibleSubgroups.map(child=><Link className="org-subgroup-row" key={child.id} to={'/departments/'+child.id} aria-label={'Open sub department '+child.name}>
     <div className="org-subgroup-name"><span className="org-subgroup-icon"><Users size={18}/></span><strong>{child.name}</strong></div>
     <span className="org-subgroup-country"><MapPin size={14}/>{child.country_name||'Not configured'}</span>
     <span className={'org-subgroup-status'+(child.is_active?'':' is-inactive')}>{child.is_active?'Active':'Inactive'}</span>
     <span className="org-subgroup-open">Open<ArrowRight size={14}/></span>
   </Link>)}{!visibleSubgroups.length&&<div className="org-members-empty"><Users size={28}/><h3>{children.length?'No matching sub departments':'No sub departments yet'}</h3><p>{children.length?'Try another sub department name or country.':'Create a sub department to organize teams within this department.'}</p></div>}</div>
 </section>}

 {tab==='findings'&&<DepartmentFindings key={current.id} department={current} canEdit={admin||current.full_control&&can('departments.view')}/> }

 {tab==='members'&&<section className="rbac-card org-members-panel" aria-label="Department members">
   <div className="org-members-toolbar">
     <div><h3>Team members <span className="org-member-count">{members.length}</span></h3><p>People with access to this {current.parent_id?'sub department':'department'}.</p></div>
     {can('departments.members')&&<button className="cfg-btn-save org-blue" disabled={!current.is_active||root?.is_active===false} onClick={()=>setAdd(true)}><Plus size={16}/>Add Existing Users</button>}
   </div>
   <div className="org-members-search"><Search size={18}/><input aria-label="Search department members" placeholder="Search by name, email or role…" value={search} onChange={e=>setSearch(e.target.value)}/><span>{visibleMembers.length} {visibleMembers.length===1?'member':'members'}</span></div>
   <div className="org-members-columns" aria-hidden="true"><span>MEMBER</span><span>ROLE</span><span>DEPARTMENT / SUB DEPARTMENT ACCESS</span></div>
   <div className="org-members-directory">
     {visibleMembers.map(u=><article className="org-member-row" key={u.id}>
       <div className="org-member-person"><span className="org-member-avatar" aria-hidden="true">{u.full_name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span><div><strong>{u.full_name}</strong><span>{u.email}</span></div></div>
       <div className="org-member-role-cell"><span className={'org-member-role'+(u.role_name?.toLowerCase().includes('manager')?' is-manager':'')}>{u.role_name}</span></div>
       <div className="org-member-access">{u.assignments.map(a=><div className="org-member-assignment" key={a.id}><div><span className="org-member-scope">{tree.find(g=>g.id===a.id)?.label||a.name}</span>{a.inherited&&<small className="org-inherited-badge">Inherited</small>}</div>{a.removable&&can('departments.members')&&<button className="org-remove-member" aria-label={'Remove '+u.full_name+' from '+(tree.find(g=>g.id===a.id)?.label||a.name)} onClick={()=>openConfirm({title:'Remove membership?',message:'This removes only this direct assignment. Other department and sub department grants remain.',run:()=>api.delete(`/departments/${a.id}/members/${u.id}`)})}><Trash2 size={14}/>Remove</button>}</div>)}</div>
     </article>)}
     {!visibleMembers.length&&<div className="org-members-empty"><Users size={28}/><h3>{members.length?'No matching members':'No members yet'}</h3><p>{members.length?'Try a different name, email or role.':'Add existing users to build this team.'}</p></div>}
   </div>
 </section>}

 </>}
 {geographyOpen&&admin&&<OrgDialog title="Regions and Countries" onClose={()=>setGeographyOpen(false)}><button type="button" className="cfg-btn-cancel" onClick={()=>setGeographyOpen(false)}>Back to Departments</button><DepartmentSettings onSaved={load}/></OrgDialog>}
 {form&&<OrgDialog title={form.parentId?'Sub Department details':'Department details'} onClose={()=>{if(!busy)setForm(null)}}><form onSubmit={save}><h2>{form.id?'Edit':'Create'} {form.parentId?'Sub Department':'Department'}</h2><label>Name *<input required maxLength={255} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>{!form.parentId?<label>Region *<select required value={form.regionId} onChange={e=>setForm({...form,regionId:e.target.value})}><option value="">Select Region</option>{geo.regions.filter(r=>r.is_active||r.id===form.regionId).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>:<><p>Region: {geo.regions.find(r=>r.id===form.regionId)?.name||'Not configured'} (inherited)</p><label>Country *<select required value={form.countryId} onChange={e=>setForm({...form,countryId:e.target.value})}><option value="">Select Country</option>{geo.countries.filter(c=>c.region_id===form.regionId&&(c.is_active||c.id===form.countryId)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}<label><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Active</label>{formError&&<div className="org-dialog-error" role="alert"><AlertCircle size={18}/><span>{formError}</span></div>}<div className="rbac-actions"><button type="button" className="cfg-btn-cancel" disabled={busy} onClick={()=>setForm(null)}>Cancel</button><button className="cfg-btn-save" disabled={busy}>{busy?'Saving…':'Save'}</button></div></form></OrgDialog>}
 {add&&<AddOrganizationMembers groups={scopes} settings={settings} initial={current?.full_control?[current.id]:[]} onClose={()=>setAdd(false)} onSaved={load}/>}
 {confirm&&<OrgDialog title={confirm.title} onClose={()=>{if(!busy)setConfirm(null)}}><h2>{confirm.title}</h2><p>{confirm.message}</p>{confirmError&&<div className="org-dialog-error" role="alert"><AlertCircle size={18}/><span>{confirmError}</span></div>}<div className="rbac-actions"><button className="cfg-btn-cancel" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button><button className="cfg-btn-save org-red" disabled={busy} onClick={run}>{busy?'Updating…':'Confirm'}</button></div></OrgDialog>}
 </div>;
}
