import React, { useEffect, useRef, useState } from 'react';
import {
  X, Eye, EyeOff, Trash2, Pencil,
  Upload, FileDown, ChevronDown, CheckCircle, AlertCircle, Users, Search,
} from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import XLSX from '../../utils/xlsxShim';
import ExcelJS from 'exceljs';
import './Admin.css';

// ── Single-select role dropdown ───────────────────────────────
const ROLE_OPTIONS = [{ value: 'employee', label: 'Employee' }, { value: 'admin', label: 'Admin' }];

function RoleSelect({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = ROLE_OPTIONS.find(o => o.value === value);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        onClick={() => !disabled && setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: `1.5px solid ${open ? '#E85D04' : '#e2e8f0'}`, borderRadius: 6, background: disabled ? '#f9fafb' : 'white', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13.5, color: '#0d1b2a', boxShadow: open ? '0 0 0 3px rgba(232,93,4,.08)' : 'none', transition: 'border-color .15s', opacity: disabled ? 0.6 : 1 }}
      >
        <span>{selected?.label || 'Select role…'}</span>
        <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden' }}>
          {ROLE_OPTIONS.map(o => {
            const active = o.value === value;
            return (
              <div
                key={o.value}
                onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }}
                style={{ padding: '9px 12px', fontSize: 13.5, cursor: 'pointer', background: active ? '#fff7f0' : 'white', color: active ? '#E85D04' : '#0d1b2a', fontWeight: active ? 600 : 400, borderBottom: '1px solid #f8fafc' }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Group multi-select dropdown ───────────────────────────────
function GroupMultiSelect({ allGroups, selectedIds, onChange, direction = 'down' }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef           = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = allGroups.filter(g =>
    !query || g.name.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);

  const label = selectedIds.length === 0
    ? 'Select groups…'
    : selectedIds.length === 1
      ? allGroups.find(g => g.id === selectedIds[0])?.name || '1 group'
      : `${selectedIds.length} groups selected`;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: `1.5px solid ${open ? '#E85D04' : '#e2e8f0'}`, borderRadius: 7, background: 'white', cursor: 'pointer', fontSize: 13, color: selectedIds.length ? '#0d1b2a' : '#9ca3af', boxShadow: open ? '0 0 0 3px rgba(232,93,4,.08)' : 'none', transition: 'border-color .15s' }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', ...(direction === 'up' ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), left: 0, right: 0, zIndex: 300, background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search groups…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: '#0d1b2a' }}
            />
          </div>
          {/* List */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No groups found</div>
              : filtered.map(g => {
                  const checked = selectedIds.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      onMouseDown={e => { e.preventDefault(); toggle(g.id); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', background: checked ? '#fff7f0' : 'white', borderBottom: '1px solid #f8fafc' }}
                    >
                      <div style={{ width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${checked ? '#E85D04' : '#d1d5db'}`, background: checked ? '#E85D04' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{ fontSize: 13, color: checked ? '#E85D04' : '#0d1b2a', fontWeight: checked ? 600 : 400 }}>{g.name}</span>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [form, setForm] = useState({ username: '', email: '', fullName: '', password: '', role: 'employee', mfaRequired: true });
  const [loading, setLoading]   = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);

  const [userSearch, setUserSearch] = useState('');

  // ── Edit modal ────────────────────────────────────────────────
  const [editTarget,      setEditTarget]      = useState(null);
  const [editRole,        setEditRole]        = useState('employee');
  const [editActive,      setEditActive]      = useState(true);
  const [editMfaRequired, setEditMfaRequired] = useState(true);
  const [editPw,          setEditPw]          = useState('');
  const [showEditPw,      setShowEditPw]      = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [resettingMfa,    setResettingMfa]    = useState(false);

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
  const [bulkProgress,  setBulkProgress]  = useState(0);   // 0–100
  const [bulkDoneCount, setBulkDoneCount] = useState(0);
  const [showBulkPw,    setShowBulkPw]    = useState(false);
  const bulkProgressRef = useRef(null);
  const bulkDropRef = useRef(null);
  const [allGroups,       setAllGroups]       = useState([]);
  const [createGroupIds,  setCreateGroupIds]  = useState([]);
  const [editGroupIds,    setEditGroupIds]    = useState([]);
  const bulkFileRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (bulkDropRef.current && !bulkDropRef.current.contains(e.target)) setBulkDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = () => Promise.all([
    api.get('/users'),
    api.get('/groups'),
  ]).then(([u, g]) => {
    setUsers(u.data.users || []);
    setAllGroups((g.data.groups || []).filter(g => g.is_active));
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  // ── Single user create ────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/users', { ...form, groupIds: createGroupIds });
      toast.success('User created successfully');
      setShowForm(false);
      setForm({ username: '', email: '', fullName: '', password: '', role: 'employee', mfaRequired: true });
      setCreateGroupIds([]);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    } finally { setLoading(false); }
  };

  // ── Edit ──────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditTarget(u);
    setEditRole(u.role);
    setEditActive(u.is_active);
    setEditMfaRequired(u.mfa_required !== false);
    setEditPw('');
    setShowEditPw(false);
    setEditGroupIds((u.groups || []).map(g => g.id));
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const isSelf = currentUser?.id === editTarget.id;
      const roleChanged       = editRole        !== editTarget.role;
      const statusChanged     = editActive      !== editTarget.is_active;
      const mfaChanged        = editMfaRequired !== (editTarget.mfa_required !== false);
      const savedGroupIds     = (editTarget.groups || []).map(g => g.id).sort().join(',');
      const newGroupIds       = [...editGroupIds].sort().join(',');
      const groupsChanged     = savedGroupIds !== newGroupIds;
      if (isSelf && roleChanged) { toast.error('You cannot change your own role'); setSaving(false); return; }
      if (roleChanged || statusChanged || groupsChanged || mfaChanged) {
        await api.put(`/users/${editTarget.id}`, {
          role:        roleChanged   ? editRole        : undefined,
          isActive:    statusChanged ? editActive      : undefined,
          mfaRequired: mfaChanged    ? editMfaRequired : undefined,
          groupIds: editGroupIds,
        });
      }
      if (editPw.trim()) {
        if (editPw.length < 6) { toast.error('Password must be at least 6 characters'); setSaving(false); return; }
        await api.post(`/users/${editTarget.id}/reset-password`, { password: editPw });
        toast.success('Password reset');
      }
      if (roleChanged || statusChanged || groupsChanged || mfaChanged) toast.success('User updated');
      setEditTarget(null); load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update user');
    } finally { setSaving(false); }
  };

  // ── Reset MFA ─────────────────────────────────────────────────
  const handleResetMfa = async () => {
    setResettingMfa(true);
    try {
      await api.post(`/users/${editTarget.id}/reset-mfa`);
      toast.success('MFA reset — user must re-enroll on next login');
      setEditTarget(t => ({ ...t, mfa_enabled: false }));
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reset MFA');
    } finally { setResettingMfa(false); }
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
      ['Full Name', 'Username', 'Email', 'Password', 'Role', 'Groups', 'MFA'],
      ['John Smith', 'john.smith', 'john.smith@company.com', 'Welcome@123', 'employee', 'L1 Support,Network Team', 'TRUE'],
    ]);
    usersSheet['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 32 }, { wch: 16 }, { wch: 12 }, { wch: 30 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, usersSheet, 'Users');

    // Sheet 2: Instructions
    const instrSheet = XLSX.utils.aoa_to_sheet([
      ['Column', 'Required', 'Rules', 'Example'],
      ['Full Name',  'Yes', 'Any text',                                                       'John Smith'],
      ['Username',   'Yes', 'Lowercase letters, numbers, dots, underscores. No spaces.',      'john.smith'],
      ['Email',      'Yes', 'Valid email address',                                             'john.smith@company.com'],
      ['Password',   'Yes', 'Minimum 6 characters',                                           'Welcome@123'],
      ['Role',       'No',  '"employee" or "admin"  (leave blank to default to employee)',    'employee'],
      ['Groups',     'No',  'Comma-separated group names (must match existing group names)',  'L1 Support,Network Team'],
      ['MFA',        'No',  'TRUE or FALSE — whether MFA is required (defaults to TRUE)',     'TRUE'],
    ]);
    instrSheet['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 60 }, { wch: 28 }];
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
          const fullName  = getCol(row, ['fullname', 'name']);
          const username  = getCol(row, ['username', 'user']).toLowerCase().replace(/\s+/g, '');
          const email     = getCol(row, ['email']).toLowerCase();
          const password  = getCol(row, ['password', 'pass', 'pwd']);
          const role      = (getCol(row, ['role']) || 'employee').toLowerCase().trim();
          const groupsRaw = getCol(row, ['groups', 'group']);
          const groups    = groupsRaw ? groupsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
          const mfaRaw    = getCol(row, ['mfa', 'mfarequired', 'requiremfa']).toLowerCase().trim();
          const mfaRequired = !(mfaRaw === 'false' || mfaRaw === '0' || mfaRaw === 'no');
          if (!fullName && !username && !email) return;
          const errs = validateRow({ fullName, username, email, password, role });
          parsed.push({ _idx: rowNum - 1, fullName, username, email, password, role: role || 'employee', groups, mfaRequired, errors: errs, valid: errs.length === 0, selected: errs.length === 0, isDuplicate: false, duplicateReason: '' });
        });

        if (!parsed.length) {
          toast.error('No data found. Make sure headers are in row 1 and data starts in row 2.');
          return;
        }

        // Detect within-file duplicates by username or email
        const unameCounts = {};
        const emailCounts = {};
        for (const r of parsed) {
          if (r.username) unameCounts[r.username] = (unameCounts[r.username] || 0) + 1;
          if (r.email)    emailCounts[r.email]    = (emailCounts[r.email]    || 0) + 1;
        }
        const firstSeen = {};
        for (const r of parsed) {
          const dupeByUser  = r.username && unameCounts[r.username] > 1;
          const dupeByEmail = r.email    && emailCounts[r.email]    > 1;
          if (r.valid && (dupeByUser || dupeByEmail)) {
            const key = `${r.username}|${r.email}`;
            if (firstSeen[key]) {
              // Mark second+ occurrence as duplicate
              r.isDuplicate = true;
              r.selected = false;
              r.duplicateReason = dupeByUser ? `Username "${r.username}" used ${unameCounts[r.username]}× in file` : `Email "${r.email}" used ${emailCounts[r.email]}× in file`;
            } else {
              firstSeen[key] = true;
            }
          }
        }

        // Check valid, non-file-duplicate rows against existing DB users
        const rowsToCheck = parsed.filter(r => r.valid && !r.isDuplicate);
        if (rowsToCheck.length > 0) {
          try {
            const checkRes = await api.post('/users/bulk-check', {
              usernames: rowsToCheck.map(r => r.username),
              emails:    rowsToCheck.map(r => r.email),
            });
            const conflictUsernames = new Set(checkRes.data.conflictUsernames || []);
            const conflictEmails    = new Set(checkRes.data.conflictEmails    || []);
            for (const r of parsed) {
              if (r.isDuplicate || !r.valid) continue;
              const unameHit = conflictUsernames.has(r.username);
              const emailHit = conflictEmails.has(r.email);
              if (unameHit || emailHit) {
                r.isDuplicate     = true;
                r.isDbDuplicate   = true;
                r.selected        = false;
                r.duplicateReason = unameHit
                  ? `Username "${r.username}" already exists in the system`
                  : `Email "${r.email}" already exists in the system`;
              }
            }
          } catch {
            // Network / server error: silently proceed — server will reject on create
          }
        }

        // Validate group names against known groups (case-insensitive)
        for (const r of parsed) {
          if (!r.valid || r.isDuplicate) continue;
          const badGroups = (r.groups || []).filter(
            g => !allGroups.some(ag => ag.name.toLowerCase() === g.toLowerCase())
          );
          if (badGroups.length > 0) {
            badGroups.forEach(g => r.errors.push(`Group "${g}" not found in system`));
            r.valid    = false;
            r.selected = false;
          }
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
    const toCreate = (bulkPreview || []).filter(r => r.valid && r.selected);
    setBulkCreating(true);
    setBulkProgress(0);
    setBulkDoneCount(0);

    // Animate progress: estimate ~250ms per user, stop at 90% until server responds
    const total = toCreate.length;
    const estimatedMs = Math.max(total * 250, 2000);
    const tickMs = 80;
    const tickStep = (90 / (estimatedMs / tickMs));
    let current = 0;
    bulkProgressRef.current = setInterval(() => {
      current = Math.min(current + tickStep, 90);
      setBulkProgress(Math.round(current));
      setBulkDoneCount(Math.round((current / 100) * total));
    }, tickMs);

    try {
      const res = await api.post('/users/bulk', {
        adminPassword: adminPw,
        users: toCreate.map(r => ({ fullName: r.fullName, username: r.username, email: r.email, password: r.password, role: r.role, groups: r.groups || [], mfaRequired: r.mfaRequired })),
      });
      clearInterval(bulkProgressRef.current);
      setBulkProgress(100);
      setBulkDoneCount(total);
      await new Promise(r => setTimeout(r, 600)); // let bar show 100% briefly
      const { created, failed } = res.data;
      if (created > 0) toast.success(`${created} user${created !== 1 ? 's' : ''} created successfully`);
      if (failed?.length) toast.error(`${failed.length} user${failed.length !== 1 ? 's' : ''} failed — check duplicates`);
      setBulkPreview(null);
      setBulkPwModal(false);
      setAdminPw('');
      load();
    } catch (err) {
      clearInterval(bulkProgressRef.current);
      setBulkProgress(0);
      toast.error(err?.response?.data?.message || 'Bulk creation failed');
    } finally {
      setBulkCreating(false);
      setBulkProgress(0);
      setBulkDoneCount(0);
    }
  };

  const validCount    = (bulkPreview || []).filter(r => r.valid && !r.isDuplicate && r.selected).length;
  const invalidCount  = (bulkPreview || []).filter(r => !r.valid).length;
  const dupCount      = (bulkPreview || []).filter(r => r.isDuplicate && !r.isDbDuplicate).length;
  const dbDupCount    = (bulkPreview || []).filter(r => r.isDbDuplicate).length;

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
              <RoleSelect value={form.role} onChange={v => setForm(f => ({...f, role: v}))} />
            </div>
            <div className="form-group">
              <label>Require MFA</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[true, false].map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setForm(f => ({...f, mfaRequired: val}))}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${form.mfaRequired === val ? (val ? '#E85D04' : '#64748b') : '#e2e8f0'}`, background: form.mfaRequired === val ? (val ? '#fff7f0' : '#f8fafc') : 'white', color: form.mfaRequired === val ? (val ? '#E85D04' : '#334155') : '#64748b', fontWeight: form.mfaRequired === val ? 600 : 400, fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}
                  >
                    {val ? 'Required' : 'Not Required'}
                  </button>
                ))}
              </div>
            </div>
            {allGroups.length > 0 && (
              <div className="form-group">
                <label>Groups</label>
                <GroupMultiSelect
                  allGroups={allGroups}
                  selectedIds={createGroupIds}
                  onChange={setCreateGroupIds}
                />
              </div>
            )}
          </div>
          <div className="admin-form-actions">
            <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn-save" disabled={loading}>{loading ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      )}

      <div className="admin-table-card">
        <div className="admin-table-search-bar">
          <Search size={15} className="admin-table-search-icon" />
          <input
            type="text"
            placeholder="Search by name, username, email or role…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="admin-table-search-input"
          />
          {userSearch && (
            <button className="admin-table-search-clear" onClick={() => setUserSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.filter(u => {
              if (!userSearch.trim()) return true;
              const q = userSearch.toLowerCase();
              return (
                u.full_name?.toLowerCase().includes(q) ||
                u.username?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q) ||
                u.role?.toLowerCase().includes(q)
              );
            }).map(u => (
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
            {users.filter(u => {
              if (!userSearch.trim()) return true;
              const q = userSearch.toLowerCase();
              return u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
            }).length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 13.5 }}>
                  No users match "{userSearch}"
                </td>
              </tr>
            )}
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
                  {dupCount > 0 && (
                    <span style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      ⚠ {dupCount} duplicate{dupCount !== 1 ? 's' : ''} in file — skipped
                    </span>
                  )}
                  {dbDupCount > 0 && (
                    <span style={{ fontSize: 12, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      ⚠ {dbDupCount} already in DB — skipped
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
                    <th>MFA</th>
                    <th>Groups</th>
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
                  {bulkPreview.map((row, i) => {
                    const rowBg = row.isDbDuplicate ? '#FFFBEB' : row.isDuplicate ? '#F8F9FB' : (row.valid ? 'white' : '#FFF5F5');
                    const textOp = row.isDuplicate ? { opacity: 0.5 } : {};
                    return (
                    <tr key={i} style={{ background: rowBg }}>
                      <td style={{ textAlign: 'center' }}>
                        {row.valid && !row.isDuplicate && (
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
                      <td style={{ fontWeight: 500, ...textOp }}>{row.fullName || <span style={{ color: '#DC2626' }}>—</span>}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12.5, ...textOp }}>{row.username || <span style={{ color: '#DC2626' }}>—</span>}</td>
                      <td style={{ fontSize: 12.5, ...textOp }}>{row.email || <span style={{ color: '#DC2626' }}>—</span>}</td>
                      <td>
                        {(() => {
                          const validRole = ['employee', 'admin'].includes((row.role || '').toLowerCase());
                          return (
                            <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: validRole ? '#DCFCE7' : '#FEE2E2', color: validRole ? '#15803D' : '#DC2626', ...textOp }}>
                              {row.role || '—'}{!validRole && row.role ? ' ✗' : ''}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: row.mfaRequired ? '#FFF7ED' : '#F8FAFC', color: row.mfaRequired ? '#E85D04' : '#64748B', ...textOp }}>
                          {row.mfaRequired ? 'Required' : 'Off'}
                        </span>
                      </td>
                      <td>
                        {(!row.groups || row.groups.length === 0)
                          ? <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>
                          : (() => {
                              const SHOW = 3;
                              const visible = row.groups.slice(0, SHOW);
                              const hidden  = row.groups.slice(SHOW);
                              const allTip  = hidden.map(g => {
                                const ex = allGroups.some(ag => ag.name.toLowerCase() === g.toLowerCase());
                                return `${ex ? '✓' : '✗'} ${g}`;
                              }).join('\n');
                              return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                                  {visible.map((g, gi) => {
                                    const exists = allGroups.some(ag => ag.name.toLowerCase() === g.toLowerCase());
                                    return (
                                      <span key={gi} title={exists ? g : `"${g}" not found in system`} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: exists ? '#DCFCE7' : '#FEE2E2', color: exists ? '#15803D' : '#DC2626', whiteSpace: 'nowrap' }}>
                                        {g}{!exists ? ' ✗' : ''}
                                      </span>
                                    );
                                  })}
                                  {hidden.length > 0 && (
                                    <span title={allTip} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#F1F5F9', color: '#475569', whiteSpace: 'nowrap', cursor: 'default' }}>
                                      +{hidden.length} more
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                        }
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: showBulkPw ? '#334155' : '#94A3B8', letterSpacing: showBulkPw ? 0 : 2, ...textOp }}>
                        {row.password
                          ? (showBulkPw ? row.password : '••••••')
                          : <span style={{ color: '#DC2626' }}>—</span>}
                      </td>
                      <td>
                        {row.isDbDuplicate
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#D97706', fontSize: 11.5, fontWeight: 600 }} title={row.duplicateReason}>
                              ⚠ Already in DB
                            </span>
                          : row.isDuplicate
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94A3B8', fontSize: 11.5, fontWeight: 600 }} title={row.duplicateReason}>
                              ⚠ Duplicate
                            </span>
                          : row.valid
                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16A34A', fontSize: 12, fontWeight: 600 }}><CheckCircle size={13} /> Valid</span>
                            : <span style={{ color: '#DC2626', fontSize: 11.5 }} title={row.errors.join('\n')}>
                                <AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1} more` : ''}
                              </span>
                        }
                      </td>
                    </tr>
                    );
                  })}
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

            {/* Password input — hidden while creating */}
            {!bulkCreating && (
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
            )}

            {/* Progress bar — shown while creating */}
            {bulkCreating && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                    Creating users…
                  </span>
                  <span style={{ fontSize: 12.5, color: '#64748B' }}>
                    {bulkDoneCount} / {validCount}
                  </span>
                </div>
                <div style={{ width: '100%', height: 10, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${bulkProgress}%`,
                    background: 'linear-gradient(90deg, #E85D04, #FF8C42)',
                    borderRadius: 99,
                    transition: 'width 0.15s ease',
                  }} />
                </div>
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
                  Please wait, do not close this window
                </p>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" disabled={bulkCreating} onClick={() => { setBulkPwModal(false); setAdminPw(''); }}>Cancel</button>
              <button
                className="btn-save"
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', fontSize: 13.5, cursor: bulkCreating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: bulkCreating ? 0.8 : 1 }}
                disabled={bulkCreating || !adminPw.trim()}
                onClick={handleBulkCreate}
              >
                {bulkCreating ? `${bulkProgress}%` : `Create ${validCount} User${validCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────── */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: 16, width: '94vw', maxWidth: 560,
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'visible',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#E85D04,#FF8C42)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                  {(editTarget.full_name || editTarget.username || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{editTarget.full_name || editTarget.username}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748B' }}>{editTarget.email}</p>
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6, flexShrink: 0 }}
                onClick={() => setEditTarget(null)}><X size={18} /></button>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Row: Role + Status side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Role</label>
                  <RoleSelect value={editRole} onChange={setEditRole} disabled={currentUser?.id === editTarget.id} />
                  {currentUser?.id === editTarget.id && <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#94A3B8' }}>Cannot change your own role</p>}
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Status</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[true, false].map(val => (
                      <button key={String(val)} onClick={() => setEditActive(val)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${editActive === val ? (val ? '#16a34a' : '#dc2626') : '#e2e8f0'}`, background: editActive === val ? (val ? '#f0fdf4' : '#fff1f2') : 'white', color: editActive === val ? (val ? '#16a34a' : '#dc2626') : '#64748b', fontWeight: editActive === val ? 600 : 400, fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}>
                        {val ? 'Active' : 'Inactive'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid #F1F5F9' }} />

              {/* Password */}
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  New Password <span style={{ fontWeight: 400, color: '#94A3B8', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>(leave blank to keep current)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input type={showEditPw ? 'text' : 'password'} placeholder="Min. 6 characters" value={editPw} onChange={e => setEditPw(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 40px 10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: '#0d1b2a' }} />
                  <button type="button" onClick={() => setShowEditPw(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
                    {showEditPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Groups — opens upward */}
              {allGroups.length > 0 && (
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Groups</label>
                  <GroupMultiSelect
                    allGroups={allGroups}
                    selectedIds={editGroupIds}
                    onChange={setEditGroupIds}
                    direction="up"
                  />
                </div>
              )}

              {/* Divider */}
              <div style={{ borderTop: '1px solid #F1F5F9' }} />

              {/* MFA Section */}
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Multi-Factor Authentication
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                  {/* MFA Required toggle */}
                  <div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 6, fontWeight: 500 }}>REQUIRE MFA</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[true, false].map(val => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => setEditMfaRequired(val)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: `1.5px solid ${editMfaRequired === val ? (val ? '#E85D04' : '#64748b') : '#e2e8f0'}`, background: editMfaRequired === val ? (val ? '#fff7f0' : '#f8fafc') : 'white', color: editMfaRequired === val ? (val ? '#E85D04' : '#334155') : '#64748b', fontWeight: editMfaRequired === val ? 600 : 400, fontSize: 12.5, cursor: 'pointer', transition: 'all .15s' }}
                        >
                          {val ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* MFA Status */}
                  <div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 6, fontWeight: 500 }}>AUTHENTICATOR STATUS</div>
                    <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>
                      {editTarget?.mfa_enabled
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#16A34A' }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="#DCFCE7"/><path d="M4 7l2 2 4-4" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            Configured
                          </span>
                        : <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#94A3B8' }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="#F1F5F9"/><path d="M7 4v4M7 10v.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            Not set up
                          </span>
                      }
                    </div>
                  </div>
                </div>
                {/* Reset MFA button — only if configured */}
                {editTarget?.mfa_enabled && (
                  <button
                    type="button"
                    disabled={resettingMfa}
                    onClick={handleResetMfa}
                    style={{ padding: '8px 16px', borderRadius: 7, border: '1.5px solid #FECACA', background: '#FFF1F2', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: resettingMfa ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: resettingMfa ? 0.7 : 1, transition: 'all .15s' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    {resettingMfa ? 'Resetting…' : 'Reset MFA (force re-enroll)'}
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 26px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-cancel" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn-save" disabled={saving}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}
                onClick={handleSaveEdit}>
                {saving ? 'Saving…' : 'Save Changes'}
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
                  {deleteTickets ? 'Tickets will be removed from all views.' : 'Tickets stay visible in Tickets by User.'}
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
