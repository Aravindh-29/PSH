import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Plus, Edit2, Trash2, Save, X, UserPlus, UserMinus, ChevronDown, ChevronRight, ArrowLeft, Loader, Search, Eye, EyeOff, CheckCircle2, Power } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useAccess from '../../hooks/useAccess';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './Groups.css';

// ── Multi-select searchable user picker ──────────────────────
function UserSearchPicker({ allUsers, existingMembers, selectedIds, onToggle, onClearAll, disabled=false }) {
  const [query,setQuery]=useState('');
  const available=allUsers.filter(user=>!existingMembers.some(member=>member.id===user.id)&&(!query.trim()||[user.full_name,user.email,user.username].some(value=>value?.toLowerCase().includes(query.trim().toLowerCase()))));
  const allVisible=available.length>0&&available.every(user=>selectedIds.includes(user.id));
  return <div className="usp-wrap usp-dialog-picker">
    <div className="usp-input-box"><Search size={16} className="usp-search-icon"/><input autoFocus className="usp-input" aria-label="Search users to add" placeholder="Search name, email or username…" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="usp-dropdown">
      <div className="usp-count-row"><span className="usp-count">{available.length} available <span className="usp-sel-badge">{selectedIds.length} selected</span></span><div className="grp-picker-actions"><button type="button" className="usp-sel-all-btn" disabled={disabled||!available.length} onClick={()=>available.forEach(user=>{if(allVisible||!selectedIds.includes(user.id))onToggle(user.id)})}>{allVisible?'Deselect shown':'Select shown'}</button>{selectedIds.length>0&&<button type="button" className="usp-sel-all-btn" disabled={disabled} onClick={onClearAll}>Clear selection</button>}</div></div>
      <div className="usp-list">{available.length?available.map(user=><label key={user.id} className={'usp-option'+(selectedIds.includes(user.id)?' usp-option-checked':'')}><input type="checkbox" checked={selectedIds.includes(user.id)} disabled={disabled} onChange={()=>onToggle(user.id)} aria-label={`Select ${user.full_name}`}/><span className="usp-option-avatar">{user.full_name.charAt(0).toUpperCase()}</span><span className="usp-option-info"><span className="usp-option-name">{user.full_name}</span><span className="usp-option-email">{user.email}</span></span><span className={`usp-role-badge ${user.role}`}>{user.role_name||user.role}</span></label>):<p className="usp-empty">{query?'No users match your search.':'All available users already belong to this department.'}</p>}</div>
    </div>
  </div>;
}

// ── Delete Group Modal ────────────────────────────────────────
function DeleteGroupModal({ group, onConfirm, onClose }) {
  const [nameInput, setNameInput]   = useState('');
  const [password, setPassword]     = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const nameMatch = nameInput.trim() === group.name.trim();

  const handleSubmit = async () => {
    if (!nameMatch) { setError('Department name does not match'); return; }
    if (!password.trim()) { setError('Admin password is required'); return; }
    setLoading(true); setError('');
    try {
      await onConfirm(password);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="grp-modal">
        <div className="grp-modal-header">
          <div className="grp-modal-icon-wrap">
            <Trash2 size={18} />
          </div>
          <div>
            <h3 className="grp-modal-title">Delete Department</h3>
            <p className="grp-modal-sub">This action cannot be undone. All member assignments will be removed.</p>
          </div>
          <button className="grp-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="grp-modal-body">
          <div className="grp-modal-field">
            <label>
              Type <strong>{group.name}</strong> to confirm
            </label>
            <input
              autoFocus
              value={nameInput}
              onChange={e => { setNameInput(e.target.value); setError(''); }}
              placeholder={group.name}
              className={nameInput && !nameMatch ? 'grp-modal-input-error' : ''}
            />
          </div>
          <div className="grp-modal-field">
            <label>Admin password <span className="grp-req">*</span></label>
            <div className="grp-modal-pw-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="grp-modal-pw-toggle"
                onMouseDown={e => { e.preventDefault(); setShowPwd(v => !v); }}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {error && <p className="grp-modal-error">{error}</p>}
        </div>
        <div className="grp-modal-footer">
          <button className="grp-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="grp-modal-delete-btn"
            onClick={handleSubmit}
            disabled={loading || !nameMatch || !password.trim()}
          >
            {loading ? <><Loader size={13} className="spin" /> Deleting…</> : <><Trash2 size={13} /> Delete Department</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Member list with inline search ───────────────────────────
function MemberList({ memberList, searchQuery, onSearchChange, onRemove }) {
  const q        = searchQuery.toLowerCase();
  const filtered = memberList.filter(m =>
    !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  );

  if (memberList.length === 0) {
    return <div className="grp-no-members">No members in this department yet.</div>;
  }

  return (
    <>
      <div className="grp-member-list-label">
        Users <span className="grp-member-list-count">{memberList.length}</span>
      </div>
      <div className="grp-member-search-wrap">
        <Search size={13} className="grp-member-search-icon" />
        <input
          className="grp-member-search-input"
          aria-label="Search department users"
          placeholder="Search users in this department…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button className="grp-member-search-clear" onClick={() => onSearchChange('')}>
            <X size={12} />
          </button>
        )}
      </div>
      <div className="grp-member-list">
        {filtered.length === 0 ? (
          <div className="grp-no-members">No members match "{searchQuery}"</div>
        ) : (
          filtered.map(m => (
            <div key={m.id} className="grp-member-row">
              <div className="grp-member-avatar">{m.full_name.charAt(0).toUpperCase()}</div>
              <div className="grp-member-info">
                <div className="grp-member-name">{m.full_name}</div>
                <div className="grp-member-email">{m.email}</div>
              </div>
              <span className={`grp-role-badge ${m.role}`}>{m.role_name || m.role}</span>
              {onRemove && <button
                className="grp-remove-btn"
                onClick={() => onRemove(m.id, m.full_name)}
                title="Remove from department"
              >
                <UserMinus size={13} />
              </button>}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function GroupDialog({children,label,onClose,success=false}) {
  const dialog=useRef(null);
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return ()=>{if(element.open)element.close()};
  },[]);
  return <dialog ref={dialog} className={'grp-dialog'+(success?' grp-dialog-success':'')} aria-label={label} onCancel={e=>{e.preventDefault();onClose()}}>{children}</dialog>;
}

// ── Main Groups page ──────────────────────────────────────────
export default function Groups() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { can } = useAccess();
  const canPickUsers = can('groups.members') && can('users.view');
  const [error, setError] = useState('');
  const [groups, setGroups]           = useState([]);
  const [allUsers, setAllUsers]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [expandedId, setExpandedId]   = useState(null);
  const [members, setMembers]         = useState({});
  const [memberLoading, setMemberLoading] = useState({});
  const [form, setForm]               = useState({ name: '', description: '' });
  const [saving, setSaving]           = useState(false);
  const [addUserIds, setAddUserIds]     = useState({});  // groupId → string[]
  const [memberSearch, setMemberSearch] = useState({});  // groupId → query string
  const [addUsersFor,setAddUsersFor] = useState(null);
  const [feedback,setFeedback] = useState(null),[prompt,setPrompt] = useState(null),[actionBusy,setActionBusy] = useState(false);
  const [deleteModal, setDeleteModal]   = useState(null); // null | group object

  const load = useCallback(() => {
    setLoading(true); setError('');
    return Promise.all([
      api.get(groupId ? `/groups/${groupId}` : '/groups'),
      groupId && canPickUsers ? api.get('/users') : Promise.resolve({data:{users:[]}}),
    ]).then(([g, u]) => {
      if (groupId) {
        setGroups([{...g.data.group, member_count:(g.data.members || []).length}]);
        setMembers({[groupId]:g.data.members || []});
      } else setGroups(g.data.groups || []);
      setAllUsers((u.data.users || []).filter(u => !u.deleted_at));
    }).catch(e => setError(e.response?.data?.message || 'Failed to load department information.'))
    .finally(() => setLoading(false));
  }, [groupId, canPickUsers]);

  useEffect(() => {
    setExpandedId(groupId || null); setShowForm(false); setAddUserIds({}); setMemberSearch({});
    load();
  }, [load, groupId]);

  const loadMembers = async (groupId) => {
    setMemberLoading(p => ({ ...p, [groupId]: true }));
    try {
      const r = await api.get(`/groups/${groupId}`);
      setMembers(p => ({ ...p, [groupId]: r.data.members || [] }));
    } catch { toast.error('Failed to load members'); }
    finally { setMemberLoading(p => ({ ...p, [groupId]: false })); }
  };

  const toggleExpand = id => navigate(`/admin/groups/${id}`);

  const startEdit = (g) => {
    setEditingId(g.id);
    setForm({ name: g.name, description: g.description || '' });
    setShowForm(true);
  };

  const startNew = () => {
    setEditingId(null);
    setForm({ name: '', description: '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Department name is required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/groups/${editingId}`, form);
        setFeedback({title:'Department updated successfully',message:`Changes to ${form.name.trim()} have been saved.`});
      } else {
        const { data } = await api.post('/groups', form);
        setFeedback({title:'Department created successfully',message:`${form.name.trim()} is ready to use.`});
        setShowForm(false);
        navigate(`/admin/groups/${data.group.id}`);
        return;
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = (g) => setDeleteModal(g);

  const confirmDelete = async (password) => {
    await api.delete(`/groups/${deleteModal.id}`, { data: { adminPassword: password } });
    setFeedback({title:'Department deleted successfully',message:`${deleteModal.name} has been deleted.`});
    setDeleteModal(null);
    if (groupId) navigate('/admin/groups'); else load();
  };

  const handleToggleActive = g => setPrompt({
    title:`${g.is_active?'Deactivate':'Activate'} department?`,
    message:g.is_active?`Deactivate ${g.name}? It will no longer be available for new ticket assignments. Existing tickets and membership records are kept.`:`Activate ${g.name} so it is available for ticket assignments again.`,
    label:g.is_active?'Deactivate Department':'Activate Department',
    kind:g.is_active?'deactivate':'activate',
    run:async()=>{
      await api.put(`/groups/${g.id}`,{is_active:!g.is_active});
      setFeedback({title:g.is_active?'Department deactivated successfully':'Department activated successfully',message:`${g.name} is now ${g.is_active?'inactive':'active'}.`});
      await load();
    },
  });

  const toggleAddUser = (groupId, userId) => {
    setAddUserIds(prev => {
      const cur = prev[groupId] || [];
      return {
        ...prev,
        [groupId]: cur.includes(userId) ? cur.filter(id => id !== userId) : [...cur, userId],
      };
    });
  };

  const clearAddUsers = (groupId) => setAddUserIds(prev => ({ ...prev, [groupId]: [] }));

  const handleAddMember = async (groupId) => {
    const ids = addUserIds[groupId] || [];
    if (!ids.length || actionBusy) return;
    setActionBusy(true);
    try {
      await Promise.all(ids.map(userId => api.post(`/groups/${groupId}/members`, { userId })));
      setAddUserIds(p => ({ ...p, [groupId]: [] }));
      await loadMembers(groupId);
      const r = await api.get('/groups');
      setGroups((r.data.groups || []).filter(g => g.id === groupId));
      setAddUsersFor(null);
      setFeedback({title:ids.length===1?'User added successfully':'Users added successfully',message:`${ids.length} ${ids.length===1?'user has':'users have'} been added to this department.`});
    } catch { toast.error('Some users could not be added. Refresh the member list before trying again.'); await loadMembers(groupId); }
    finally {setActionBusy(false)}
  };

  const handleRemoveMember = (groupId,userId,userName) => setPrompt({
    title:'Remove department member?',message:`Remove ${userName} from this department? Their user account will remain active.`,label:'Remove Member',kind:'delete',
    run:async()=>{
      await api.delete(`/groups/${groupId}/members/${userId}`);
      setMembers(p=>({...p,[groupId]:p[groupId].filter(m=>m.id!==userId)}));
      const r=await api.get('/groups');
      setGroups((r.data.groups||[]).filter(g=>g.id===groupId));
      setFeedback({title:'Member removed successfully',message:`${userName} has been removed from this department.`});
    },
  });
  const confirmAction=async()=>{
    if(!prompt||actionBusy)return;
    setActionBusy(true);
    try{await prompt.run();setPrompt(null)}catch(e){toast.error(e.response?.data?.message||'The action could not be completed.')}finally{setActionBusy(false)}
  };

  if (loading) return <div className="grp-loading"><Loader size={20} className="spin" /> Loading…</div>;

  if (error) return <div className="grp-page"><Link className="grp-back-link" to="/admin/groups"><ArrowLeft size={15}/>Back to Departments</Link><p role="alert">{error}</p><button className="grp-cancel-btn" onClick={load}>Retry</button></div>;

  return (
    <div className="grp-page">
      {groupId && <Link className="grp-back-link" to="/admin/groups"><ArrowLeft size={15}/>Back to Departments</Link>}
      <div className="grp-header">
        <div>
          <h1 className="grp-title">{groupId ? groups[0]?.name : 'Department'}</h1>
          <p className="grp-sub">{groupId ? 'Department details and team membership. Department membership is separate from Managed Departments oversight.' : 'Open a department to view its details and manage its members.'}</p>
        </div>
        {!groupId && can('groups.create') && <button className="grp-add-btn" onClick={startNew}>
          <Plus size={15} /> New Department
        </button>}
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <GroupDialog label={editingId?'Edit Department':'Create Department'} onClose={()=>{if(!saving)setShowForm(false)}}>
        <div className="grp-form-card">
          <div className="grp-form-title">{editingId ? 'Edit Department' : 'Create Department'}</div>
          <div className="grp-form-row">
            <div className="grp-field">
              <label>Department Name <span className="grp-req">*</span></label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. L1 Support"
                autoFocus
              />
            </div>
            <div className="grp-field grp-field-lg">
              <label>Description</label>
              <input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="grp-form-actions">
            <button className="grp-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? <Loader size={13} className="spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="grp-cancel-btn" disabled={saving} onClick={() => setShowForm(false)}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
        </GroupDialog>
      )}

      {/* Groups List */}
      {groups.length === 0 && !showForm ? (
        <div className="grp-empty">
          <Users size={36} strokeWidth={1.5} />
          <p>No departments yet.</p>
          {can('groups.create') && <button className="grp-add-btn" onClick={startNew}><Plus size={14} /> Create First Department</button>}
        </div>
      ) : (
        <div className="grp-list">
          {groups.map(g => {
            const Info = groupId ? 'div' : Link;
            return (
            <div key={g.id} className={`grp-item ${!g.is_active ? 'grp-item-inactive' : ''} ${expandedId === g.id ? 'grp-item-expanded' : ''}`}>
              <div className="grp-item-header">
                <Info className={'grp-item-info' + (!groupId ? ' grp-item-link' : '')} {...(!groupId ? {to:`/admin/groups/${g.id}`, 'aria-label':`Open ${g.name}`} : {})}>
                  <div className="grp-item-name">
                    {g.name}
                    {!g.is_active && <span className="grp-inactive-badge">Inactive</span>}
                  </div>
                  {g.description && <div className="grp-item-desc">{g.description}</div>}
                  <div className="grp-item-meta">{g.member_count} member{g.member_count !== 1 ? 's' : ''}{groupId && <span> · {g.is_active ? 'Active' : 'Inactive'}</span>}</div>
                </Info>
                <div className="grp-item-actions">
                  {!groupId && <button className="grp-action-btn" onClick={() => toggleExpand(g.id)} title="Open department">
                    <Users size={14} />
                    Open Department <ChevronRight size={12} />
                  </button>}
                  {can('groups.edit') && <button className="grp-action-btn grp-action-edit" disabled={actionBusy} onClick={() => startEdit(g)} title="Edit department"><Edit2 size={15} />Edit Department</button>}
                  {can('groups.edit') && can('groups.status') && <button
                    className={`grp-action-btn ${g.is_active ? 'grp-action-deactivate' : 'grp-action-activate'}`}
                    disabled={actionBusy}
                    onClick={() => handleToggleActive(g)}
                    title={g.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Power size={15}/>{g.is_active?'Deactivate':'Activate'}
                  </button>}
                  {can('groups.delete') && <button className="grp-action-btn grp-action-danger" disabled={actionBusy} onClick={() => handleDelete(g)} title="Delete department">
                    <Trash2 size={15} />Delete Department
                  </button>}
                </div>
              </div>

              {/* Members panel */}
              {expandedId === g.id && (
                <div className="grp-members-panel">
                  <div className="grp-members-heading"><div className="grp-members-title">Users</div>{canPickUsers&&<button type="button" className="grp-add-member-btn" disabled={actionBusy} onClick={()=>{clearAddUsers(g.id);setAddUsersFor(g)}}><UserPlus size={16}/>Add Users</button>}</div>
                  {memberLoading[g.id] ? (
                    <div className="grp-members-loading"><Loader size={14} className="spin" /> Loading…</div>
                  ) : (
                    <>
                      {can('groups.members') && !canPickUsers && <p className="grp-sub">View users permission is required to search and add members.</p>}

                      {/* Member list */}
                      <MemberList
                        groupId={g.id}
                        memberList={(members[g.id] || []).map(member => ({...member, role_name:member.role_name || allUsers.find(u => u.id === member.id)?.role_name}))}
                        searchQuery={memberSearch[g.id] || ''}
                        onSearchChange={q => setMemberSearch(p => ({ ...p, [g.id]: q }))}
                        onRemove={can('groups.members') ? (uid, name) => handleRemoveMember(g.id, uid, name) : undefined}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          );})}
        </div>
      )}

      {addUsersFor && <GroupDialog label={`Add users to ${addUsersFor.name}`} onClose={()=>{if(!actionBusy){clearAddUsers(addUsersFor.id);setAddUsersFor(null)}}}>
        <div className="grp-add-users-dialog"><h2>Add users to {addUsersFor.name}</h2><p>Search and select users below. They will be added only when you save.</p>
          <UserSearchPicker allUsers={allUsers} existingMembers={members[addUsersFor.id]||[]} selectedIds={addUserIds[addUsersFor.id]||[]} onToggle={id=>toggleAddUser(addUsersFor.id,id)} onClearAll={()=>clearAddUsers(addUsersFor.id)} disabled={actionBusy}/>
          <div className="grp-form-actions"><button type="button" className="grp-cancel-btn" disabled={actionBusy} onClick={()=>{clearAddUsers(addUsersFor.id);setAddUsersFor(null)}}>Cancel</button><button type="button" className="grp-save-btn" disabled={actionBusy||!(addUserIds[addUsersFor.id]||[]).length} onClick={()=>handleAddMember(addUsersFor.id)}><Save size={16}/>{actionBusy?'Saving…':`Save Users${(addUserIds[addUsersFor.id]||[]).length?` (${addUserIds[addUsersFor.id].length})`:''}`}</button></div>
        </div>
      </GroupDialog>}

      {prompt && <GroupDialog label={prompt.title} onClose={()=>{if(!actionBusy)setPrompt(null)}}>
        <div className="grp-confirm-body"><h2>{prompt.title}</h2><p>{prompt.message}</p><div className="grp-form-actions"><button className="grp-cancel-btn" disabled={actionBusy} onClick={()=>setPrompt(null)}>Cancel</button><button className={'grp-action-btn grp-action-'+prompt.kind} disabled={actionBusy} onClick={confirmAction}>{prompt.kind==='delete'?<UserMinus size={16}/>:<Power size={16}/>} {actionBusy?'Updating…':prompt.label}</button></div></div>
      </GroupDialog>}
      {feedback && !prompt && <GroupDialog label={feedback.title} success onClose={()=>setFeedback(null)}><div className="grp-feedback-icon"><CheckCircle2 size={42}/></div><h2>{feedback.title}</h2><p>{feedback.message}</p><button className="grp-action-btn grp-action-activate" autoFocus onClick={()=>setFeedback(null)}><CheckCircle2 size={16}/>Done</button></GroupDialog>}

      {deleteModal && (
        <DeleteGroupModal
          group={deleteModal}
          onConfirm={confirmDelete}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}
