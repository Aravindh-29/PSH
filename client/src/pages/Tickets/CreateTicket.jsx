import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Paperclip } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './TicketForm.css';

const STATUSES   = ['NEW','OPEN','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];
const IMPACTS    = ['LOW','MEDIUM','HIGH'];
const URGENCIES  = ['LOW','MEDIUM','HIGH'];

export default function CreateTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState([]);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    customerName: '', moduleText: '', categoryId: '', shortDescription: '',
    description: '', status: 'NEW', priority: 'MEDIUM', impact: 'MEDIUM', urgency: 'MEDIUM',
  });

  useEffect(() => {
    api.get('/config/categories').then(c => setCategories(c.data.categories));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...files.filter(f => !prev.find(p => p.name === f.name))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customerName || !form.moduleText || !form.categoryId || !form.shortDescription || !form.description) {
      toast.error('Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/tickets', form);
      const { id: ticketId, ticket_number } = res.data.ticket;

      if (pendingFiles.length > 0) {
        const initQ = pendingFiles.map((f, i) => ({ id: i, name: f.name, progress: 0, status: 'uploading' }));
        setUploadProgress(initQ);
        const fd = new FormData();
        pendingFiles.forEach(f => fd.append('files', f));
        try {
          await api.post(`/tickets/${ticketId}/attachments`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (evt) => {
              if (evt.total) {
                const pct = Math.round((evt.loaded * 100) / evt.total);
                setUploadProgress(prev => prev.map(q => ({ ...q, progress: pct, status: pct < 100 ? 'uploading' : 'processing' })));
              }
            },
          });
          setUploadProgress(prev => prev.map(q => ({ ...q, progress: 100, status: 'done' })));
          toast.success(`Ticket ${ticket_number} created with ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}!`);
        } catch {
          toast.success(`Ticket ${ticket_number} created!`);
          toast.error('Some attachments failed to upload — you can retry from the ticket view.');
        }
        setTimeout(() => navigate(`/tickets/${ticketId}`), 1200);
      } else {
        toast.success(`Ticket ${ticket_number} created!`);
        navigate(`/tickets/${ticketId}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create ticket');
      setLoading(false);
    }
  };

  const isUploading = loading && uploadProgress.length > 0;
  const btnLabel    = isUploading ? `Uploading ${uploadProgress.filter(q => q.status === 'done').length}/${uploadProgress.length}...`
                    : loading    ? 'Creating...'
                    : 'Create Ticket';

  return (
    <div className="ticket-form-page">
      <div className="tf-header">
        <h1>Create New Ticket</h1>
        <p>Fill in the details below to submit a new support ticket.</p>
      </div>

      <form onSubmit={handleSubmit} className="tf-form">
        {/* ── Basic Information ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Basic Information</h2>
          <div className="tf-grid">
            <div className="form-group">
              <label>Customer / Client <span className="req">*</span></label>
              <input type="text" value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="e.g. TechCorp Inc." />
            </div>
            <div className="form-group">
              <label>Module <span className="req">*</span></label>
              <input type="text" value={form.moduleText} onChange={e => set('moduleText', e.target.value)} placeholder="e.g. Cloud, Storage, Network" />
            </div>
            <div className="form-group">
              <label>Category <span className="req">*</span></label>
              <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status <span className="req">*</span></label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Priority <span className="req">*</span></label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Impact</label>
              <select value={form.impact} onChange={e => set('impact', e.target.value)}>
                {IMPACTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Urgency</label>
              <select value={form.urgency} onChange={e => set('urgency', e.target.value)}>
                {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group full">
            <label>Short Description <span className="req">*</span></label>
            <input type="text" value={form.shortDescription} onChange={e => set('shortDescription', e.target.value)} placeholder="Brief summary of the issue" maxLength={500} />
          </div>
          <div className="form-group full">
            <label>Detailed Description <span className="req">*</span></label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={6} placeholder="Provide full details of the issue, steps to reproduce, impact..." />
          </div>
        </div>

        {/* ── Attachments ── */}
        <div className="tf-card">
          <div className="tf-attach-header">
            <h2 className="tf-section-title" style={{ marginBottom: 0 }}>Attachments <span className="tf-optional">(optional)</span></h2>
            <label className="tf-attach-btn">
              <Upload size={13} /> Add Files
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} disabled={loading} />
            </label>
          </div>

          {pendingFiles.length === 0 && uploadProgress.length === 0 && (
            <div className="tf-attach-empty">
              <Paperclip size={20} strokeWidth={1.5} />
              <p>No files selected. Click "Add Files" to attach screenshots, logs, or documents.</p>
            </div>
          )}

          {/* Pending files list (before upload) */}
          {pendingFiles.length > 0 && uploadProgress.length === 0 && (
            <div className="tf-attach-list">
              {pendingFiles.map((f, i) => (
                <div key={i} className="tf-attach-row">
                  <span className="att-icon">📎</span>
                  <div className="tf-attach-info">
                    <span className="tf-attach-name">{f.name}</span>
                    <span className="tf-attach-size">{fmtBytes(f.size)}</span>
                  </div>
                  <button type="button" className="tf-attach-remove" onClick={() => removePending(i)} disabled={loading}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload progress (after submit) */}
          {uploadProgress.length > 0 && (
            <div className="upload-queue">
              {uploadProgress.map(item => (
                <div key={item.id} className={`upload-item upload-${item.status}`}>
                  <div className="upload-item-name">
                    <span className="upload-icon">{item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : '↑'}</span>
                    <span>{item.name}</span>
                  </div>
                  <div className="upload-bar-wrap"><div className="upload-bar" style={{ width: `${item.progress}%` }} /></div>
                  <span className="upload-pct">{item.status === 'done' ? 'Done' : item.status === 'error' ? 'Failed' : `${item.progress}%`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Ownership ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Ownership</h2>
          <div className="tf-owner-info">
            <div className="tf-owner-avatar">{(user?.fullName || user?.username || 'U')[0].toUpperCase()}</div>
            <div>
              <p className="tf-owner-label">Ticket Owner</p>
              <p className="tf-owner-name">{user?.fullName || user?.username}</p>
              <p className="tf-owner-note">You are automatically set as the owner of this ticket.</p>
            </div>
          </div>
        </div>

        <div className="tf-actions">
          <button type="button" className="btn-cancel" onClick={() => navigate(-1)} disabled={loading}>Cancel</button>
          <button type="submit" className="btn-submit" disabled={loading}>{btnLabel}</button>
        </div>
      </form>
    </div>
  );
}
