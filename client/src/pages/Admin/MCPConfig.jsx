import React,{useEffect,useState,useCallback,useRef} from 'react';
import GmailConfig from './GmailConfig';
import EmailAIConfig from './EmailAIConfig';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import './MCPConfig.css';
import SavedSecret from '../../components/SavedSecret';
import {aiStatus} from '../../utils/aiStatus';
const blank=()=>({address:'',is_active:true,allowed_department_ids:[],sender_domains:[]});
export default function MCPConfig(){
 const [data,setData]=useState(null),[box,setBox]=useState(blank),[busy,setBusy]=useState(false),[token,setToken]=useState(''),[rotate,setRotate]=useState(false),[enabled,setEnabled]=useState(false),[error,setError]=useState('');
 const [step,setStep]=useState('server');
 const [editorOpen,setEditorOpen]=useState(false),[editorVersion,setEditorVersion]=useState(0);
 const editorRef=useRef(null),addressRef=useRef(null),mailboxesRef=useRef(null);
 const openEditor=(item)=>{
  setBox(item?{id:item.id,address:item.address,is_active:item.is_active,allowed_department_ids:[...item.allowed_department_ids],sender_domains:[...item.sender_domains]}:blank());
  setError('');setEditorOpen(true);setEditorVersion(value=>value+1);
 };
 useEffect(()=>{if(editorOpen){editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'});addressRef.current?.focus({preventScroll:true});}},[editorOpen,editorVersion]);
 const gmailUpdated=useCallback(gmail=>setData(old=>old?{...old,gmail,gmailConnected:gmail.connections.some(c=>c.status==='connected')}:old),[]);
 const aiUpdated=useCallback(ai=>setData(old=>old?{...old,ai,aiConnected:ai.connected}:old),[]);
 const load=async()=>{const {data:next}=await api.get('/config/admin/mcp');setData(next);setEnabled(next.enabled);};
 useEffect(()=>{load().catch(()=>setError('Could not load MCP configuration. Please retry.'));if(window.location.search?.includes('gmail='))setStep('gmail');const timer=window.setInterval(()=>api.get('/config/admin/mcp').then(({data:next})=>setData(next)).catch(()=>{}),15000);return ()=>window.clearInterval(timer);},[]);
 const run=async(fn)=>{setBusy(true);setError('');try{await fn();}catch(e){const message=e.response?.data?.message||'Could not complete this action. Please retry.';setError(message);toast.error(message);}finally{setBusy(false);}};
 const update=(name,value)=>setBox(old=>({...old,[name]:value}));
 if(!data)return <div className="mcp-page"><h1>MCP Server Configuration</h1><p>{error||'Loading configuration…'}</p>{error&&<button onClick={()=>run(load)}>Retry</button>}</div>;
 const ctx=data.context,groups=ctx.groups;
 const aiCard=aiStatus(data.ai);
 const serverComplete=!!data.connected;
 const gmailComplete=serverComplete&&data.gmail.connections.some(c=>c.status==='connected'&&!c.is_paused&&c.is_active&&data.mailboxes.some(b=>b.id===c.mailbox_id&&b.ready));
 const steps=[{id:'server',title:'MCP server',detail:'Secure access & register mailboxes',complete:serverComplete,unlocked:true,status:serverComplete?'Connected and ready':data.hasToken?'Finish connection check':'Setup required'}, {id:'gmail',title:'Gmail mailbox',detail:'Authorize your support inbox',complete:gmailComplete,unlocked:serverComplete,status:gmailComplete?'Connected and ready':'Connect your mailbox'}, {id:'ai',title:'AI routing',detail:'Choose a model & enable routing',complete:gmailComplete&&aiCard.ready,unlocked:gmailComplete,status:aiCard.label}];
 const activeStep=steps.find(item=>item.id===step&&item.unlocked)||steps.find(item=>item.unlocked&&!item.complete)||steps[0];
 const current=activeStep.id;
 const checkServer=()=>run(async()=>{try{const response=await api.post('/config/admin/mcp/test');toast.success(response.data.message);setStep('gmail');}finally{await load();}});
 return <main className="mcp-page">
  <header className="mcp-heading"><div><p className="mcp-eyebrow">ADMIN / INTEGRATIONS</p><h1>Email automation setup</h1><p>Connect your tools in three steps. Select a card to manage its configuration.</p></div><span className="mcp-progress">{steps.filter(item=>item.complete).length} of 3 steps ready</span></header>
  {error&&<p className="mcp-error" role="alert">{error}</p>}
  {data.credentialError&&<p className="mcp-error" role="alert">{data.credentialError}</p>}
  <div className="mcp-steps" role="tablist" aria-label="Email automation setup">{steps.map((item,index)=><button type="button" role="tab" id={'mcp-tab-'+item.id} aria-controls={'mcp-step-'+item.id} aria-selected={current===item.id} disabled={!item.unlocked||busy} key={item.id} className={`mcp-step-card ${current===item.id?'is-selected':''} ${item.complete?'is-complete':''}`} onClick={()=>{setStep(item.id);setError('');}}><span className="mcp-step-number">{item.complete?'✓':index+1}</span><span className="mcp-step-content"><strong>{item.title}</strong><small>{item.detail}</small><span className="mcp-step-status">{!item.unlocked?'Complete the previous step first':item.status}</span></span><span className="mcp-step-arrow" aria-hidden="true">{item.unlocked?'→':'🔒'}</span></button>)}</div>
  <section className="mcp-workspace" role="tabpanel" id={'mcp-step-'+current} aria-labelledby={'mcp-tab-'+current}>
  <div className="mcp-workspace-heading"><div><p className="mcp-eyebrow">STEP {steps.findIndex(item=>item.id===current)+1} / 3</p><h2>{activeStep.title}</h2></div><span className={'mcp-pill '+(activeStep.complete?'is-ready':'')}>{activeStep.status}</span></div>
  {current==='server'&&<>
  <section className="mcp-panel"><h2>Server settings</h2>
   <div className="mcp-grid"><label className="mcp-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={busy}/>Enable MCP server</label><label>Endpoint<input readOnly value={new URL(data.endpoint,window.location.origin).href}/></label></div>
   <div className="mcp-meta-row"><span>Streamable HTTP</span><span>Bearer token authentication</span><span>{data.checkedAt?'Verified '+new Date(data.checkedAt).toLocaleString():'Not checked yet'}</span></div>
   {data.hasToken&&<SavedSecret label="Integration credential" saved kind="mcp" editable={false}/>}

   <label className="mcp-check"><input type="checkbox" checked={rotate} onChange={e=>setRotate(e.target.checked)} disabled={busy}/>Generate a new integration credential</label>
   <p>A new credential replaces the current one. Update connected integrations with the new value. The saved credential can be copied by an Admin.</p>
   <button disabled={busy} onClick={()=>run(async()=>{const response=await api.post('/config/admin/mcp',{enabled,generateToken:rotate});if(response.data.generatedToken)setToken(response.data.generatedToken);setRotate(false);toast.success(response.data.message);await load();})}>Save server settings</button>
   {token&&<div className="mcp-token" role="status"><strong>New integration credential saved securely.</strong><p>Use Copy beside Integration credential to copy it. Update integrations that use the previous credential.</p><button className="mcp-secondary" onClick={()=>setToken('')}>Dismiss</button></div>}
   {!!data.allowedMailboxes.length&&<p>Server restriction: only these mailboxes may use this credential: {data.allowedMailboxes.join(', ')}.</p>}
  </section>
  <section className="mcp-panel" ref={mailboxesRef}><div className="mcp-section-heading"><h2>Configured mailboxes</h2><button type="button" disabled={busy} aria-controls="mcp-mailbox-editor" aria-expanded={editorOpen&&!box.id} onClick={()=>openEditor()}>Add mailbox</button></div>
   <div className="mcp-mailboxes">{data.mailboxes.length?data.mailboxes.map(item=><button type="button" className={`mcp-mailbox ${editorOpen&&box.id===item.id?'selected':''}`} key={item.id} disabled={busy} onClick={()=>openEditor(item)}><strong>{item.address}</strong><span>{!item.is_active?'Disabled':item.ready?'Settings complete':'Setup required'}</span>{item.problems.map(problem=><small key={problem}>{problem}</small>)}</button>):<p>No mailboxes configured. Click Add mailbox to set up your support email address.</p>}</div>
  </section>
  {editorOpen&&<form id="mcp-mailbox-editor" ref={editorRef} className="mcp-panel mcp-mailbox-editor" aria-labelledby="mcp-mailbox-editor-title" onSubmit={e=>{e.preventDefault();run(async()=>{const path='/config/admin/mcp/mailboxes'+(box.id?'/'+box.id:'');const payload={address:box.address,is_active:box.is_active,allowed_department_ids:box.allowed_department_ids,sender_domains:box.sender_domains.filter(Boolean)};const response=await api[box.id?'put':'post'](path,payload);toast.success(response.data.message);await load();setEditorOpen(false);setBox(blank());mailboxesRef.current?.scrollIntoView({behavior:'smooth',block:'start'});});}}>
   <div className="mcp-section-heading"><h2 id="mcp-mailbox-editor-title">{box.id?'Edit mailbox settings':'Add mailbox settings'}</h2><button type="button" className="mcp-secondary" disabled={busy} onClick={()=>{setEditorOpen(false);setError('');}}>Cancel</button></div>
   {error&&<p className="mcp-error" role="alert">{error}</p>}
   <fieldset disabled={busy}>
   <div className="mcp-grid"><label>Support mailbox address *<input ref={addressRef} required type="email" maxLength={254} value={box.address} readOnly={!!box.id} onChange={e=>update('address',e.target.value)}/></label><label className="mcp-check"><input type="checkbox" checked={box.is_active} onChange={e=>update('is_active',e.target.checked)}/>Enable processing for this mailbox</label>
   </div><details><summary>Advanced settings (optional)</summary><div className="mcp-grid"><label className="mcp-wide">Allowed sender domains (optional)<input placeholder="dell.com, example.com" value={box.sender_domains.join(', ')} onChange={e=>update('sender_domains',e.target.value.split(',').map(x=>x.trim().toLowerCase()))}/><small>Leave empty to accept any sender. Separate domains with commas.</small></label></div>
   <h3>Routing departments</h3><p>Leave all unchecked to allow all active departments. Selecting a whole department includes its sub departments.</p>
   <div className="mcp-scope">{groups.map(g=><label key={g.id} className="mcp-check"><input type="checkbox" checked={box.allowed_department_ids.includes(g.id)} onChange={e=>update('allowed_department_ids',e.target.checked?[...box.allowed_department_ids,g.id]:box.allowed_department_ids.filter(id=>id!==g.id))}/>{g.parent_id?`${groups.find(p=>p.id===g.parent_id)?.name||'Department'} / `:''}{g.name}</label>)}</div>
   </details><p>If no department can be identified, the email ticket is assigned to an active Admin for review. If no active Admin is available, it stays in the Admin Needs routing queue.</p>
   <p>AI reads ticket details from each new email. Missing details stay empty and show Details incomplete.</p>
   <button type="submit">{busy?'Please wait…':'Save mailbox settings'}</button></fieldset>
  </form>}
  <div className="mcp-step-footer"><p>Save the server settings and register a mailbox, then verify the MCP connection.</p><button className="mcp-success" disabled={busy||!data.configured} onClick={checkServer}>{serverComplete?'Verify & continue to Gmail →':'Check connection & continue →'}</button></div>
  </>}
  {current==='gmail'&&<><GmailConfig initial={data.gmail} mailboxes={data.mailboxes} onChange={gmailUpdated} mcpReady={serverComplete}/><div className="mcp-step-footer"><button className="mcp-secondary" onClick={()=>setStep('server')}>← MCP server</button><button className="mcp-success" disabled={!gmailComplete} onClick={()=>setStep('ai')}>Continue to AI routing →</button></div></>}
  {current==='ai'&&<><EmailAIConfig initial={data.ai} onChange={aiUpdated}/><div className="mcp-step-footer"><button className="mcp-secondary" onClick={()=>setStep('gmail')}>← Gmail mailbox</button><span className="mcp-ready">{aiCard.ready?'✓ Email automation is ready':'Save and check your provider, then enable AI routing.'}</span></div></>}
  </section>
 </main>;
}
