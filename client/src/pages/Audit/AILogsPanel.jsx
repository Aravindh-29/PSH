import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { format } from 'date-fns';
import { X, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const names={openai:'OpenAI',gemini:'Google Gemini',claude:'Anthropic Claude'};
const purposes={email_analysis:'Email analysis',connection_check:'Connection check',recovery_check:'Recovery check'};
const time=value=>value?format(new Date(value),'dd-MMM-yyyy HH:mm:ss'):'—';
export default function AILogsPanel({selectedDate,viewMonth,onMeta}) {
 const [data,setData]=useState({logs:[],summary:{},pagination:{pages:1}});
 const [filters,setFilters]=useState({status:'',provider:'',purpose:'',search:''});
 const [page,setPage]=useState(1),[revision,refresh]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[detail,setDetail]=useState(null);
 const year=viewMonth.getFullYear(),month=viewMonth.getMonth()+1;
 useEffect(()=>{setPage(1);},[selectedDate,filters,year,month]);
 useEffect(()=>{
  let current=true;setLoading(true);
  const params=new URLSearchParams({...filters,date:selectedDate,year,month,page,limit:50,tz:Intl.DateTimeFormat().resolvedOptions().timeZone});
  api.get('/audit/ai?'+params).then(r=>{if(current){setData(r.data);onMeta({activeDays:r.data.activeDays,summary:r.data.summary});setError('');}})
   .catch(()=>{if(current)setError('AI logs could not be loaded. Please retry.');}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[selectedDate,year,month,filters,page,revision,onMeta]);
 useEffect(()=>{const timer=setInterval(()=>refresh(n=>n+1),15000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!detail)return;const close=e=>{if(e.key==='Escape')setDetail(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[detail]);
 const change=(key,value)=>{setPage(1);setFilters(f=>({...f,[key]:value}));};
 return <div className="al-main ai-log-panel">
  <div className="al-table-header"><span className="al-table-title">AI processes on {selectedDate}</span><button className="ai-log-refresh" onClick={()=>refresh(n=>n+1)} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
  <div className="ai-log-help">Each row is an AI request or a decision to skip AI. Success means the AI response passed validation; the ticket’s final routing can still use findings or Admin review. Detailed history starts when this feature is installed.</div>
  <div className="ai-log-filters">
   <input aria-label="Search AI logs" placeholder="Search ticket, mailbox, message ID or error…" value={filters.search} onChange={e=>change('search',e.target.value)}/>
   <select aria-label="AI outcome" value={filters.status} onChange={e=>change('status',e.target.value)}><option value="">All outcomes</option>{['success','failed','deferred','skipped'].map(s=><option key={s} value={s}>{s}</option>)}</select>
   <select aria-label="AI provider" value={filters.provider} onChange={e=>change('provider',e.target.value)}><option value="">All providers</option>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
   <select aria-label="AI process" value={filters.purpose} onChange={e=>change('purpose',e.target.value)}><option value="">All processes</option>{Object.entries(purposes).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
  </div>
  <div className="ai-log-counts">{['success','failed','deferred','skipped'].map(s=><span key={s} className={'ai-log-status '+s}>{data.summary[s]||0} {s}</span>)}<span>{data.summary.total||0} processes</span></div>
  {error&&<div role="alert" className="ai-log-error">{error}</div>}
  <div className="al-table-scroll"><table className="al-tbl"><thead><tr><th>Time</th><th>Provider / model</th><th>Process / ticket</th><th>Outcome</th><th>Attempts / duration</th><th>Details</th></tr></thead><tbody>
   {loading?<tr><td colSpan={6} className="al-empty">Loading…</td></tr>:error?<tr><td colSpan={6} className="al-empty">Refresh to load current logs.</td></tr>:!data.logs.length?<tr><td colSpan={6} className="al-empty">No AI processes match this date and filters.</td></tr>:data.logs.map(log=><tr key={log.id}>
    <td>{format(new Date(log.created_at),'HH:mm:ss')}</td><td>{names[log.provider]||log.provider}<small className="ai-log-secondary">{log.model}</small></td>
    <td>{purposes[log.purpose]}<small className="ai-log-secondary">{log.ticket_id?<Link to={'/tickets/'+log.ticket_id}>{log.ticket_number}</Link>:log.mailbox||'System check'}</small></td>
    <td><span className={'ai-log-status '+log.outcome}>{log.outcome}</span>{log.error_code&&<small className="ai-log-secondary">{log.error_code}</small>}</td>
    <td>{log.attempts.length} / {(log.duration_ms/1000).toFixed(2)}s</td><td><button className="ai-log-view" onClick={()=>setDetail(log)}>View details</button></td>
   </tr>)}
  </tbody></table></div>
  <div className="al-pagination"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {data.pagination.pages}</span><button disabled={page>=data.pagination.pages||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  {detail&&<div className="ai-log-overlay" onClick={()=>setDetail(null)}><section className="ai-log-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-log-title" onClick={e=>e.stopPropagation()}>
   <header><h2 id="ai-log-title">AI process details</h2><button autoFocus aria-label="Close AI log details" onClick={()=>setDetail(null)}><X size={21}/></button></header>
   <div className="ai-log-dialog-body">
    <span className={'ai-log-status '+detail.outcome}>{detail.outcome}</span>
    {detail.error_message&&<div className="ai-log-error">{detail.error_message}</div>}
    <dl>{Object.entries({'Process ID':detail.id,Process:purposes[detail.purpose],Provider:names[detail.provider],Model:detail.model,Started:time(detail.started_at),Finished:time(detail.created_at),'Total duration':detail.duration_ms+' ms',Mailbox:detail.mailbox,'Message ID':detail.message_id,'Thread ID':detail.thread_id,Ticket:detail.ticket_number,'Email capture status':detail.email_status,'Failure category':detail.failure_kind,'Error code':detail.error_code}).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{value||'—'}</dd></React.Fragment>)}</dl>
    <h3>Request attempts</h3>
    {!detail.attempts.length?<p>No provider request was sent.</p>:detail.attempts.map(a=><div className="ai-log-attempt" key={a.number}><strong>Attempt {a.number}</strong><span>{time(a.startedAt)}</span><span>HTTP {a.httpStatus||'No response'} · {a.durationMs} ms to response headers</span>{a.error&&<span>{a.error}</span>}{a.retryScheduled&&<span>Automatic retry followed this attempt.</span>}</div>)}
    <h3>Result summary</h3><pre>{JSON.stringify(detail.result_summary,null,2)}</pre>
    <p className="ai-log-help">Keys, authorization headers, email bodies, extracted personal values and raw provider responses are excluded. Use the process, message and thread IDs to investigate safely.</p>
   </div>
  </section></div>}
 </div>;
}
