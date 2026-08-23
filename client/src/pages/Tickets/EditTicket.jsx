import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Download, X, Paperclip, Eye } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { fmt } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import './TicketForm.css';

const SYSTEM_KEYS = ['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description'];

const parseOpts = (opts) => {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === 'string') { try { return JSON.parse(opts); } catch { return []; } }
  return [];
};

function renderSystemField(f, form, set, categories, users, isAdmin) {
  const key = f.field_key;
  const opts = parseOpts(f.options);
  const label = <label>{f.label}{f.is_required && <span className="req"> *</span>}</label>;

  if (key === 'customer_name') return (
    <div className="form-group">{label}<input type="text" value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder={f.placeholder} /></div>
  );
  if (key === 'module_text') return (
    <div className="form-group">{label}<input type="text" value={form.moduleText} onChange={e => set('moduleText', e.target.value)} placeholder={f.placeholder || 'e.g. Cloud, Storage, Network'} /></div>
  );
  if (key === 'category_id') return (
    <div className="form-group">{label}
      <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
        <option value="">Select</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
  if (key === 'status') return (
    <div className="form-group">{label}
      <select value={form.status} onChange={e => set('status', e.target.value)}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'priority') return (
    <div className="form-group">{label}
      <select value={form.priority} onChange={e => set('priority', e.target.value)}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'impact') return (
    <div className="form-group">{label}
      <select value={form.impact} onChange={e => set('impact', e.target.value)}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'urgency') return (
    <div className="form-group">{label}
      <select value={form.urgency} onChange={e => set('urgency', e.target.value)}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'short_description') return (
    <div className="form-group full">{label}<input type="text" value={form.shortDescription} onChange={e => set('shortDescription', e.target.value)} maxLength={500} /></div>
  );
  if (key === 'description') return (
    <div className="form-group full">{label}<textarea value={form.description} onChange={e => set('description', e.target.value)} rows={6} /></div>
  );
  return null;
}

function renderCustomField(f, customData, setCustomData) {
  const opts = parseOpts(f.options);
  const val = customData[f.field_key] || '';
  const setVal = v => setCustomData(p => ({ ...p, [f.field_key]: v }));
  const label = <label>{f.label}{f.is_required && <span className="req"> *</span>}</label>;

  if (f.field_type === 'textarea') return (
    <div key={f.field_key} className="form-group full">{label}<textarea value={val} onChange={e => setVal(e.target.value)} rows={4} placeholder={f.placeholder} /></div>
  );
  if (f.field_type === 'dropdown') return (
    <div key={f.field_key} className="form-group">{label}
      <select value={val} onChange={e => setVal(e.target.value)}>
        <option value="">Select…</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (f.field_type === 'number') return (
    <div key={f.field_key} className="form-group">{label}<input type="number" value={val} onChange={e => setVal(e.target.value)} placeholder={f.placeholder} /></div>
  );
  return (
    <div key={f.field_key} className="form-group">{label}<input type="text" value={val} onChange={e => setVal(e.target.value)} placeholder={f.placeholder} /></div>
  );
}

export default function EditTicket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [fields, setFields]           = useState([]);
  const [categories, setCategories]   = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [form, setForm]               = useState(null);
  const [customData, setCustomData]   = useState({});
  const [attachments, setAttachments] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]);
  const fileInputRef = useRef(null);

  const CLASSIFICATIONS = [
    { value: '', label: 'Select classification' },
    { value: 'Software', label: 'Software' },
    { value: 'Hardware', label: 'Hardware' },
    { value: 'Network', label: 'Network' },
    { value: 'Access', label: 'Access / Permissions' },
    { value: 'Configuration', label: 'Configuration' },
    { value: 'Other', label: 'Other' },
  ];

  useEffect(() => {
    Promise.all([
      api.get(`/tickets/${id}`),
      api.get('/config/fields'),
      api.get('/config/categories'),
      api.get('/config/users'),
      api.get('/config/ticket-types'),
    ]).then(([t, f, c, u, tt]) => {
      const ticket = t.data.ticket;
      setForm({
        customerName:     ticket.customer_name       || '',
        moduleText:       ticket.module_name         || '',
        categoryId:       ticket.category_id         || '',
        shortDescription: ticket.short_description   || '',
        description:      ticket.description         || '',
        status:           ticket.status              || 'NEW',
        priority:         ticket.priority            || 'MEDIUM',
        impact:           ticket.impact              || 'MEDIUM',
        urgency:          ticket.urgency             || 'MEDIUM',
        ticketOwner:      ticket.ticket_owner        || '',
        ticketOwnerName:  ticket.ticket_owner_name   || '',
        assignedTo:       ticket.assigned_to         || '',
        typeId:           ticket.type_id             || '',
        classification:   ticket.classification      || '',
        assignmentGroup:  ticket.assignment_group    || '',
      });
      setCustomData(ticket.custom_data || {});
      setAttachments(t.data.attachments || []);
      setFields(f.data.fields || []);
      setCategories(c.data.categories || []);
      setUsers(u.data.users || []);
      setTicketTypes(tt.data.types || []);
    }).catch(() => toast.error('Failed to load ticket'));
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        typeId: form.typeId || undefined,
        classification: form.classification || undefined,
        assignmentGroup: form.assignmentGroup || undefined,
        ...(isAdmin ? { ticketOwner: form.ticketOwner || null, assignedTo: form.assignedTo || null } : {}),
        customData,
      };
      await api.put(`/tickets/${id}`, payload);
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

  const fieldByKey  = Object.fromEntries(fields.map(f => [f.field_key, f]));
  const customFields = fields.filter(f => !SYSTEM_KEYS.includes(f.field_key));
  const gridKeys = ['customer_name','module_text','category_id','status','priority','impact','urgency'];
  const fullKeys  = ['short_description','description'];

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
            {gridKeys.map(key => {
              const f = fieldByKey[key];
              if (!f) return null;
              return <React.Fragment key={key}>{renderSystemField(f, form, set, categories, users, isAdmin)}</React.Fragment>;
            })}
            {/* Assigned To (ticket_owner) */}
            {isAdmin ? (
              <div className="form-group">
                <label>Assigned To</label>
                <select value={form.ticketOwner || ''} onChange={e => set('ticketOwner', e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Assigned To</label>
                <div className="tf-readonly-field">{form.ticketOwnerName || 'Unassigned'}</div>
              </div>
            )}
            {/* Type */}
            {ticketTypes.length > 0 && (
              <div className="form-group">
                <label>Type</label>
                <select value={form.typeId || ''} onChange={e => set('typeId', e.target.value)}>
                  <option value="">Select type</option>
                  {ticketTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {/* Classification */}
            <div className="form-group">
              <label>Classification</label>
              <select value={form.classification || ''} onChange={e => set('classification', e.target.value)}>
                {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {/* Assignment Group */}
            <div className="form-group">
              <label>Assignment Group</label>
              <input type="text" value={form.assignmentGroup || ''} onChange={e => set('assignmentGroup', e.target.value)} placeholder="e.g. Storage Team, Network Ops" />
            </div>
          </div>
          {fullKeys.map(key => {
            const f = fieldByKey[key];
            if (!f) return null;
            return <React.Fragment key={key}>{renderSystemField(f, form, set, categories, users, isAdmin)}</React.Fragment>;
          })}
        </div>

        {/* ── Custom Fields ── */}
        {customFields.length > 0 && (
          <div className="tf-card">
            <h2 className="tf-section-title">Additional Information</h2>
            <div className="tf-grid">
              {customFields.map(f => renderCustomField(f, customData, setCustomData))}
            </div>
          </div>
        )}

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

          {attachments.map(att => {
            const isImage = att.mime_type?.startsWith('image/');
            const isPreviewable = isImage || att.mime_type === 'application/pdf' || att.mime_type === 'text/plain';
            return (
              <div key={att.id} className="att-row">
                {isImage
                  ? <img src={`/api/attachments/${att.id}/download?preview=true`} alt={att.file_name} className="att-thumb" />
                  : <div className="att-icon">📎</div>
                }
                <div className="att-info">
                  <div className="att-name">{att.file_name}</div>
                  <div className="att-meta">{fmtBytes(att.file_size)} · {fmt(att.uploaded_at)} · {att.uploader_name}</div>
                </div>
                {isPreviewable && (
                  <a href={`/api/attachments/${att.id}/download?preview=true`} className="att-btn" title="Preview" target="_blank" rel="noreferrer">
                    <Eye size={13} />
                  </a>
                )}
                <a href={`/api/attachments/${att.id}/download`} className="att-btn" title="Download" target="_blank" rel="noreferrer">
                  <Download size={13} />
                </a>
                {(isAdmin || att.uploaded_by === currentUser?.id) && (
                  <button type="button" className="att-btn danger" onClick={() => handleDeleteAttachment(att.id)} title="Delete">
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="tf-actions">
          <button type="button" className="btn-cancel" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn-submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
}
