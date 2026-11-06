import React from 'react';
export default function EffectiveAccess({ role, catalog = [], groups = [] }) {
  if(!role) return <p>Select a role to preview access.</p>;
  return <div className="access-preview"><h3>Effective Access Preview</h3><strong>{role.name}</strong><p>{role.responsibility}</p><p>Managed groups: {groups.length || 'None selected'}</p><div style={{maxHeight:320,overflow:'auto'}}>{catalog.map(p=><div key={p.key} style={{padding:'7px 0',fontSize:13}}><span style={{color:role.permissions[p.key]?'#15803d':'#94a3b8'}}>{role.permissions[p.key]?'✓':'🔒'}</span> {p.label}{role.permissions[p.key] && p.scoped && <span style={{color:'#64748b'}}> — {({all:'All',groups:'Selected Groups',own:'Own / Assigned',related:'Own + Member Groups'})[role.permissions[p.key]]}</span>}</div>)}</div><p style={{fontSize:12,color:'#64748b'}}>Permissions come from the role. Record scope is checked on the server.</p></div>;
}
