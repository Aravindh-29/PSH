import React, { useEffect, useRef, useState } from 'react';
import {
  X, Eye, EyeOff, Trash2, Pencil,
  Upload, FileDown, ChevronDown, CheckCircle, AlertCircle, Users,
} from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import XLSX from '../../utils/xlsxShim';
import ExcelJS from 'exceljs';
import './Admin.css';

// ── Validation ────────────────────────────────────────────────
function validateRow({ fullName, username, email, password, role }) {
  const errs = [];
  if (!fullName?.trim())  errs.push('Full Name required');
  if (!username?.trim())  errs.push('Username required');
  else if (!/^[a-z0-9._-]+$/.test(username.trim())) errs.push('Username: lowercase, no spaces');
  if (!email?.trim())     errs.push('Email required');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.push('Invalid email');
  if (!password?.trim())  errs.push('Password required');
  else if (password.trim().length < 6) errs.push('Password min 6 chars');
  if (role && !['employee', 'admin'].includes(role.toLowerCase().trim())) errs.push('Role: employee or admin');
  return errs;
}

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

  // ── Delete modal ──────────────────────────────────────────────
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteTickets, setDeleteTickets] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // ── Bulk upload ───────────────────────────────────────────────
  const [bulkDropdown,  setBulkDropdown]  = useState(false);
  const [bulkPreview,   setBulkPreview]   = useState(null);   // parsed rows or null
  const [bulkPwModal,   setBulkPwModal]   = useState(false);
  const [adminPw,       setAdminPw]       = useState('');
  const [showAdminPw,   setShowAdminPw]   = useState(false);
  const [bulkCreating,  setBulkCreating]  = useState(false);
  const [showBulkPw,    setShowBulkPw]    = useState(false);
  const bulkDropRef = useRef(null);
  const bulkFileRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (bulkDropRef.current && !bulkDropRef.current.contains(e.target)) setBulkDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = () => api.get('/users').then(r => setUsers(r.data.users)).catch(() => {});
  useEffect(() => { load(); }, []);

  // ── Single user create ────────────────────────────────────────
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

  // ── Edit ──────────────────────────────────────────────────────
  const openEdit = (u) => { setEditTarget(u); setEditRole(u.role); setEditActive(u.is_active); setEditPw(''); setShowEditPw(false); };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const isSelf = currentUser?.id === editTarget.id;
      const roleChanged   = editRole   !== editTarget.role;
      const statusChanged = editActive !== editTarget.is_active;
      if (isSelf && roleChanged) { toast.error('You cannot change your own role'); setSaving(false); return; }
      if (roleChanged || statusChanged) {
        await api.put(`/users/${editTarget.id}`, { role: roleChanged ? editRole : undefined, isActive: statusChanged ? editActive : undefined });
      }
      if (editPw.trim()) {
        if (editPw.length < 6) { toast.error('Password must be at least 6 characters'); setSaving(false); return; }
        await api.post(`/users/${editTarget.id}/reset-password`, { password: editPw });
        toast.success('Password reset');
      }
      if (roleChanged || statusChanged) toast.success('User updated');
      setEditTarget(null); load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update user');
    } finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────
  const openDeleteModal = (u) => { setDeleteTarget(u); setDeleteTickets(false); setDeleteConfirm(''); };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`, { data: { deleteTickets } });
      toast.success(`User "${deleteTarget.full_name}" deleted`);
      setDeleteTarget(null); load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete user');
    } finally { setDeleting(false); }
  };

  // ── Bulk: download template ───────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Users (headers + example)
    const usersSheet = XLSX.utils.aoa_to_sheet([
      ['Full Name', 'Username', 'Email', 'Password', 'Role'],
      ['John Smith', 'john.smith', 'john.smith@company.com', 'Welcome@123', 'employee'],
    ]);
    usersSheet['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 32 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, usersSheet, 'Users');

    // Sheet 2: Instructions
    const instrSheet = XLSX.utils.aoa_to_sheet([
      ['Column', 'Required', 'Rules', 'Example'],
      ['Full Name',  'Yes', 'Any text',                                                       'John Smith'],
      ['Username',   'Yes', 'Lowercase letters, numbers, dots, underscores. No spaces.',      'john.smith'],
      ['Email',      'Yes', 'Valid email address',                                             'john.smith@company.com'],
      ['Password',   'Yes', 'Minimum 6 characters',                                           'Welcome@123'],
      ['Role',       'No',  '"employee" or "admin"  (leave blank to default to employee)',    'employee'],
    ]);
    instrSheet['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 55 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

    XLSX.writeFile(wb, 'PSH_Bulk_User_Template.xlsx');
    setBulkDropdown(false);
  };

  // ── Bulk: parse uploaded file ─────────────────────────────────
  // Unwrap ExcelJS cell values — handles hyperlinks, rich text, plain values
  const cellStr = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if (val.text) return String(val.text).trim();
      if (val.hyperlink) return String(val.hyperlink).replace(/^mailto:/i, '').trim();
      if (val.richText) return val.richText.map(r => r.text || '').join('').trim();
    }
    return String(val).trim();
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(ev.target.result);
        const ws = wb.worksheets[0];
        if (!ws) {
          toast.error('No worksheet found in file.');
          return;
        }

        // Build header map: normalised-key → 1-based column index
        const headerMap = {};
        ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
          const key = cellStr(cell.value).toLowerCase().replace(/[\s_]/g, '');
          if (key) headerMap[key] = colNum;
        });

        const getCol = (row, keys) => {
          for (const k of keys) {
            const colNum = headerMap[k];
            if (colNum) return cellStr(row.getCell(colNum).value);
          }
          return '';
        };

        const parsed = [];
        ws.eachRow((row, rowNum) => {
          if (rowNum === 1) return;
          const fullName = getCol(row, ['fullname', 'name']);
          const username = getCol(row, ['username', 'user']).toLowerCase().replace(/\s+/g, '');
          const email    = getCol(row, ['email']).toLowerCase();
          const password = getCol(row, ['password', 'pass', 'pwd']);
          const role     = (getCol(row, ['role']) || 'employee').toLowerCase().trim();
          if (!fullName && !username && !email) return;
          const errs = validateRow({ fullName, username, email, password, role });
          parsed.push({ _idx: rowNum - 1, fullName, username, email, password, role: role || 'employee', errors: errs, valid: errs.length === 0, selected: errs.length === 0 });
        });

        if (!parsed.length) {
          toast.error('No data found. Make sure headers are in row 1 and data starts in row 2.');
          return;
        }
        setBulkPreview(parsed);
        setBulkDropdown(false);
      } catch (err) {
        console.error('Bulk file parse error:', err);
        toast.error('Failed to read file. Please use the downloaded template.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Bulk: create users ────────────────────────────────────────
  const handleBulkCreate = async () => {
    if (!adminPw.trim()) { toast.error('Enter your admin password'); return; }
    setBulkCreating(true);
    const toCreate = (bulkPreview || []).filter(r => r.valid && r.selected);
    try {
      const res = await api.post('/users/bulk', {
        adminPassword: adminPw,
        users: toCreate.map(r => ({ fullName: r.fullName, username: r.username, email: r.email, password: r.password, role: r.role })),
      });
      const { created, failed } = res.data;
      if (created > 0) toast.success(`${created} user${created !== 1 ? 's' : ''} created successfully`);
      if (failed?.length) toast.error(`${failed.length} user${failed.length !== 1 ? 's' : ''} failed — check duplicates`);
      setBulkPreview(null);
      setBulkPwModal(false);
      setAdminPw('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Bulk creation failed');
    } finally { setBulkCreating(false); }
  };

  const validCount    = (bulkPreview || []).filter(r => r.valid && r.selected).length;
  const invalidCount  = (bulkPreview || []).filter(r => !r.valid).length;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>User Management</h1>
          <p>Create accounts and manage user access</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Bulk Upload button */}
          <div style={{ position: 'relative' }} ref={bulkDropRef}>
            <button
              className="btn-admin-create"
              style={{ background: 'white', color: '#334155', border: '1.5px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setBulkDropdown(v => !v)}
            >
              <Users size={15} />
              Bulk Upload
              <ChevronDown size={13} style={{ opacity: 0.6 }} />
            </button>
            {bulkDropdown && (
              <div className="bulk-dropdown">
                <button className="bulk-dropdown-item" onClick={downloadTemplate}>
                  <FileDown size={15} style={{ color: '#16A34A' }} />
                  <div>
                    <div className="bulk-dropdown-label">Download Template</div>
                    <div className="bulk-dropdown-sub">Excel file with example row</div>
                  </div>
                </button>
                <div style={{ height: 1, background: '#F1F5F9', margin: '4px 0' }} />
                <button className="bulk-dropdown-item" onClick={() => { setBulkDropdown(false); bulkFileRef.current?.click(); }}>
                  <Upload size={15} style={{ color: '#6366F1' }} />
                  <div>
                    <div className="bulk-dropdown-label">Upload Excel</div>
                    <div className="bulk-dropdown-sub">Upload filled template</div>
                  </div>
                </button>
              </div>
            )}
            <input ref={bulkFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleBulkFile} />
          </div>
          <button className="btn-admin-create" onClick={() => setShowForm(s => !s)}>+ Add User</button>
        </div>
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
              <th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>
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
                    <button className="toggle-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(u)}>
                      <Pencil size={12} /> Edit
                    </button>
                    <button className="toggle-btn delete-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openDeleteModal(u)}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Bulk Preview Modal ─────────────────────────────────── */}
      {bulkPreview && (
        <div className="modal-overlay" onClick={() => setBulkPreview(null)}>
          <div className="bulk-preview-modal" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bulk-preview-header">
              <div>
                <h3 style={{ margin: 0 }}>Preview — {bulkPreview.length} row{bulkPreview.length !== 1 ? 's' : ''} found</h3>
                <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                    <CheckCircle size={13} /> {validCount} valid
                  </span>
                  {invalidCount > 0 && (
                    <span style={{ fontSize: 12, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      <AlertCircle size={13} /> {invalidCount} invalid
                    </span>
                  )}
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setBulkPreview(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Table */}
            <div className="bulk-preview-table-wrap">
              <table className="bulk-preview-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>#</th>
                    <th>Full Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        Password
                        <button
                          onClick={() => setShowBulkPw(v => !v)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8', display: 'flex', alignItems: 'center' }}
                          title={showBulkPw ? 'Hide passwords' : 'Show passwords'}
                        >
                          {showBulkPw ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </span>
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkPreview.map((row, i) => (
                    <tr key={i} style={{ background: row.valid ? 'white' : '#FFF5F5' }}>
                      <td style={{ textAlign: 'center' }}>
                        {row.valid && (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => {
                              const next = [...bulkPreview];
                              next[i] = { ...next[i], selected: !next[i].selected };
                              setBulkPreview(next);
                            }}
                            style={{ accentColor: '#E85D04', width: 14, height: 14, cursor: 'pointer' }}
                          />
                        )}
                      </td>
                      <td style={{ color: '#94A3B8', fontSize: 12 }}>{row._idx}</td>
                      <td style={{ fontWeight: 500 }}>{row.fullName || <span style={{ color: '#DC2626' }}>—</span>}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{row.username || <span style={{ color: '#DC2626' }}>—</span>}</td>
                      <td style={{ fontSize: 12.5 }}>{row.email || <span style={{ color: '#DC2626' }}>—</span>}</td>
                      <td>
                        <span className={`role-badge ${['employee','admin'].includes(row.role) ? row.role : ''}`} style={{ fontSize: 11 }}>
                          {row.role || '—'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: showBulkPw ? '#334155' : '#94A3B8', letterSpacing: showBulkPw ? 0 : 2 }}>
                        {row.password
                          ? (showBulkPw ? row.password : '••••••')
                          : <span style={{ color: '#DC2626' }}>—</span>}
                      </td>
                      <td>
                        {row.valid
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16A34A', fontSize: 12, fontWeight: 600 }}><CheckCircle size={13} /> Valid</span>
                          : <span style={{ color: '#DC2626', fontSize: 11.5 }} title={row.errors.join('\n')}>
                              <AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                              {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1} more` : ''}
                            </span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="bulk-preview-footer">
              <span style={{ fontSize: 12.5, color: '#64748B' }}>
                {validCount === 0
                  ? 'No valid rows to create. Fix errors in the Excel file and re-upload.'
                  : `${validCount} user${validCount !== 1 ? 's' : ''} will be created.`}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-cancel" onClick={() => setBulkPreview(null)}>Cancel</button>
                <button
                  className="btn-save"
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', fontSize: 13.5, cursor: validCount === 0 ? 'not-allowed' : 'pointer', opacity: validCount === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                  disabled={validCount === 0}
                  onClick={() => setBulkPwModal(true)}
                >
                  <Users size={15} /> Create {validCount} User{validCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Password Confirm Modal ───────────────────────── */}
      {bulkPwModal && (
        <div className="modal-overlay" onClick={() => { setBulkPwModal(false); setAdminPw(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Confirm Admin Password</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => { setBulkPwModal(false); setAdminPw(''); }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>
              Enter your admin password to create <strong>{validCount} user{validCount !== 1 ? 's' : ''}</strong>.
            </p>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <input
                autoFocus
                type={showAdminPw ? 'text' : 'password'}
                placeholder="Your admin password"
                value={adminPw}
                onChange={e => setAdminPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBulkCreate()}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 38px 10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13.5, outline: 'none' }}
              />
              <button type="button" onClick={() => setShowAdminPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}>
                {showAdminPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setBulkPwModal(false); setAdminPw(''); }}>Cancel</button>
              <button
                className="btn-save"
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={bulkCreating || !adminPw.trim()}
                onClick={handleBulkCreate}
              >
                {bulkCreating ? 'Creating...' : `Create ${validCount} User${validCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Role</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)} disabled={currentUser?.id === editTarget.id}
                style={{ width: '100%', padding: '9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13.5, outline: 'none', background: 'white', cursor: currentUser?.id === editTarget.id ? 'not-allowed' : 'pointer', color: '#374151' }}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
              {currentUser?.id === editTarget.id && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#94a3b8' }}>You cannot change your own role</p>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Status</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[true, false].map(val => (
                  <button key={String(val)} onClick={() => setEditActive(val)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: `1.5px solid ${editActive === val ? (val ? '#16a34a' : '#dc2626') : '#e2e8f0'}`, background: editActive === val ? (val ? '#f0fdf4' : '#fff1f2') : 'white', color: editActive === val ? (val ? '#16a34a' : '#dc2626') : '#64748b', fontWeight: editActive === val ? 600 : 400, fontSize: 13.5, cursor: 'pointer' }}>
                    {val ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                New Password <span style={{ fontWeight: 400, color: '#94a3b8' }}>(leave blank to keep current)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input type={showEditPw ? 'text' : 'password'} placeholder="Min. 6 characters" value={editPw} onChange={e => setEditPw(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 38px 9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13.5, outline: 'none' }} />
                <button type="button" onClick={() => setShowEditPw(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                  {showEditPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn-save" disabled={saving} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', fontSize: 13.5, cursor: 'pointer' }} onClick={handleSaveEdit}>
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
            <input autoFocus placeholder={deleteTarget.username} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13.5, outline: 'none', marginBottom: 14 }} />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, background: deleteTickets ? '#fff1f2' : '#f8fafc', border: `1.5px solid ${deleteTickets ? '#fecaca' : '#e2e8f0'}`, marginBottom: 20, userSelect: 'none' }}>
              <input type="checkbox" checked={deleteTickets} onChange={e => setDeleteTickets(e.target.checked)} style={{ marginTop: 2, accentColor: '#dc2626', flexShrink: 0, width: 15, height: 15 }} />
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
                onClick={handleDelete} disabled={deleting || deleteConfirm !== deleteTarget.username}>
                <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
