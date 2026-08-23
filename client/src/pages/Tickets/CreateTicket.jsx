import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Paperclip } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import './TicketForm.css';

const CLASSIFICATIONS = [
  { value: '', label: 'Select classification' },
  { value: 'Software', label: 'Software' },
  { value: 'Hardware', label: 'Hardware' },
  { value: 'Network', label: 'Network' },
  { value: 'Access', label: 'Access / Permissions' },
  { value: 'Configuration', label: 'Configuration' },
  { value: 'Other', label: 'Other' },
];

// System field keys rendered with fixed positions in the Basic Information grid
const SYSTEM_KEYS = ['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description'];

const parseOpts = (opts) => {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === 'string') { try { return JSON.parse(opts); } catch { return []; } }
  return [];
};

function renderSystemField(f, form, setForm, categories) {
  const key = f.field_key;
  const label = <label>{f.label}{f.is_required && <span className="req"> *</span>}</label>;
  const opts = parseOpts(f.options);

  if (key === 'customer_name') return (
    <div className="form-group">
      {label}
      <input type="text" value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} placeholder={f.placeholder || 'e.g. TechCorp Inc.'} />
    </div>
  );
  if (key === 'module_text') return (
    <div className="form-group">
      {label}
      <input type="text" value={form.moduleText} onChange={e => setForm(p => ({ ...p, moduleText: e.target.value }))} placeholder={f.placeholder || 'e.g. Cloud, Storage, Network'} />
    </div>
  );
  if (key === 'category_id') return (
    <div className="form-group">
      {label}
      <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
        <option value="">Select category</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
  if (key === 'status') return (
    <div className="form-group">
      {label}
      <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'priority') return (
    <div className="form-group">
      {label}
      <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'impact') return (
    <div className="form-group">
      {label}
      <select value={form.impact} onChange={e => setForm(p => ({ ...p, impact: e.target.value }))}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'urgency') return (
    <div className="form-group">
      {label}
      <select value={form.urgency} onChange={e => setForm(p => ({ ...p, urgency: e.target.value }))}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (key === 'short_description') return (
    <div className="form-group full">
      {label}
      <input type="text" value={form.shortDescription} onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))} placeholder={f.placeholder || 'Brief summary of the issue'} maxLength={500} />
    </div>
  );
  if (key === 'description') return (
    <div className="form-group full">
      {label}
      <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={6} placeholder={f.placeholder || 'Provide full details of the issue...'} />
    </div>
  );
  return null;
}

function renderCustomField(f, customData, setCustomData) {
  const opts = parseOpts(f.options);
  const val = customData[f.field_key] || '';
  const set = v => setCustomData(p => ({ ...p, [f.field_key]: v }));
  const label = <label>{f.label}{f.is_required && <span className="req"> *</span>}</label>;

  if (f.field_type === 'textarea') return (
    <div key={f.field_key} className="form-group full">
      {label}
      <textarea value={val} onChange={e => set(e.target.value)} rows={4} placeholder={f.placeholder} />
    </div>
  );
  if (f.field_type === 'dropdown') return (
    <div key={f.field_key} className="form-group">
      {label}
      <select value={val} onChange={e => set(e.target.value)}>
        <option value="">Select…</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (f.field_type === 'number') return (
    <div key={f.field_key} className="form-group">
      {label}
      <input type="number" value={val} onChange={e => set(e.target.value)} placeholder={f.placeholder} />
    </div>
  );
  return (
    <div key={f.field_key} className="form-group">
      {label}
      <input type="text" value={val} onChange={e => set(e.target.value)} placeholder={f.placeholder} />
    </div>
  );
}

export default function CreateTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [fields, setFields]           = useState([]);
  const [categories, setCategories]   = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState([]);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    customerName: '', moduleText: '', categoryId: '', shortDescription: '',
    description: '', priority: 'MEDIUM', impact: 'MEDIUM', urgency: 'MEDIUM',
    typeId: '', classification: '', assignedTo: '', assignmentGroup: '',
  });
  const [customData, setCustomData] = useState({});

  useEffect(() => {
    Promise.all([
      api.get('/config/fields'),
      api.get('/config/categories'),
      api.get('/config/ticket-types'),
      api.get('/config/users'),
    ]).then(([f, c, tt, u]) => {
      setFields(f.data.fields || []);
      setAllCategories(c.data.categories || []);
      setCategories(c.data.categories || []);
      setTicketTypes(tt.data.types || []);
      setUsers(u.data.users || []);
    }).catch(() => {});
  }, []);

  // Filter categories by selected type
  useEffect(() => {
    if (!form.typeId) {
      setCategories(allCategories);
    } else {
      setCategories(allCategories.filter(c => !c.type_id || c.type_id === form.typeId));
    }
    setForm(p => ({ ...p, categoryId: '' }));
  }, [form.typeId, allCategories]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...files.filter(f => !prev.find(p => p.name === f.name))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  const validate = () => {
    if (!form.customerName || !form.moduleText || !form.categoryId || !form.shortDescription || !form.description) {
      toast.error('Please fill in all required fields');
      return false;
    }
    // Validate required custom fields
    const customFields = fields.filter(f => !SYSTEM_KEYS.includes(f.field_key) && f.is_required);
    for (const f of customFields) {
      if (!customData[f.field_key]) {
        toast.error(`"${f.label}" is required`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        typeId: form.typeId || undefined,
        classification: form.classification || undefined,
        assignedTo: isAdmin && form.assignedTo ? form.assignedTo : undefined,
        assignmentGroup: form.assignmentGroup || undefined,
        customData,
      };
      const res = await api.post('/tickets', payload);
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

  const customFields = fields.filter(f => !SYSTEM_KEYS.includes(f.field_key));
  const fieldByKey = Object.fromEntries(fields.map(f => [f.field_key, f]));

  const isUploading = loading && uploadProgress.length > 0;
  const btnLabel    = isUploading ? `Uploading ${uploadProgress.filter(q => q.status === 'done').length}/${uploadProgress.length}...`
                    : loading    ? 'Creating...'
                    : 'Create Ticket';

  return (
    <div className="ticket-form-page">
      <div className="tf-header">
        <h1>New Incident</h1>
        <p>Fill in the details below to submit a new support ticket.</p>
      </div>

      <form onSubmit={handleSubmit} className="tf-form">

        {/* ── Contact Information ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Contact Information</h2>
          <div className="tf-grid">
            {fieldByKey['customer_name'] && renderSystemField(fieldByKey['customer_name'], form, setForm, categories)}
            {fieldByKey['module_text'] && renderSystemField(fieldByKey['module_text'], form, setForm, categories)}
            <div className="form-group">
              <label>Reported By</label>
              <div className="tf-readonly-field">{user?.fullName || user?.username}</div>
            </div>
          </div>
        </div>

        {/* ── Incident Details ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Incident Details</h2>
          <div className="tf-grid">
            {fieldByKey['priority'] && renderSystemField(fieldByKey['priority'], form, setForm, categories)}
            {fieldByKey['impact'] && renderSystemField(fieldByKey['impact'], form, setForm, categories)}
            {fieldByKey['urgency'] && renderSystemField(fieldByKey['urgency'], form, setForm, categories)}
            {ticketTypes.length > 0 && (
              <div className="form-group">
                <label>Type</label>
                <select value={form.typeId} onChange={e => setForm(p => ({ ...p, typeId: e.target.value }))}>
                  <option value="">Select type</option>
                  {ticketTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {fieldByKey['category_id'] && renderSystemField(fieldByKey['category_id'], form, setForm, categories)}
            <div className="form-group">
              <label>Classification</label>
              <select value={form.classification} onChange={e => setForm(p => ({ ...p, classification: e.target.value }))}>
                {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Assignment ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Assignment</h2>
          <div className="tf-grid">
            <div className="form-group">
              <label>Assignment Group</label>
              <input type="text" value={form.assignmentGroup} onChange={e => setForm(p => ({ ...p, assignmentGroup: e.target.value }))} placeholder="e.g. Storage Team, Network Ops" />
            </div>
            <div className="form-group">
              <label>Assigned To</label>
              {isAdmin ? (
                <select value={form.assignedTo} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              ) : (
                <div className="tf-readonly-field">{user?.fullName || user?.username || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Additional Information (custom fields) ── */}
        {customFields.length > 0 && (
          <div className="tf-card">
            <h2 className="tf-section-title">Additional Information</h2>
            <div className="tf-grid">
              {customFields.map(f => renderCustomField(f, customData, setCustomData))}
            </div>
          </div>
        )}

        {/* ── Description ── */}
        <div className="tf-card">
          <h2 className="tf-section-title">Description</h2>
          {fieldByKey['short_description'] && renderSystemField(fieldByKey['short_description'], form, setForm, categories)}
          <div style={{ marginTop: 14 }}>
            {fieldByKey['description'] && renderSystemField(fieldByKey['description'], form, setForm, categories)}
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

        <div className="tf-actions">
          <button type="button" className="btn-cancel" onClick={() => navigate(-1)} disabled={loading}>Cancel</button>
          <button type="submit" className="btn-submit" disabled={loading}>{btnLabel}</button>
        </div>
      </form>
    </div>
  );
}
