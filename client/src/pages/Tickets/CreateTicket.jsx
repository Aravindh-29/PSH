import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Upload, X, Paperclip, Download } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import SearchSelect from '../../components/SearchSelect';
import toast from 'react-hot-toast';
import './TicketDetail.css';
import './IncidentPage.css';

const SYSTEM_KEYS = ['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description','assignment_group'];
const parseOpts = (opts) => {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === 'string') { try { return JSON.parse(opts); } catch { return []; } }
  return [];
};
const PRIORITIES    = ['LOW','MEDIUM','HIGH','CRITICAL'];
const IMPACTS       = ['LOW','MEDIUM','HIGH'];
const URGENCIES     = ['LOW','MEDIUM','HIGH'];
const CLASSIFICATIONS = ['','Software','Hardware','Network','Access','Configuration','Other'];

const MODULE_DEFAULTS = [
  { value: 'FlashArray',              label: 'FlashArray' },
  { value: 'FlashBlade',              label: 'FlashBlade' },
  { value: 'Pure Cloud Block Store',  label: 'Pure Cloud Block Store' },
  { value: 'Evergreen//One',          label: 'Evergreen//One' },
  { value: 'ActiveCluster',           label: 'ActiveCluster' },
  { value: 'Portworx',                label: 'Portworx' },
  { value: 'General',                 label: 'General' },
];

const ASSIGN_GROUP_DEFAULTS = [
  { value: 'Storage Team',       label: 'Storage Team' },
  { value: 'Network Team',       label: 'Network Team' },
  { value: 'Cloud Team',         label: 'Cloud Team' },
  { value: 'Hardware Support',   label: 'Hardware Support' },
  { value: 'Software Support',   label: 'Software Support' },
  { value: 'Access Management',  label: 'Access Management' },
  { value: 'DevOps Team',        label: 'DevOps Team' },
  { value: 'Security Team',      label: 'Security Team' },
  { value: 'L1 Support',         label: 'L1 Support' },
  { value: 'L2 Support',         label: 'L2 Support' },
  { value: 'L3 Support',         label: 'L3 Support' },
];

export default function CreateTicket() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { refetch: refetchNotifications } = useNotifications();
  const isAdmin = user?.role === 'admin';

  const [fields, setFields]             = useState([]);
  const [categories, setCategories]     = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [ticketTypes, setTicketTypes]   = useState([]);
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [attachOpen, setAttachOpen]     = useState(false);
  const [nextNumber, setNextNumber]     = useState('');
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
      api.get('/tickets/next-number'),
    ]).then(([f, c, tt, u, nn]) => {
      setFields(f.data.fields || []);
      setAllCategories(c.data.categories || []);
      setCategories(c.data.categories || []);
      setTicketTypes(tt.data.types || []);
      setUsers(u.data.users || []);
      setNextNumber(nn.data.number || '');
    }).catch(() => {});
  }, [location.key]); // re-fetch on every navigation to this page so config changes reflect immediately

  useEffect(() => {
    if (!form.typeId) {
      setCategories(allCategories);
    } else {
      const filtered = allCategories.filter(c => !c.type_id || c.type_id === form.typeId);
      setCategories(filtered);
      // Only clear categoryId if the selected one is no longer valid for this type
      setForm(p => {
        if (p.categoryId && !filtered.find(c => String(c.id) === String(p.categoryId))) {
          return { ...p, categoryId: '' };
        }
        return p;
      });
    }
  }, [form.typeId, allCategories]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...files.filter(f => !prev.find(p => p.name === f.name))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const validate = () => {
    if (!form.customerName || !form.moduleText || !form.categoryId || !form.shortDescription || !form.description) {
      toast.error('Please fill in all required fields'); return false;
    }
    const customRequired = fields.filter(f => !SYSTEM_KEYS.includes(f.field_key) && f.is_required);
    for (const f of customRequired) {
      if (!customData[f.field_key]) { toast.error(`"${f.label}" is required`); return false; }
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
        assignedTo: form.assignedTo || undefined,
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
          toast.success(`Ticket ${ticket_number} created with ${pendingFiles.length} file(s)!`);
        } catch {
          toast.success(`Ticket ${ticket_number} created!`);
          toast.error('Some attachments failed — retry from ticket view.');
        }
        setTimeout(() => navigate(`/tickets/${ticketId}`), 1200);
      } else {
        toast.success(`Ticket ${ticket_number} created!`);
        navigate(`/tickets/${ticketId}`);
      }
      refetchNotifications();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create ticket');
      setLoading(false);
    }
  };

  const customFields = fields.filter(f => !SYSTEM_KEYS.includes(f.field_key));
  const fieldByKey   = Object.fromEntries(fields.map(f => [f.field_key, f]));

  const priorityOpts    = parseOpts(fieldByKey['priority']?.options).length  > 0 ? parseOpts(fieldByKey['priority']?.options)  : PRIORITIES.map(p => ({ value: p, label: p }));
  const impactOpts      = parseOpts(fieldByKey['impact']?.options).length    > 0 ? parseOpts(fieldByKey['impact']?.options)    : IMPACTS.map(v => ({ value: v, label: v }));
  const urgencyOpts     = parseOpts(fieldByKey['urgency']?.options).length   > 0 ? parseOpts(fieldByKey['urgency']?.options)   : URGENCIES.map(v => ({ value: v, label: v }));
  const customerOpts    = parseOpts(fieldByKey['customer_name']?.options);
  const moduleOpts      = parseOpts(fieldByKey['module_text']?.options).length
    ? parseOpts(fieldByKey['module_text'].options) : MODULE_DEFAULTS;
  const assignGroupOpts = parseOpts(fieldByKey['assignment_group']?.options).length
    ? parseOpts(fieldByKey['assignment_group']?.options) : ASSIGN_GROUP_DEFAULTS;

  const userOpts = users.map(u => ({ value: String(u.id), label: u.full_name }));

  const categoryOpts = categories.map(c => ({ value: String(c.id), label: c.name }));
  const typeOpts     = ticketTypes.map(t => ({ value: String(t.id), label: t.name }));
  const classOpts    = CLASSIFICATIONS.filter(Boolean).map(c => ({ value: c, label: c }));

  const customTriples = [];
  for (let i = 0; i < customFields.length; i += 3) {
    customTriples.push([customFields[i], customFields[i+1] || null, customFields[i+2] || null]);
  }

  const renderCustomInput = (f) => {
    const opts = parseOpts(f.options);
    const val  = customData[f.field_key] || '';
    const setVal = v => setCustomData(p => ({ ...p, [f.field_key]: v }));
    if (f.field_type === 'dropdown') return (
      <select value={val} onChange={e => setVal(e.target.value)}>
        <option value="">Select…</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    if (f.field_type === 'textarea') return (
      <textarea value={val} onChange={e => setVal(e.target.value)} rows={3} placeholder={f.placeholder} style={{ minHeight: 60 }} />
    );
    return <input type={f.field_type === 'number' ? 'number' : 'text'} value={val} onChange={e => setVal(e.target.value)} placeholder={f.placeholder} />;
  };

  const isUploading = loading && uploadProgress.length > 0;
  const btnLabel = isUploading
    ? `Uploading ${uploadProgress.filter(q => q.status === 'done').length}/${uploadProgress.length}...`
    : loading ? 'Creating...' : 'Create Ticket';

  const fmtSize = (n) => n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  return (
    <div className="ip-page">

      {/* ── Header ── */}
      <div className="ip-header">
        <div className="ip-header-left">
          <div className="ip-breadcrumb">New Incident</div>
          <div className="ip-title-row">
            <h1 className="ip-title">New Incident</h1>
            {nextNumber && <span className="ip-ticket-num-preview">{nextNumber}</span>}
          </div>
        </div>
        <div className="ip-header-actions">
          <button type="button" className="ip-btn" onClick={() => setAttachOpen(true)}>
            <Paperclip size={14} />
            Attachments
            {pendingFiles.length > 0 && <span className="ip-attach-count-badge">{pendingFiles.length}</span>}
          </button>
          <button type="button" className="ip-btn" onClick={() => navigate(-1)} disabled={loading}>Cancel</button>
          <button type="button" className="ip-btn ip-btn-primary" disabled={loading} onClick={handleSubmit}>{btnLabel}</button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="ip-body">

          {/* INCIDENT DETAILS */}
          <div className="ip-section">
            <div className="ip-section-bar"><span>Incident Details</span></div>
            <div className="ip-fields">
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['customer_name']?.label || 'Customer'}{fieldByKey['customer_name']?.is_required && <span className="ip-req"> *</span>}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.customerName}
                      onChange={v => set('customerName', v)}
                      options={customerOpts}
                      placeholder="e.g. TechCorp Inc."
                      allowFreeText
                    />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">State</span>
                  <span className="ip-vc ip-input-cell">
                    <input readOnly value="NEW — auto assigned" />
                  </span>
                </div>
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['module_text']?.label || 'Module'}{fieldByKey['module_text']?.is_required && <span className="ip-req"> *</span>}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.moduleText}
                      onChange={v => set('moduleText', v)}
                      options={moduleOpts}
                      placeholder="Select module"
                      allowFreeText
                    />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['priority']?.label || 'Priority'}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.priority}
                      onChange={v => set('priority', v)}
                      options={priorityOpts}
                      placeholder="Select priority"
                    />
                  </span>
                </div>
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['category_id']?.label || 'Category'}{fieldByKey['category_id']?.is_required && <span className="ip-req"> *</span>}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.categoryId}
                      onChange={v => set('categoryId', v)}
                      options={categoryOpts}
                      placeholder="Select category"
                    />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['impact']?.label || 'Impact'}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.impact}
                      onChange={v => set('impact', v)}
                      options={impactOpts}
                      placeholder="Select impact"
                    />
                  </span>
                </div>
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">Type</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.typeId}
                      onChange={v => set('typeId', v)}
                      options={typeOpts}
                      placeholder="Select type"
                    />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['urgency']?.label || 'Urgency'}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.urgency}
                      onChange={v => set('urgency', v)}
                      options={urgencyOpts}
                      placeholder="Select urgency"
                    />
                  </span>
                </div>
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">Classification</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.classification}
                      onChange={v => set('classification', v)}
                      options={classOpts}
                      placeholder="Select…"
                    />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['assignment_group']?.label || 'Assignment Group'}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.assignmentGroup}
                      onChange={v => set('assignmentGroup', v)}
                      options={assignGroupOpts}
                      placeholder="Select group"
                      searchPlaceholder="Search group..."
                    />
                  </span>
                </div>
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">Created By</span>
                  <span className="ip-vc ip-input-cell">
                    <input readOnly value={user?.fullName || user?.username || ''} />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">Assign to</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.assignedTo}
                      onChange={v => set('assignedTo', v)}
                      options={[{ value: '', label: 'Unassigned' }, ...userOpts]}
                      placeholder="Unassigned"
                      searchPlaceholder="Search user..."
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ADDITIONAL FIELDS (custom) */}
          {customFields.length > 0 && (
            <div className="ip-section">
              <div className="ip-section-bar"><span>Additional Fields</span></div>
              <div className="ip-fields ip-fields-3col">
                {customTriples.map((triple, ri) => (
                  <div className="ip-row" key={`cf-${ri}`}>
                    {triple.map((f, fi) => f ? (
                      <div className="ip-pair" key={fi}>
                        <span className="ip-lc">{f.label}{f.is_required && <span className="ip-req"> *</span>}</span>
                        <span className="ip-vc ip-input-cell">{renderCustomInput(f)}</span>
                      </div>
                    ) : <div className="ip-pair" key={fi} />)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SHORT DESCRIPTION */}
          <div className="ip-section">
            <div className="ip-section-bar">
              <span>Short Description{fieldByKey['short_description']?.is_required && <span className="ip-req"> *</span>}</span>
            </div>
            <input
              className="ip-standalone-input"
              value={form.shortDescription}
              onChange={e => set('shortDescription', e.target.value)}
              maxLength={500}
              placeholder="Brief summary of the issue"
            />
          </div>

          {/* FULL DESCRIPTION */}
          <div className="ip-section">
            <div className="ip-section-bar">
              <span>Full Description{fieldByKey['description']?.is_required && <span className="ip-req"> *</span>}</span>
            </div>
            <textarea
              className="ip-standalone-textarea"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={6}
              placeholder="Provide full details of the issue..."
            />
          </div>

          {/* ACTION BAR */}
          <div className="ip-action-bar">
            <button type="button" className="ip-btn" onClick={() => navigate(-1)} disabled={loading}>Cancel</button>
            <button type="submit" className="ip-btn ip-btn-primary" disabled={loading}>{btnLabel}</button>
          </div>

        </div>
      </form>

      {/* ATTACHMENT POPUP */}
      {attachOpen && (
        <div className="attach-popup-overlay" onClick={() => setAttachOpen(false)}>
          <div className="attach-popup" onClick={e => e.stopPropagation()}>
            <div className="attach-popup-header">
              <span className="attach-popup-title">
                Attachments {pendingFiles.length > 0 && `(${pendingFiles.length} pending)`}
              </span>
              <div className="attach-popup-actions">
                <label className="ip-btn" style={{ cursor: 'pointer', fontSize: 12, padding: '6px 12px' }}>
                  <Upload size={13} /> Upload
                  <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} disabled={loading} />
                </label>
                <button className="ip-btn-icon" onClick={() => setAttachOpen(false)} title="Close"><X size={14} /></button>
              </div>
            </div>

            {uploadProgress.length > 0 && (
              <div className="attach-popup-queue">
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

            <div className="attach-popup-body">
              {pendingFiles.length === 0 && uploadProgress.length === 0 && (
                <div className="attach-popup-empty">
                  <Paperclip size={24} strokeWidth={1.5} />
                  <span>No files selected yet.</span>
                  <span style={{ fontSize: 12 }}>Click Upload to attach files to this ticket.</span>
                </div>
              )}
              {pendingFiles.map((f, i) => (
                <div key={i} className="attach-popup-item attach-popup-pending">
                  <div className="attach-popup-icon">📎</div>
                  <div className="attach-popup-info">
                    <div className="attach-popup-name">{f.name}</div>
                    <div className="attach-popup-meta">{fmtSize(f.size || 0)} · Pending upload</div>
                  </div>
                  <div className="attach-popup-item-actions">
                    <button className="ip-btn-icon danger" onClick={() => removePending(i)} title="Remove"><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
