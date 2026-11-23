import React from 'react';
import {canHaveManagedAccess} from '../utils/ticketAccess';

export default function EffectiveAccess({role,groups=[]}) {
  if(!role)return <div className="access-preview"><h3>Role responsibilities</h3><p>Select User, Admin or Manager to see their responsibilities.</p></div>;
  const manager=canHaveManagedAccess(role),admin=role.role_kind==='admin'||role.key==='admin';
  const actions=admin?[
    'Manage all tickets, departments and sub departments.',
    'Create and manage user accounts, passwords and access.',
    'Assign User, Admin or Manager roles.',
    'Manage application configuration, integrations and knowledge articles.'
  ]:manager?[
    'Work on tickets assigned to you in My Tickets and My Dashboard.',
    'View and manage tickets in your managed departments and sub departments.',
    'Assign team tickets to eligible members and review team reports.',
    'Create sub departments within fully managed departments.',
    'Add existing unassigned users to your managed teams. Only Admin creates accounts.'
  ]:[
    'Work on your permitted personal tickets.',
    'Create tickets within your department or sub department access.',
    'View permitted member-team tickets, published knowledge and personal reports.',
    'View the Users directory for your own departments (read only).',
    'Manage your own profile and password.'
  ];
  return <div className="access-preview"><h3>Role responsibilities</h3><strong>{role.name}</strong><p>{role.responsibility}</p><ul>{actions.map(text=><li key={text} style={{marginBottom:12,lineHeight:1.6}}>{text}</li>)}</ul>{manager&&<><p><strong>Managed departments / sub departments selected: {groups.length}</strong></p>{!groups.length&&<p role="status">Select managed departments to give this Manager team oversight. Without them, only personal ticket access applies.</p>}<p>Department membership is separate. Add membership if this Manager should receive ticket assignments in that team.</p></>}</div>;
}
