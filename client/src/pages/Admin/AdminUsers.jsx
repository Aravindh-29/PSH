import React, { useEffect, useState } from 'react';
import { KeyRound, X, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './Admin.css';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', fullName: '', password: '', role: 'employee' });
  const [loading, setLoading] = useState(false);

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
              <input required type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
