import React, {useEffect, useId, useState} from 'react';
import api from '../api/axios';

export default function TicketOrganization({form, setForm, disabled=false, allowOtherDepartments=false,required=true}) {
  const [groups, setGroups] = useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const fieldId = useId();
  const [otherSelected,setOtherSelected]=useState(false);
  useEffect(() => {api.get(allowOtherDepartments?'/departments/routing':'/departments/tree?ticket=true&routing=true').then(r => setGroups(r.data.groups)).catch(() => setError('Could not load departments. Reload this page to try again.')).finally(()=>setLoading(false));}, [allowOtherDepartments]);
  const root = groups.find(g => g.id === form.assignmentGroupId);
  const roots=groups.filter(g=>!g.parent_id&&g.is_active);
  const hasAccess=g=>g.can_select||groups.some(child=>child.parent_id===g.id&&child.can_select);
  const regularRoots=roots.filter(g=>hasAccess(g));
  const otherRoots=roots.filter(g=>!hasAccess(g));
  const showOther=allowOtherDepartments&&(otherSelected||!!root&&!hasAccess(root));
  const chooseDepartment=value=>{
    const group=groups.find(g=>g.id===value);
    setForm(p=>({...p,assignmentGroupId:group?.id||'',assignmentGroup:group?.name||'',subgroupId:'',assignedTo:'',routingOutside:!!group&&!group.can_select}));
  };

  const children = groups.filter(g => g.parent_id === form.assignmentGroupId && g.is_active);

  return <div className="ticket-organization">
    {error?<p role="alert">{error}</p>:!loading&&!(allowOtherDepartments?roots.length:groups.some(g=>g.is_active&&g.can_select))&&<p role="status">No departments are available for ticket routing. Ask Admin to assign department membership or permitted managed access.</p>}
    <div className="ip-pair">
      <label className="ip-lc" htmlFor={fieldId+'-department'}>Department{required&&<span className="ip-req"> *</span>}</label>
      <span className="ip-vc ip-input-cell">
        <select id={fieldId+'-department'} aria-label="Department" required={required} disabled={disabled} value={showOther?'other':form.assignmentGroupId||''} onChange={e=>{setOtherSelected(e.target.value==='other');chooseDepartment(e.target.value==='other'?'':e.target.value);}}>
          <option value="">Select Department</option>
          {(allowOtherDepartments?regularRoots:roots).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          {allowOtherDepartments&&otherRoots.length>0&&<option value="other">Other Departments</option>}
        </select>
      </span>
    </div>
    {showOther&&<div className="ip-pair">
      <label className="ip-lc" htmlFor={fieldId+'-other'}>Other Department<span className="ip-req"> *</span></label>
      <span className="ip-vc ip-input-cell"><select id={fieldId+'-other'} aria-label="Other Department" required disabled={disabled||loading} value={form.assignmentGroupId||''} onChange={e=>chooseDepartment(e.target.value)}>
        <option value="">Select Other Department</option>
        {otherRoots.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
      </select></span>
    </div>}
    <div className="ip-pair">
      <label className="ip-lc" htmlFor={fieldId+'-subgroup'}>Sub Department{!allowOtherDepartments&&root?.can_select===false&&<span className="ip-req"> *</span>}</label>
      <span className="ip-vc ip-input-cell">
        <select id={fieldId+'-subgroup'} aria-label="Sub Department" required={!allowOtherDepartments&&root?.can_select===false} disabled={disabled||!root} value={form.subgroupId||''} onChange={e => setForm(p => ({...p, subgroupId:e.target.value, assignedTo:'',routingOutside:!(e.target.value?groups.find(g=>g.id===e.target.value)?.can_select:root?.can_select)}))}>
          <option value="" disabled={!allowOtherDepartments&&root?.can_select===false}>Department only</option>
          {children.map(g => <option key={g.id} value={g.id}>{g.name} — {g.country_name}</option>)}
        </select>
      </span>
    </div>
  </div>;
}
