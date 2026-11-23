import React,{useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Inbox,MailOpen,UserRound,Users,Layers,Search,RefreshCw,ArrowUpRight,ChevronLeft,ChevronRight,CalendarDays,CheckCircle2,AlertCircle} from 'lucide-react';
import {format,formatDistanceToNow,subDays,startOfMonth} from 'date-fns';
import api from '../../api/axios';
import {useNotifications} from '../../context/NotificationContext';
import {StatusBadge,PriorityBadge} from '../../components/Badge';
import './MyQuery.css';

const STATES=[['NEW','New','#2563eb'],['OPEN','Open','#059669'],['ASSIGNED','Assigned','#0369a1'],['IN_PROGRESS','In Progress','#d97706'],['WORK_IN_PROGRESS','Work In Progress','#ea580c'],['PENDING','Pending','#b45309'],['ON_HOLD','On Hold','#7c3aed'],['RESOLVED','Resolved','#0d9488'],['CLOSED','Closed','#475569'],['REOPENED','Reopened','#dc2626'],['CANCELLED','Cancelled','#9f1239']];
const VIEWS=[['unopened','Unopened','Open each ticket to clear',MailOpen,'red'],['mine','Assigned to me','Your personal assignments',UserRound,'blue'],['unassigned','Unassigned','Available in your permitted queues',Users,'orange'],['all','All inbox tickets','Personal + unassigned',Layers,'teal']];
const initial={summary:{total:0,mine:0,unassigned:0,unopened:0},counts:{},tickets:[],pagination:{page:1,pages:0,total:0}};

export default function MyQuery(){
 const {queryUnopened}=useNotifications();
 const [view,setView]=useState('all'),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [period,setPeriod]=useState('all'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const requestId=useRef(0),listScroll=useRef(null);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1)},300);return()=>clearTimeout(timer)},[search]);
 let startDate='',endDate='';
 if(period==='custom'){startDate=start;endDate=end}
 else if(period!=='all'){const now=new Date();endDate=format(now,'yyyy-MM-dd');startDate=period==='today'?endDate:format(period==='week'?subDays(now,6):startOfMonth(now),'yyyy-MM-dd')}
 useEffect(()=>{listScroll.current?.scrollTo({top:0,left:0})},[view,status,query,startDate,endDate,page]);
 const invalidDates=period==='custom'&&(!startDate||!endDate||startDate>endDate);
 useEffect(()=>{
  if(invalidDates){setLoading(false);return}
  let active=true;const controllers=new Set();
  const load=async(background=false)=>{
   const sequence=++requestId.current,controller=new AbortController();controllers.add(controller);
   if(!background)setLoading(true);
   const params=new URLSearchParams({view,page:String(page),limit:'20'});
   if(status)params.set('status',status);if(query)params.set('search',query);
   if(startDate)params.set('startDate',startDate);if(endDate)params.set('endDate',endDate);
   try{const{data:result}=await api.get('/dashboard/query?'+params,{signal:controller.signal});
    if(!result.summary||!Array.isArray(result.tickets))throw new Error('The inbox is being updated. Please refresh shortly.');
    if(active&&sequence===requestId.current){setData(result);setError('');if(result.pagination.pages&&page>result.pagination.pages)setPage(result.pagination.pages)}
   }catch(e){if(active&&sequence===requestId.current&&!controller.signal.aborted)setError(e.response?.data?.message||'Could not load your ticket inbox. Please retry.')}
   finally{controllers.delete(controller);if(active&&sequence===requestId.current)setLoading(false)}
  };
  load();const timer=setInterval(()=>load(true),10000),focus=()=>load(true);window.addEventListener('focus',focus);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);controllers.forEach(c=>c.abort())};
 },[view,status,query,startDate,endDate,page,refresh,invalidDates,queryUnopened]);
 const chooseView=next=>{setView(next);setStatus('');setPage(1)};
 const reset=()=>{setView('all');setStatus('');setSearch('');setQuery('');setPeriod('all');setStart('');setEnd('');setPage(1)};
 const statuses=[...STATES,...Object.keys(data.counts).filter(key=>!STATES.some(s=>s[0]===key)).map(key=>[key,key.replaceAll('_',' '),'#475569'])];
 const viewTotal=Object.values(data.counts).reduce((sum,n)=>sum+Number(n),0);
 return <div className="query-inbox">
  <header className="qi-hero"><div className="qi-hero-copy"><span className="qi-eyebrow"><Inbox size={16}/> YOUR TICKET INBOX</span><h1>My Query</h1><p>Know what arrived. Find what needs you. Open a ticket to mark it seen.</p></div><div className="qi-hero-count"><strong>{queryUnopened}</strong><span>not yet opened</span><small>Across all dates</small></div></header>
  <div className="qi-view-cards" aria-label="Ticket inbox views">{VIEWS.map(([key,label,hint,Icon,color])=><button type="button" key={key} className={`qi-view qi-${color} ${view===key?'is-selected':''}`} aria-pressed={view===key} onClick={()=>chooseView(key)}><span className="qi-view-icon"><Icon size={21}/></span><span className="qi-view-copy"><span>{label}</span><strong>{loading?'—':data.summary[key==='all'?'total':key]}</strong><small>{hint}</small></span><ArrowUpRight className="qi-view-arrow" size={17}/></button>)}</div>
  <section className="qi-panel" aria-label="Search and filter tickets">
   <div className="qi-filter-bar"><div className="qi-search"><Search size={18}/><input aria-label="Search inbox tickets" maxLength={200} placeholder="Search ticket number, subject or customer…" value={search} onChange={e=>setSearch(e.target.value)}/></div><label className="qi-period"><CalendarDays size={17}/><select aria-label="Filter inbox by date" value={period} onChange={e=>{setPeriod(e.target.value);setPage(1)}}><option value="all">All dates</option><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="custom">Custom range</option></select></label><button type="button" className="qi-icon-button" aria-label="Refresh ticket inbox" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={18}/></button><button type="button" className="qi-reset" onClick={reset}>Reset filters</button></div>
   {period==='custom'&&<div className="qi-date-range"><label>From<input aria-label="Inbox start date" type="date" value={start} onChange={e=>{setStart(e.target.value);setPage(1)}}/></label><label>To<input aria-label="Inbox end date" type="date" min={start} value={end} onChange={e=>{setEnd(e.target.value);setPage(1)}}/></label>{invalidDates&&<span role="status">Choose a valid start and end date.</span>}</div>}
   <div className="qi-states-label">TICKET STATES <span>Choose any state to filter this view</span></div><div className="qi-states"><button type="button" className={!status?'is-selected':''} aria-pressed={!status} onClick={()=>{setStatus('');setPage(1)}}>All states <b>{loading?'—':viewTotal}</b></button>{statuses.map(([key,label,color])=><button type="button" key={key} style={{'--state-color':color}} className={status===key?'is-selected':''} aria-pressed={status===key} onClick={()=>{setStatus(key);setPage(1)}}><span className="qi-state-dot"/>{label}<b>{loading?'—':data.counts[key]||0}</b></button>)}</div>
  </section>
  <section className="qi-panel qi-ticket-panel" aria-label="Inbox tickets" aria-busy={loading}>
   <div className="qi-list-heading"><div><h2>{VIEWS.find(v=>v[0]===view)[1]}{status&&<span> / {statuses.find(s=>s[0]===status)?.[1]||status}</span>}</h2><p>{loading?'Loading tickets…':`${data.pagination.total} ${data.pagination.total===1?'ticket':'tickets'}`} · Unopened first · Scroll to browse</p></div><span className="qi-live"><span/> Updates every 10 seconds</span></div>
   {error&&<div className="qi-error" role="alert"><AlertCircle size={18}/>{error}<button type="button" onClick={()=>setRefresh(n=>n+1)}>Retry</button></div>}
   {!error&&!invalidDates&&<><div className="qi-ticket-scroll" ref={listScroll} role="region" aria-label="Scrollable inbox ticket list" tabIndex={0}><div className="qi-table-head" aria-hidden="true"><span>TICKET</span><span>DEPARTMENT</span><span>STATE</span><span>PRIORITY</span><span>UPDATED</span><span/></div><ul className="qi-ticket-list">{!loading&&data.tickets.map(ticket=><li key={ticket.id}><Link to={'/tickets/'+ticket.id} className={'qi-ticket '+(ticket.is_unopened?'is-unopened':'')} aria-label={`Open ${ticket.ticket_number}${ticket.is_unopened?', unopened':''}`}><div className="qi-ticket-main"><div className="qi-ticket-number">{ticket.is_unopened&&<span className="qi-unopened-dot"/>}<strong>{ticket.ticket_number}</strong>{ticket.is_unopened&&<span className="qi-new-tag">Unopened</span>}</div><span className="qi-ticket-subject">{ticket.short_description}</span><small className="qi-ticket-meta"><span className="qi-customer">{ticket.customer_name||'No customer'}</span><span className={ticket.assigned_to?'qi-assigned-label':'qi-unassigned-label'}>{ticket.assigned_to?'Assigned to you':'Unassigned'}</span></small></div><div className="qi-ticket-department"><strong>{ticket.department_name||'No department'}</strong><small>{ticket.sub_department_name||'Department level'}</small></div><StatusBadge status={ticket.status}/><PriorityBadge priority={ticket.priority}/><time dateTime={ticket.updated_at} title={format(new Date(ticket.updated_at),'PPpp')}>{formatDistanceToNow(new Date(ticket.updated_at),{addSuffix:true})}<small>{format(new Date(ticket.updated_at),'dd MMM, HH:mm')}</small></time><span className="qi-open">Open<ArrowUpRight size={16}/></span></Link></li>)}</ul>
   {loading?<div className="qi-empty"><RefreshCw size={25}/><p>Loading your inbox…</p></div>:!data.tickets.length&&<div className="qi-empty"><CheckCircle2 size={36}/><h3>{view==='unopened'&&!status&&!query&&period==='all'?'You’re all caught up':'No tickets in this view'}</h3><p>{view==='unopened'?'Tickets you have not opened will appear here.':'Try another state, date range or search.'}</p></div>}
   </div><div className="qi-pagination"><span>Opening this page does not clear the badge. Open each ticket to mark it seen.</span><div><button type="button" aria-label="Previous inbox page" disabled={loading||page===1} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={17}/></button><span>Page {page} of {Math.max(1,data.pagination.pages)}</span><button type="button" aria-label="Next inbox page" disabled={loading||page>=data.pagination.pages} onClick={()=>setPage(n=>n+1)}><ChevronRight size={17}/></button></div></div></>}
  </section>
  <p className="qi-footnote">Unassigned means no person is assigned; its ticket state can still be New, Pending, On Hold or any other state. Only tickets you are allowed to view appear here.</p>
 </div>;
}
