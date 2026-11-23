import React,{useEffect,useState} from 'react';
import {Plus,Search,Edit2,Trash2,Save,FileText,X} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import OrgDialog from './OrganizationDialog';

export default function DepartmentFindings({department,canEdit}){
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState('');
 const [editor,setEditor]=useState(null),[removing,setRemoving]=useState(null),[busy,setBusy]=useState(false),[dialogError,setDialogError]=useState('');
 const url=`/departments/${department.id}/findings`;
 const load=async()=>{setLoading(true);setError('');try{setItems((await api.get(url)).data.findings)}catch(e){setError(e.response?.data?.message||'Could not load findings.')}finally{setLoading(false)}};
 useEffect(()=>{load();},[department.id]);
 const save=async e=>{e.preventDefault();if(busy)return;setBusy(true);setDialogError('');try{
  await api[editor.id?'put':'post'](url+(editor.id?'/'+editor.id:''),{content:editor.content});
  setEditor(null);toast.success('Department findings saved successfully');await load();
 }catch(e){setDialogError(e.response?.data?.message||'Could not save findings.')}finally{setBusy(false)}};
 const remove=async()=>{if(busy)return;setBusy(true);setDialogError('');try{await api.delete(url+'/'+removing.id);setRemoving(null);toast.success('Finding removed');await load()}catch(e){setDialogError(e.response?.data?.message||'Could not remove finding.')}finally{setBusy(false)}};
 const visible=items.filter(f=>f.content.toLowerCase().includes(query.toLowerCase()));
 return <section className="rbac-card org-findings" aria-label="Department Findings">
  <div className="org-members-toolbar"><div><h3>Department Findings <span className="org-member-count">{items.length}</span></h3><p>Emails, customer names, text and references for {department.name}.</p></div>
   {canEdit&&<button type="button" className="cfg-btn-save org-blue" onClick={()=>{setDialogError('');setEditor({content:''});}}><Plus size={16}/>Add Findings</button>}
  </div>
  <div className="org-members-search"><Search size={18}/><input aria-label="Search findings" placeholder="Search findings…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
  {error&&<div role="alert" className="org-findings-error">{error} <button type="button" className="cfg-btn-cancel" onClick={load}>Retry</button></div>}
  {loading?<p role="status">Loading findings…</p>:!error&&<div className="org-findings-list" role="region" aria-label="Scrollable department findings" tabIndex={0}>
   {visible.map(f=><article className="org-finding" key={f.id}>
    <div className="org-finding-top"><span><FileText size={17}/>{f.updated_by_name||f.author_name||'System'} · {new Date(f.updated_at).toLocaleString()}</span>
     {canEdit&&<div className="rbac-actions"><button type="button" className="cfg-btn-cancel" aria-label="Edit finding" onClick={()=>{setDialogError('');setEditor({id:f.id,content:f.content});}}><Edit2 size={14}/>Edit</button><button type="button" className="cfg-btn-save org-red" aria-label="Delete finding" onClick={()=>{setDialogError('');setRemoving(f);}}><Trash2 size={14}/>Delete</button></div>}
    </div><div className="org-finding-content">{f.content}</div>
   </article>)}
   {!visible.length&&<div className="org-members-empty"><FileText size={28}/><h3>{items.length?'No matching findings':'No findings yet'}</h3><p>{items.length?'Try another search.':canEdit?'Click Add Findings to save text and references for this team.':'No findings have been added for this team.'}</p></div>}
  </div>}
  {editor&&<OrgDialog title={editor.id?'Edit Finding':'Add Findings'} onClose={()=>{if(!busy)setEditor(null);}}><form onSubmit={save}>
   <div className="org-finding-editor-heading"><h2>{editor.id?'Edit Finding':'Add Findings'}</h2><button type="button" className="cfg-btn-cancel" aria-label="Close findings editor" disabled={busy} onClick={()=>setEditor(null)}><X size={17}/></button></div>
   <p>{department.name}</p><label htmlFor="department-finding-text">Findings text *</label>
   <p id="department-finding-help" style={{margin:"4px 0 10px",fontSize:12,color:"#475569"}}>Separate individual emails, names and references with commas. You can also use new lines for longer notes.</p>
   <textarea id="department-finding-text" aria-describedby="department-finding-help" className="org-finding-editor" required autoFocus maxLength={20000} disabled={busy} value={editor.content} placeholder="Enter email addresses, customer names, example emails, notes or any references…" onChange={e=>setEditor({...editor,content:e.target.value})}/>
   <small>{editor.content.length.toLocaleString()} / 20,000 characters</small>
   {dialogError&&<div className="org-dialog-error" role="alert">{dialogError}</div>}
   <div className="rbac-actions org-finding-footer"><button type="button" className="cfg-btn-cancel" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button className="cfg-btn-save org-blue" disabled={busy||!editor.content.trim()}><Save size={15}/>{busy?'Saving…':'Save Findings'}</button></div>
  </form></OrgDialog>}
  {removing&&<OrgDialog title="Delete finding?" onClose={()=>{if(!busy)setRemoving(null);}}><h2>Delete finding?</h2><p>Remove this finding from {department.name}? Other findings and ticket data will stay unchanged.</p>{dialogError&&<div className="org-dialog-error" role="alert">{dialogError}</div>}<div className="rbac-actions"><button type="button" className="cfg-btn-cancel" disabled={busy} onClick={()=>setRemoving(null)}>Cancel</button><button type="button" className="cfg-btn-save org-red" disabled={busy} onClick={remove}><Trash2 size={15}/>{busy?'Deleting…':'Delete Finding'}</button></div></OrgDialog>}
 </section>;
}
