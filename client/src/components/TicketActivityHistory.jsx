import React, {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {groupTicketActivityByDate,activityLabel} from '../utils/ticketActivity';
import {fmt} from '../utils/dateUtils';

export default function TicketActivityHistory({entries}){
 const days=groupTicketActivityByDate(entries);
 const [selected,setSelected]=useState(null);
 const dialogRef=useRef(null);
 useEffect(()=>{
  if(!selected)return;
  const dialog=dialogRef.current,previousOverflow=document.body.style.overflow;
  dialog.showModal();
  document.body.style.overflow='hidden';
  return ()=>{dialog.close();document.body.style.overflow=previousOverflow;};
 },[selected]);
 if(!days.length)return <p className="ip-empty-msg">No activity yet</p>;
 return <><div className="audit-list audit-group-list">
  {days.map((day,index)=><button type="button" key={day.id} onClick={()=>setSelected(day)} aria-haspopup="dialog" className={`audit-item audit-group audit-group-card audit-date-card${index===0?' audit-item-latest':''}`}>
   <div className="audit-dot" aria-label={index===0?'Latest activity date':undefined}/>
   <div className="audit-content">
    <div className="audit-action">{day.label}</div>
    <span className="audit-group-open">{day.groups.length} {day.groups.length===1?'activity':'activities'} · View all →</span>
   </div>
  </button>)}
 </div>
 {selected&&createPortal(<dialog ref={dialogRef} className="audit-detail-dialog" aria-labelledby="audit-detail-title" onCancel={()=>setSelected(null)} onClose={()=>setSelected(null)} onClick={event=>{if(event.target===event.currentTarget)setSelected(null);}}>
  <div className="audit-detail-shell">
   <header className="audit-detail-header">
    <div><h2 id="audit-detail-title">Activity · {selected.label}</h2><p>{selected.groups.length} {selected.groups.length===1?'activity':'activities'} · Latest first</p></div>
    <button type="button" className="audit-detail-close" aria-label="Close activity details" onClick={()=>setSelected(null)} autoFocus>×</button>
   </header>
   <div className="audit-detail-body">
    {selected.groups.map(group=><section className="audit-day-event" key={group.id}>
     <h3>{group.title}</h3>
     <p className="audit-day-meta">{group.user_name} · {fmt(group.created_at)}</p>
     <p className="audit-detail-summary">{group.summary}</p>
     <div className="audit-group-records">{group.entries.map(entry=><div key={entry.id}>
      <strong>{activityLabel(entry)}</strong>
      {(entry.old_value||entry.new_value)?<div className="audit-change">
       {entry.old_value&&<span className="audit-old">{entry.old_value}</span>}
       {entry.old_value&&entry.new_value&&' → '}
       {entry.new_value&&<span className="audit-new">{entry.new_value}</span>}
      </div>:<span>{entry.action.replaceAll('_',' ')}</span>}
     </div>)}</div>
    </section>)}
   </div>
  </div>
 </dialog>,document.body)}
 </>;
}
