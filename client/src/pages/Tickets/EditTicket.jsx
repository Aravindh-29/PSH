import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Download, X, Paperclip } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { fmt } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import './TicketForm.css';

const STATUSES   = ['NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];
const IMPACTS    = ['LOW','MEDIUM','HIGH'];
const URGENCIES  = ['LOW','MEDIUM','HIGH'];

export default function EditTicket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [categories, setCategories]   = useState([]);
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [form, setForm]               = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get(`/tickets/${id}`),
      api.get('/config/categories'),
      api.get('/config/users'),
    ]).then(([t, c, u]) => {
      const ticket = t.data.ticket;
      setForm({
        customerName:  ticket.customer_name  || '',
        moduleText:    ticket.module_name    || '',
        categoryId:    ticket.category_id    || '',
        shortDescription: ticket.short_description || '',
        description:   ticket.description   || '',
        status:        ticket.status        || 'NEW',
        priority:      ticket.priority      || 'MEDIUM',
        impact:        ticket.impact        || 'MEDIUM',
        urgency:       ticket.urgency       || 'MEDIUM',
        ticketOwner:   ticket.ticket_owner  || null,
        ticketOwnerName: ticket.ticket_owner_name || '',
      });
      setAttachments(t.data.attachments || []);
      setCategories(c.data.categories);
      setUsers(u.data.users);
    }).catch(() => toast.error('Failed to load ticket'));
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/tickets/${id}`, form);
      toast.success('Ticket updated');
      navigate(`/tickets/${id}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const queue = files.map((f, i) => ({ id: i, name: f.name, progress: 0, status: 'uploading' }));
    setUploadQueue(queue);
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));

    try {
      const res = await api.post(`/tickets/${id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.round((evt.loaded * 100) / evt.total);
            setUploadQueue(prev => prev.map(q => ({ ...q, progress: pct, status: pct < 100 ? 'uploading' : 'processing' })));
          }
        },
      });
      const errors   = res.data.errors || [];
      const uploaded = res.data.attachments || [];
      setUploadQueue(prev => prev.map(q => {
        const hasError = errors.find(e => e.startsWith(q.name));
        return { ...q, progress: 100, status: hasError ? 'error' : 'done' };
      }));
      if (errors.length) errors.forEach(e => toast.error(e));
      if (uploaded.length) {
        toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);
        // Refresh attachments list without full reload
        const fresh = await api.get(`/tickets/${id}`);
        setAttachments(fresh.data.attachments || []);
      }
    } catch (err) {
      setUploadQueue(prev => prev.map(q => ({ ...q, status: 'error' })));
      toast.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setTimeout(() => setUploadQueue([]), 3000);
    }
  };

  const handleDeleteAttachment = async (attId) => {
    try {
      await api.delete(`/attachments/${attId}`);
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(a => a.id !== attId));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  if (!form) return <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>;

  return (
    <div className="ticket-form-page">
      <div className="tf-header">
        <h1>Edit Ticket</h1>
        <p>Update ticket details below.</p>
      </div>

      <form onSubmit={handleSubmit} className="tf-form">
        {/* ── Basic Information ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Basic Information</h2>
          <div className="tf-grid">
            <div className="form-group">
              <label>Customer / Client <span className="req">*</span></label>
              <input type="text" value={form.customerName} onChange={e => set('customerName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Module</label>
              <input type="text" value={form.moduleText} onChange={e => set('moduleText', e.target.value)} placeholder="e.g. Cloud, Storage, Network" />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
                <option value="">Select</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
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
            {isAdmin ? (
              <div className="form-group">
                <label>Ticket Owner</label>
                <select value={form.ticketOwner || ''} onChange={e => set('ticketOwner', e.target.value)}>
                  <option value="">Select owner</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Ticket Owner</label>
                <div className="tf-readonly-field">{form.ticketOwnerName || 'Not assigned'}</div>
              </div>
            )}
          </div>
          <div className="form-group full">
            <label>Short Description <span className="req">*</span></label>
            <input type="text" value={form.shortDescription} onChange={e => set('shortDescription', e.target.value)} maxLength={500} />
          </div>
          <div className="form-group full">
            <label>Detailed Description <span className="req">*</span></label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={6} />
          </div>
        </div>

        {/* ── Attachments ── */}
        <div className="tf-card">
          <div className="tf-attach-header">
            <h2 className="tf-section-title" style={{ marginBottom: 0 }}>
              Attachments
              {attachments.length > 0 && <span className="tf-attach-count">{attachments.length}</span>}
            </h2>
            <label className="tf-attach-btn">
              <Upload size={13} /> Upload Files
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
            </label>
          </div>

          {/* Upload progress */}
          {uploadQueue.length > 0 && (
            <div className="upload-queue" style={{ marginBottom: 12 }}>
              {uploadQueue.map(item => (
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

          {attachments.length === 0 && uploadQueue.length === 0 && (
            <div className="tf-attach-empty">
              <Paperclip size={20} strokeWidth={1.5} />
              <p>No attachments yet. Click "Upload Files" to add files.</p>
            </div>
          )}

          {attachments.map(att => (
            <div key={att.id} className="att-row">
              <div className="att-icon">📎</div>
              <div className="att-info">
                <div className="att-name">{att.file_name}</div>
                <div className="att-meta">{fmtBytes(att.file_size)} · {fmt(att.uploaded_at)} · {att.uploader_name}</div>
              </div>
              <a href={`/api/attachments/${att.id}/download`} className="att-btn" title="Download" target="_blank" rel="noreferrer">
                <Download size={13} />
              </a>
              {(isAdmin || att.uploaded_by === currentUser?.id) && (
                <button type="button" className="att-btn danger" onClick={() => handleDeleteAttachment(att.id)} title="Delete">
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="tf-actions">
          <button type="button" className="btn-cancel" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn-submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
}
