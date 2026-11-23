import React, {useEffect, useId, useState} from 'react';
import api from '../api/axios';

export default function TicketOrganization({form, setForm, disabled=false}) {
  const [groups, setGroups] = useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const fieldId = useId();
  useEffect(() => {api.get('/departments/tree?ticket=true&routing=true').then(r => setGroups(r.data.groups)).catch(() => setError('Could not load departments. Reload this page to try again.')).finally(()=>setLoading(false));}, []);
  const root = groups.find(g => g.id === form.assignmentGroupId);
  const children = groups.filter(g => g.parent_id === form.assignmentGroupId && g.is_active);

  return <div className="ticket-organization">
    {error?<p role="alert">{error}</p>:!loading&&!groups.some(g=>g.is_active&&g.can_select)&&<p role="status">No departments are available for ticket routing. Ask Admin to assign department membership or permitted managed access.</p>}
    <div className="ip-pair">
      <label className="ip-lc" htmlFor={fieldId+'-department'}>Department<span className="ip-req"> *</span></label>
      <span className="ip-vc ip-input-cell">
        <select id={fieldId+'-department'} aria-label="Department" required disabled={disabled} value={form.assignmentGroupId||''} onChange={e => {
          const group = groups.find(g => g.id === e.target.value);
          setForm(p => ({...p, assignmentGroupId:group?.id||'', assignmentGroup:group?.name||'', subgroupId:'', assignedTo:''}));
        }}>
          <option value="">Select Department</option>
          {groups.filter(g => !g.parent_id && g.is_active).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </span>
    </div>
    <div className="ip-pair">
      <label className="ip-lc" htmlFor={fieldId+'-subgroup'}>Sub Department{root?.can_select===false&&<span className="ip-req"> *</span>}</label>
      <span className="ip-vc ip-input-cell">
        <select id={fieldId+'-subgroup'} aria-label="Sub Department" required={root?.can_select===false} disabled={disabled||!root} value={form.subgroupId||''} onChange={e => setForm(p => ({...p, subgroupId:e.target.value, assignedTo:''}))}>
          <option value="" disabled={root?.can_select===false}>Department only</option>
          {children.map(g => <option key={g.id} value={g.id}>{g.name} — {g.country_name}</option>)}
        </select>
      </span>
    </div>
  </div>;
}
