import React, { useEffect, useState } from 'react';
import { X, Eye, EyeOff, Trash2, Pencil } from 'lucide-react';

import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import './Admin.css';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers]     = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', fullName: '', password: '', role: 'employee' });
  const [loading, setLoading]   = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);

  // ── Edit modal ────────────────────────────────────────────────
  const [editTarget,  setEditTarget]  = useState(null);
  const [editRole,    setEditRole]    = useState('employee');
  const [editActive,  setEditActive]  = useState(true);
  const [editPw,      setEditPw]      = useState('');
  const [showEditPw,  setShowEditPw]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  const openEdit = (u) => {
    setEditTarget(u);
    setEditRole(u.role);
    setEditActive(u.is_active);
    setEditPw('');
    setShowEditPw(false);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const isSelf = currentUser?.id === editTarget.id;
      const roleChanged   = editRole   !== editTarget.role;
      const statusChanged = editActive !== editTarget.is_active;

      if (isSelf && roleChanged) {
        toast.error('You cannot change your own role');
        setSaving(false);
        return;
      }

      if (roleChanged || statusChanged) {
        await api.put(`/users/${editTarget.id}`, {
          role:     roleChanged   ? editRole   : undefined,
          isActive: statusChanged ? editActive : undefined,
        });
      }

      if (editPw.trim()) {
        if (editPw.length < 6) { toast.error('Password must be at least 6 characters'); setSaving(false); return; }
        await api.post(`/users/${editTarget.id}/reset-password`, { password: editPw });
        toast.success('Password reset');
      }

      if (roleChanged || statusChanged) toast.success('User updated');
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update user');
    } finally { setSaving(false); }
  };

  // ── Delete modal ──────────────────────────────────────────────
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteTickets, setDeleteTickets] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const openDeleteModal = (u) => { setDeleteTarget(u); setDeleteTickets(false); setDeleteConfirm(''); };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`, { data: { deleteTickets } });
      toast.success(`User "${deleteTarget.full_name}" deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete user');
    } finally { setDeleting(false); }
  };

  const load = () => api.get('/users').then(r => setUsers(r.data.users)).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/users', form);
      toast.success('User created successfully');
      setShowForm(false);
      setForm({ username: '', email: '', fullName: '', password: '', role: 'employee' });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>User Management</h1>
          <p>Create accounts and manage user access</p>
        </div>
        <button className="btn-admin-create" onClick={() => setShowForm(s => !s)}>+ Add User</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="admin-form-card">
          <h3>Create New User</h3>
          <div className="admin-form-grid">
            <div className="form-group">
              <label>Full Name *</label>
              <input required value={form.fullName} onChange={e => setForm(f => ({...f, fullName: e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Username *</label>
              <input required value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Email *</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  required
                  type={showCreatePw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({...f, password: e.target.value}))}
                  style={{ width: '100%', boxSizing: 'border-box', paddingRight: 36 }}
                />
                <button type="button" onClick={() => setShowCreatePw(v => !v)}
                  style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 0 }}>
                  {showCreatePw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="admin-form-actions">
            <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn-save" disabled={loading}>{loading ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      )}

      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1A2B3C', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      {u.full_name[0]}
                    </div>
                    {u.full_name}
                  </div>
                </td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                <td><span className={`status-pill ${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="toggle-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => openEdit(u)}>
                      <Pencil size={12} /> Edit
                    </button>
                    <button className="toggle-btn delete-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => openDeleteModal(u)}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Edit Modal ─────────────────────────────────────────── */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>Edit User</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>@{editTarget.username}</p>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setEditTarget(null)}><X size={18} /></button>
            </div>

            {/* Role */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Role</label>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                disabled={currentUser?.id === editTarget.id}
                style={{ width: '100%', padding: '9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13.5, outline: 'none', background: 'white', cursor: currentUser?.id === editTarget.id ? 'not-allowed' : 'pointer', color: '#374151' }}
              >
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
              {currentUser?.id === editTarget.id && (
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#94a3b8' }}>You cannot change your own role</p>
              )}
            </div>

            {/* Status */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Status</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[true, false].map(val => (
                  <button key={String(val)}
                    onClick={() => setEditActive(val)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 7, border: `1.5px solid ${editActive === val ? (val ? '#16a34a' : '#dc2626') : '#e2e8f0'}`,
                      background: editActive === val ? (val ? '#f0fdf4' : '#fff1f2') : 'white',
                      color: editActive === val ? (val ? '#16a34a' : '#dc2626') : '#64748b',
                      fontWeight: editActive === val ? 600 : 400, fontSize: 13.5, cursor: 'pointer',
                    }}>
                    {val ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset Password */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                New Password <span style={{ fontWeight: 400, color: '#94a3b8' }}>(leave blank to keep current)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showEditPw ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={editPw}
                  onChange={e => setEditPw(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 38px 9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13.5, outline: 'none' }}
                />
                <button type="button" onClick={() => setShowEditPw(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                  {showEditPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn-save" disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 7, border: 'none', fontSize: 13.5, cursor: 'pointer' }}
                onClick={handleSaveEdit}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ───────────────────────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: '#dc2626' }}>Delete User</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 13.5, color: '#374151', marginBottom: 14 }}>
              Type <strong>{deleteTarget.username}</strong> to confirm deletion.
            </p>
            <input
              autoFocus
              placeholder={deleteTarget.username}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13.5, outline: 'none', marginBottom: 14 }}
            />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, background: deleteTickets ? '#fff1f2' : '#f8fafc', border: `1.5px solid ${deleteTickets ? '#fecaca' : '#e2e8f0'}`, marginBottom: 20, userSelect: 'none' }}>
              <input type="checkbox" checked={deleteTickets} onChange={e => setDeleteTickets(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#dc2626', flexShrink: 0, width: 15, height: 15 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: deleteTickets ? '#dc2626' : '#374151' }}>Also delete all their tickets</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                  {deleteTickets ? 'Tickets will be removed from all views.' : 'Tickets stay visible in User Wise Tickets.'}
                </div>
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-save"
                style={{ background: '#dc2626', padding: '8px 20px', borderRadius: 7, border: 'none', fontSize: 13.5, cursor: deleteConfirm === deleteTarget.username ? 'pointer' : 'not-allowed', color: 'white', display: 'flex', alignItems: 'center', gap: 6, opacity: deleteConfirm === deleteTarget.username ? 1 : 0.5 }}
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== deleteTarget.username}>
                <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
