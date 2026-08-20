import React, { useEffect, useState } from 'react';
import { KeyRound, X, Eye, EyeOff, Trash2 } from 'lucide-react';

import api from '../../api/axios';
import toast from 'react-hot-toast';
import './Admin.css';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', fullName: '', password: '', role: 'employee' });
  const [loading, setLoading] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);

  // delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
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

  // password reset modal
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (e, u) => {
    e.stopPropagation();
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.is_active });
      toast.success(u.is_active ? 'User deactivated' : 'User activated');
      load();
    } catch { toast.error('Failed to update status'); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setResetting(true);
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { password: newPassword });
      toast.success(`Password reset for ${resetTarget.full_name}`);
      setResetTarget(null);
      setNewPassword('');
      setShowNewPw(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
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
                <button
                  type="button"
                  onClick={() => setShowCreatePw(v => !v)}
                  style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 0 }}
                >
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
                    <button
                      className="toggle-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => { setResetTarget(u); setNewPassword(''); }}
                      title="Reset Password"
                    >
                      <KeyRound size={12} /> Reset Password
                    </button>
                    <button className="toggle-btn" onClick={(e) => toggleActive(e, u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="toggle-btn delete-btn"
                      onClick={() => openDeleteModal(u)}
                      title="Delete user"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirm Modal */}
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
              <input
                type="checkbox"
                checked={deleteTickets}
                onChange={e => setDeleteTickets(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#dc2626', flexShrink: 0, width: 15, height: 15 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: deleteTickets ? '#dc2626' : '#374151' }}>
                  Also delete all their tickets
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                  {deleteTickets ? 'Tickets will be removed from all views.' : 'Tickets stay visible in User Wise Tickets.'}
                </div>
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="btn-save"
                style={{ background: '#dc2626', padding: '8px 20px', borderRadius: 7, border: 'none', fontSize: 13.5, cursor: deleteConfirm === deleteTarget.username ? 'pointer' : 'not-allowed', color: 'white', display: 'flex', alignItems: 'center', gap: 6, opacity: deleteConfirm === deleteTarget.username ? 1 : 0.5 }}
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== deleteTarget.username}
              >
                <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Reset Password</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setResetTarget(null)}><X size={18} /></button>
            </div>
            <p>Set a new password for <strong>{resetTarget.full_name}</strong> (@{resetTarget.username})</p>
            <form onSubmit={handleResetPassword}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>New Password *</label>
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    autoFocus
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ padding: '9px 38px 9px 10px', border: '1.5px solid #E2E8F0', borderRadius: 7, fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                  >
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setResetTarget(null)}>Cancel</button>
                <button type="submit" className="btn-save" disabled={resetting} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', fontSize: 13.5, cursor: 'pointer' }}>
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
