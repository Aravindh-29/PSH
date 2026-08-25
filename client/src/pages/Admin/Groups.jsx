import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Plus, Edit2, Trash2, Save, X, UserPlus, UserMinus, ChevronDown, ChevronUp, Loader, Search, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './Groups.css';

// ── Multi-select searchable user picker ──────────────────────
function UserSearchPicker({ allUsers, existingMembers, selectedIds, onToggle, onClearAll }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const wrapRef           = useRef(null);
  const inputRef          = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const available = allUsers.filter(u => {
    if (existingMembers.find(m => m.id === u.id)) return false;
    const q = query.toLowerCase();
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const allVisible   = available.every(u => selectedIds.includes(u.id));
  const someSelected = selectedIds.length > 0;

  const toggleAll = () => {
    if (allVisible && available.length > 0) {
      available.forEach(u => { if (selectedIds.includes(u.id)) onToggle(u.id); });
    } else {
      available.forEach(u => { if (!selectedIds.includes(u.id)) onToggle(u.id); });
    }
  };

  const inputLabel = selectedIds.length === 0
    ? ''
    : selectedIds.length === 1
      ? (allUsers.find(u => u.id === selectedIds[0])?.full_name || '1 user selected')
      : `${selectedIds.length} users selected`;

  return (
    <div className="usp-wrap" ref={wrapRef}>
      <div
        className={`usp-input-box ${open ? 'usp-input-box-open' : ''}`}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
      >
        <Search size={15} className="usp-search-icon" />
        <input
          ref={inputRef}
          className="usp-input"
          placeholder={!open && someSelected ? '' : 'Search users to add…'}
          value={open ? query : ''}
          style={!open && someSelected ? { color: 'transparent' } : {}}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          spellCheck={false}
        />
        {!open && someSelected && (
          <span className="usp-pill">{inputLabel}</span>
        )}
        {someSelected && (
          <button
            className="usp-clear-btn"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onClearAll(); setQuery(''); }}
            title="Clear selection"
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className={`usp-chevron ${open ? 'usp-chevron-up' : ''}`} />
      </div>

      {open && (
        <div className="usp-dropdown">
          {available.length === 0 ? (
            <div className="usp-empty">
              {query ? `No users match "${query}"` : 'All users are already members'}
            </div>
          ) : (
            <>
              {/* Header row: count + select-all */}
              <div className="usp-count-row">
                <span className="usp-count">
                  {available.length} user{available.length !== 1 ? 's' : ''} available
                  {selectedIds.length > 0 && <span className="usp-sel-badge">{selectedIds.length} selected</span>}
                </span>
                <button
                  className="usp-sel-all-btn"
                  onMouseDown={e => { e.preventDefault(); toggleAll(); }}
                >
                  {allVisible && available.length > 0 ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="usp-list">
                {available.map(u => {
                  const checked = selectedIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      className={`usp-option ${checked ? 'usp-option-checked' : ''}`}
                      onMouseDown={e => { e.preventDefault(); onToggle(u.id); }}
                    >
                      <div className={`usp-checkbox ${checked ? 'usp-checkbox-on' : ''}`}>
                        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div className="usp-option-avatar">{u.full_name.charAt(0).toUpperCase()}</div>
                      <div className="usp-option-info">
                        <div className="usp-option-name">{u.full_name}</div>
                        <div className="usp-option-email">{u.email}</div>
                      </div>
                      <span className={`usp-role-badge ${u.role}`}>{u.role}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
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
    if (!nameMatch) { setError('Group name does not match'); return; }
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
            <h3 className="grp-modal-title">Delete Group</h3>
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
            {loading ? <><Loader size={13} className="spin" /> Deleting…</> : <><Trash2 size={13} /> Delete Group</>}
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
    return <div className="grp-no-members">No members yet. Search and add users above.</div>;
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
          placeholder="Search members…"
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
              <span className={`grp-role-badge ${m.role}`}>{m.role}</span>
              <button
                className="grp-remove-btn"
                onClick={() => onRemove(m.id, m.full_name)}
                title="Remove from group"
              >
                <UserMinus size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── Main Groups page ──────────────────────────────────────────
export default function Groups() {
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
  const [deleteModal, setDeleteModal]   = useState(null); // null | group object

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/groups'),
      api.get('/users'),
    ]).then(([g, u]) => {
      setGroups(g.data.groups || []);
      setAllUsers((u.data.users || []).filter(u => !u.deleted_at));
    }).catch(() => toast.error('Failed to load groups'))
    .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadMembers = async (groupId) => {
    setMemberLoading(p => ({ ...p, [groupId]: true }));
    try {
      const r = await api.get(`/groups/${groupId}`);
      setMembers(p => ({ ...p, [groupId]: r.data.members || [] }));
    } catch { toast.error('Failed to load members'); }
    finally { setMemberLoading(p => ({ ...p, [groupId]: false })); }
  };

  const toggleExpand = (groupId) => {
    if (expandedId === groupId) { setExpandedId(null); return; }
    setExpandedId(groupId);
    if (!members[groupId]) loadMembers(groupId);
  };

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
    if (!form.name.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/groups/${editingId}`, form);
        toast.success('Group updated');
      } else {
        await api.post('/groups', form);
        toast.success('Group created');
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
    toast.success('Group deleted');
    setDeleteModal(null);
    load();
  };

  const handleToggleActive = async (g) => {
    try {
      await api.put(`/groups/${g.id}`, { is_active: !g.is_active });
      toast.success(g.is_active ? 'Group deactivated' : 'Group activated');
      load();
    } catch { toast.error('Update failed'); }
  };

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
    if (!ids.length) { toast.error('Select at least one user'); return; }
    try {
      await Promise.all(ids.map(userId => api.post(`/groups/${groupId}/members`, { userId })));
      setAddUserIds(p => ({ ...p, [groupId]: [] }));
      await loadMembers(groupId);
      const r = await api.get('/groups');
      setGroups(r.data.groups || []);
      toast.success(ids.length === 1 ? 'Member added' : `${ids.length} members added`);
    } catch { toast.error('Failed to add members'); }
  };

  const handleRemoveMember = async (groupId, userId, userName) => {
    if (!window.confirm(`Remove ${userName} from this group?`)) return;
    try {
      await api.delete(`/groups/${groupId}/members/${userId}`);
      setMembers(p => ({ ...p, [groupId]: p[groupId].filter(m => m.id !== userId) }));
      const r = await api.get('/groups');
      setGroups(r.data.groups || []);
      toast.success('Member removed');
    } catch { toast.error('Failed to remove member'); }
  };

  if (loading) return <div className="grp-loading"><Loader size={20} className="spin" /> Loading…</div>;

  return (
    <div className="grp-page">
      <div className="grp-header">
        <div>
          <h1 className="grp-title">Assignment Groups</h1>
          <p className="grp-sub">Manage groups and their members. Groups control who can be assigned tickets.</p>
        </div>
        <button className="grp-add-btn" onClick={startNew}>
          <Plus size={15} /> New Group
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="grp-form-card">
          <div className="grp-form-title">{editingId ? 'Edit Group' : 'Create Group'}</div>
          <div className="grp-form-row">
            <div className="grp-field">
              <label>Group Name <span className="grp-req">*</span></label>
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
            <button className="grp-cancel-btn" onClick={() => setShowForm(false)}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups List */}
      {groups.length === 0 && !showForm ? (
        <div className="grp-empty">
          <Users size={36} strokeWidth={1.5} />
          <p>No groups yet.</p>
          <button className="grp-add-btn" onClick={startNew}><Plus size={14} /> Create First Group</button>
        </div>
      ) : (
        <div className="grp-list">
          {groups.map(g => (
            <div key={g.id} className={`grp-item ${!g.is_active ? 'grp-item-inactive' : ''} ${expandedId === g.id ? 'grp-item-expanded' : ''}`}>
              <div className="grp-item-header">
                <div className="grp-item-info">
                  <div className="grp-item-name">
                    {g.name}
                    {!g.is_active && <span className="grp-inactive-badge">Inactive</span>}
                  </div>
                  {g.description && <div className="grp-item-desc">{g.description}</div>}
                  <div className="grp-item-meta">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</div>
                </div>
                <div className="grp-item-actions">
                  <button className="grp-action-btn" onClick={() => toggleExpand(g.id)} title="Manage members">
                    <Users size={14} />
                    {expandedId === g.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <button className="grp-action-btn" onClick={() => startEdit(g)} title="Edit group"><Edit2 size={14} /></button>
                  <button
                    className={`grp-action-btn ${g.is_active ? '' : 'grp-action-activate'}`}
                    onClick={() => handleToggleActive(g)}
                    title={g.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {g.is_active ? <X size={14} /> : <Save size={14} />}
                  </button>
                  <button className="grp-action-btn grp-action-danger" onClick={() => handleDelete(g)} title="Delete group">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Members panel */}
              {expandedId === g.id && (
                <div className="grp-members-panel">
                  <div className="grp-members-title">Members</div>
                  {memberLoading[g.id] ? (
                    <div className="grp-members-loading"><Loader size={14} className="spin" /> Loading…</div>
                  ) : (
                    <>
                      {/* Add member row — searchable picker */}
                      <div className="grp-add-member-row">
                        <UserSearchPicker
                          allUsers={allUsers}
                          existingMembers={members[g.id] || []}
                          selectedIds={addUserIds[g.id] || []}
                          onToggle={uid => toggleAddUser(g.id, uid)}
                          onClearAll={() => clearAddUsers(g.id)}
                        />
                        <button
                          className="grp-add-member-btn"
                          onClick={() => handleAddMember(g.id)}
                          disabled={!(addUserIds[g.id] || []).length}
                        >
                          <UserPlus size={13} />
                          {(addUserIds[g.id] || []).length > 1
                            ? `Add (${addUserIds[g.id].length})`
                            : 'Add'}
                        </button>
                      </div>

                      {/* Member list */}
                      <MemberList
                        groupId={g.id}
                        memberList={members[g.id] || []}
                        searchQuery={memberSearch[g.id] || ''}
                        onSearchChange={q => setMemberSearch(p => ({ ...p, [g.id]: q }))}
                        onRemove={(uid, name) => handleRemoveMember(g.id, uid, name)}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
