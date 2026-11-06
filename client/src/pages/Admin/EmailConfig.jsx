import React, { useEffect, useState } from 'react';
import { Mail, Server, Lock, Send, Loader, BookOpen, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import useAccess from '../../hooks/useAccess';
import toast from 'react-hot-toast';
import './EmailConfig.css';

const defaults={smtp_host:'',smtp_port:587,smtp_user:'',smtp_pass:'',from_name:'SERV-IT Notifications',from_email:'',encryption:'tls',is_enabled:false,auth_type:'password',oauth_client_id:'',oauth_client_secret:'',oauth_refresh_token:'',oauth_token_url:'https://oauth2.googleapis.com/token',tls_servername:'',tls_ca:''};
const secretNames=['smtp_pass','oauth_client_secret','oauth_refresh_token'];
const presets=[{name:'Microsoft 365',smtp_host:'smtp.office365.com',smtp_port:587,encryption:'tls',auth_type:'oauth2',oauth_token_url:'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token'},
  {name:'Outlook.com',smtp_host:'smtp-mail.outlook.com',smtp_port:587,encryption:'tls',auth_type:'oauth2',oauth_token_url:'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'},
  {name:'Gmail / Workspace',smtp_host:'smtp.gmail.com',smtp_port:587,encryption:'tls',auth_type:'oauth2',oauth_token_url:'https://oauth2.googleapis.com/token'},
  {name:'Generic SMTP',smtp_host:'',smtp_port:587,encryption:'tls',auth_type:'password'},
  {name:'Internal relay',smtp_host:'',smtp_port:25,encryption:'tls',auth_type:'none'}];
const message=error=>error.response?.data?.message||'The request could not be completed.';
export default function EmailConfig(){
  const {can}=useAccess(),navigate=useNavigate();
  const [form,setForm]=useState(defaults),[original,setOriginal]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[testTo,setTestTo]=useState(''),[result,setResult]=useState(null),[deliveries,setDeliveries]=useState([]),[clear,setClear]=useState({});
  const openDocs=async()=>{try{const {data}=await api.get('/kb/slug/email-configuration');navigate('/knowledge-base/'+data.article.id);}catch(e){toast.error(message(e));}};
  const load=async()=>{try{const {data}=await api.get('/config/admin/email');setForm({...defaults,...data.config});setOriginal(data.config);setClear({});setError('');}catch(e){setError(message(e));}};
  const history=async()=>{if(!can('email.history'))return;try{setDeliveries((await api.get('/config/admin/email/deliveries')).data.deliveries);}catch(e){toast.error(message(e));}};
  useEffect(()=>{load();history();},[]);
  const set=(name,value)=>{setForm(f=>({...f,[name]:value}));setResult(null);};
  const patch=()=>{
    const body={};
    for(const name of Object.keys(defaults)){
      if(secretNames.includes(name)){if(form[name])body[name]=form[name];}
      else if(form[name]!==original?.[name])body[name]=form[name];
    }
    for(const name of secretNames)if(clear[name])body['clear_'+name]=true;
    return body;
  };
  const save=async()=>{setBusy(true);try{const {data}=await api.post('/config/admin/email',patch());setForm({...defaults,...data.config});setOriginal(data.config);setClear({});toast.success(data.message); }catch(e){toast.error(message(e));}finally{setBusy(false);}};
  const test=async()=>{setBusy(true);setResult(null);try{const body=can('email.edit')?patch():{};delete body.is_enabled;body.test_to=testTo||form.smtp_user;const {data}=await api.post('/config/admin/email/test',body);setResult({ok:true,message:data.message});}catch(e){setResult({ok:false,message:message(e)});}finally{setBusy(false);}};
  const retry=async id=>{setBusy(true);try{await api.post('/config/admin/email/retry/'+id);toast.success('Delivery queued for retry');await history();}catch(e){toast.error(message(e));}finally{setBusy(false);}};
  const field=(name,label,type='text',hint)=> <div className="ec-field" key={name}><label htmlFor={'email-'+name}>{label}</label><input id={'email-'+name} type={type} value={form[name]} disabled={busy||!can('email.edit')} onChange={e=>set(name,e.target.value)} autoComplete={type==='password'?'new-password':'off'} {...(name==='smtp_port'?{min:1,max:65535,step:1}:{})}/>{hint&&<small className="ec-hint">{hint}</small>}</div>;
  const secret=(name,label)=><div key={name} className="ec-field"><label htmlFor={'email-'+name}>{label}</label><input id={'email-'+name} type="password" autoComplete="new-password" disabled={busy||!can('email.edit')||clear[name]} value={form[name]} placeholder={original?.[name+'_set']?'Saved securely - leave blank to keep':'Enter credential'} onChange={e=>set(name,e.target.value)}/>{original?.[name+'_set']&&<label className="ec-clear"><input type="checkbox" checked={!!clear[name]} disabled={busy||!can('email.edit')} onChange={e=>{setClear(c=>({...c,[name]:e.target.checked}));set(name,'');}}/>Remove saved credential</label>}</div>;
  if(error)return <div className="ec-page"><p role="alert">{error}</p><button className="ec-save-btn" onClick={load}>Retry loading settings</button></div>;
  if(!original)return <p role="status">Loading email configuration…</p>;
  const dirty=Object.keys(patch()).length>0;
  return <div className="ec-page">
    <div className="ec-header"><div><h1 className="ec-title">Email Configuration</h1><p className="ec-sub">Connect your mail service, test delivery and manage ticket notifications.</p><button className="ec-doc-link" disabled={!can('kb.view')} onClick={openDocs}><BookOpen size={14}/> View Documentation</button></div>
      <label className="ec-enable-toggle"><input aria-label="Enable email notifications" type="checkbox" checked={form.is_enabled} disabled={busy||!can('email.toggle')} onChange={e=>set('is_enabled',e.target.checked)}/><span className="ec-toggle-track"><span className="ec-toggle-thumb"/></span><span>{form.is_enabled?'Enabled':'Disabled'}</span></label></div>
    <div className="ec-card"><h2 className="ec-card-title">Quick Setup</h2><div className="ec-presets">{presets.map(({name,...values})=><button key={name} className="ec-preset-btn" disabled={busy||!can('email.edit')} onClick={()=>{setForm(f=>({...f,...values}));setResult(null);}}>{name}</button>)}</div><p className="ec-hint">Presets fill connection options. Obtain approved account details from your mail administrator. Re-enter credentials when changing server or account.</p></div>
    <div className="ec-card"><h2 className="ec-card-title"><Server size={16}/> SMTP connection</h2><div className="ec-grid">{field('smtp_host','SMTP Host *')}{field('smtp_port','Port *','number')}<div className="ec-field"><label htmlFor="email-encryption">Encryption *</label><select id="email-encryption" value={form.encryption} disabled={busy||!can('email.edit')} onChange={e=>set('encryption',e.target.value)}><option value="tls">STARTTLS (usually port 587)</option><option value="ssl">SSL/TLS (usually port 465)</option><option value="none">None - trusted internal networks only</option></select></div></div>{form.encryption==='none'&&<p className="ec-warning">This connection is unencrypted. Use it only for an approved trusted relay.</p>}</div>
    <div className="ec-card"><h2 className="ec-card-title"><Lock size={16}/> Authentication</h2><div className="ec-field"><label htmlFor="email-auth">Authentication method *</label><select id="email-auth" value={form.auth_type} disabled={busy||!can('email.edit')} onChange={e=>set('auth_type',e.target.value)}><option value="password">SMTP password / app password</option><option value="oauth2">OAuth2 with automatic token refresh</option><option value="none">No authentication (approved relay)</option></select></div>
      {form.auth_type!=='none'&&field('smtp_user',form.auth_type==='oauth2'?'Account email *':'SMTP username *')}
      {form.auth_type==='password'&&secret('smtp_pass','Password / App Password *')}
      {form.auth_type==='oauth2'&&<div className="ec-grid">{field('oauth_client_id','OAuth client ID *')}{field('oauth_token_url','OAuth HTTPS token endpoint *','url','Microsoft 365: use your tenant-specific /oauth2/v2.0/token endpoint. Gmail: https://oauth2.googleapis.com/token.')}{secret('oauth_client_secret','OAuth client secret *')}{secret('oauth_refresh_token','OAuth refresh token *')}</div>}
      <p className="ec-hint">OAuth credentials and consent must be provisioned by your identity administrator for SMTP access. App passwords work only when the provider and organization permit them. Stored credentials are encrypted and never returned to the browser.</p></div>
    <div className="ec-card"><h2 className="ec-card-title"><Mail size={16}/> Sender identity</h2><div className="ec-grid">{field('from_name','From Name')}{field('from_email','From Email *','email','Use an address the sending account is authorized to send as.')}</div></div>
    <details className="ec-card"><summary>Advanced TLS settings</summary><p className="ec-hint">Certificate verification is always enabled. For an approved private CA, provide its certificate rather than bypassing verification.</p>{field('tls_servername','TLS certificate server name','text','Optional: use the certificate hostname when connecting by IP.')}<div className="ec-field"><label htmlFor="email-ca">Trusted CA certificate (PEM)</label><textarea id="email-ca" rows={5} value={form.tls_ca} disabled={busy||!can('email.edit')} onChange={e=>set('tls_ca',e.target.value)} placeholder="-----BEGIN CERTIFICATE-----"/></div></details>
    <div className="ec-card"><h2 className="ec-card-title"><Send size={16}/> Test delivery</h2><div className="ec-test-row"><input aria-label="Test recipient" type="email" value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder={form.smtp_user||'recipient@company.com'} disabled={busy||!can('email.test')}/><button className="ec-test-btn" disabled={busy||!can('email.test')} onClick={test}>{busy?<Loader size={14}/>:<Send size={14}/>}Send Test Email</button></div><p className="ec-hint">Testing sends an actual message. It does not save changes or enable notifications. Success means the SMTP server accepted the message; check the mailbox for delivery.</p>{result&&<div role={result.ok?'status':'alert'} className={'ec-test-result '+(result.ok?'ok':'fail')}>{result.message}</div>}</div>
    <div className="ec-actions"><span className="ec-hint">{dirty?'Unsaved changes':'Settings saved'}</span><button className="ec-save-btn" disabled={busy||!dirty||(!can('email.edit')&&!can('email.toggle'))} onClick={save}>Save Configuration</button></div>
    {can('email.history')&&<div className="ec-card"><div className="ec-history-heading"><h2 className="ec-card-title">Notification delivery history</h2><button className="ec-preset-btn" onClick={history}><RefreshCw size={14}/> Refresh</button></div><p className="ec-hint">Enabled ticket notifications enter a durable queue. Temporary failures are retried up to three attempts; you can retry failed messages. The worker runs every 15 seconds.</p><div className="ec-history"><table><thead><tr><th>Recipient</th><th>Subject</th><th>Status</th><th>Attempts</th><th>Result</th></tr></thead><tbody>{deliveries.map(d=><tr key={d.id}><td>{d.recipient}</td><td>{d.subject}</td><td>{d.status==='sent'?'SMTP accepted':d.status}</td><td>{d.attempts}</td><td>{d.last_error|| (d.sent_at?new Date(d.sent_at).toLocaleString():'Waiting')}{d.status==='failed'&&can('email.retry')&&<button className="ec-preset-btn" disabled={busy} onClick={()=>retry(d.id)}>Retry</button>}</td></tr>)}</tbody></table>{!deliveries.length&&<p className="ec-hint">No queued notifications yet.</p>}</div></div>}
  </div>;
}
