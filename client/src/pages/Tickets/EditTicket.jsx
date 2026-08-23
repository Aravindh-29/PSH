import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Upload, Download, X, Eye, Trash2, Paperclip } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { fmt } from '../../utils/dateUtils';
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

const STATUSES         = ['NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED'];
const PRIORITIES       = ['LOW','MEDIUM','HIGH','CRITICAL'];
const IMPACTS          = ['LOW','MEDIUM','HIGH'];
const URGENCIES        = ['LOW','MEDIUM','HIGH'];
const CLASSIFICATIONS  = ['','Software','Hardware','Network','Access','Configuration','Other'];

const MODULE_DEFAULTS = [
  { value: 'FlashArray',             label: 'FlashArray' },
  { value: 'FlashBlade',             label: 'FlashBlade' },
  { value: 'Pure Cloud Block Store', label: 'Pure Cloud Block Store' },
  { value: 'Evergreen//One',         label: 'Evergreen//One' },
  { value: 'ActiveCluster',          label: 'ActiveCluster' },
  { value: 'Portworx',               label: 'Portworx' },
  { value: 'General',                label: 'General' },
];

const ASSIGN_GROUP_DEFAULTS = [
  { value: 'Storage Team',      label: 'Storage Team' },
  { value: 'Network Team',      label: 'Network Team' },
  { value: 'Cloud Team',        label: 'Cloud Team' },
  { value: 'Hardware Support',  label: 'Hardware Support' },
  { value: 'Software Support',  label: 'Software Support' },
  { value: 'Access Management', label: 'Access Management' },
  { value: 'DevOps Team',       label: 'DevOps Team' },
  { value: 'Security Team',     label: 'Security Team' },
  { value: 'L1 Support',        label: 'L1 Support' },
  { value: 'L2 Support',        label: 'L2 Support' },
  { value: 'L3 Support',        label: 'L3 Support' },
];

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
  const [ticketNumber, setTicketNumber] = useState('');
  const [customData, setCustomData]   = useState({});
  const [attachments, setAttachments] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [pendingDeletes, setPendingDeletes] = useState(new Set());
  const [saveNote, setSaveNote]       = useState('');
  const [originalAssignedTo, setOriginalAssignedTo] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [attachOpen, setAttachOpen]   = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get(`/tickets/${id}`),
      api.get('/config/fields'),
      api.get('/config/categories'),
      api.get('/config/users'),
      api.get('/config/ticket-types'),
    ]).then(([t, f, c, u, tt]) => {
      const ticket = t.data.ticket;
      setTicketNumber(ticket.ticket_number);
      setForm({
        customerName:     ticket.customer_name     || '',
        moduleText:       ticket.module_name        || '',
        categoryId:       ticket.category_id        ? String(ticket.category_id) : '',
        shortDescription: ticket.short_description  || '',
        description:      ticket.description        || '',
        status:           ticket.status             || 'NEW',
        priority:         ticket.priority           || 'MEDIUM',
        impact:           ticket.impact             || 'MEDIUM',
        urgency:          ticket.urgency            || 'MEDIUM',
        ticketOwner:      ticket.ticket_owner       ? String(ticket.ticket_owner) : '',
        assignedTo:       ticket.assigned_to        ? String(ticket.assigned_to) : '',
        typeId:           ticket.type_id            ? String(ticket.type_id) : '',
        classification:   ticket.classification     || '',
        assignmentGroup:  ticket.assignment_group   || '',
      });
      setOriginalAssignedTo(ticket.assigned_to ? String(ticket.assigned_to) : '');
      setCustomData(ticket.custom_data || {});
      setAttachments(t.data.attachments || []);
      setFields(f.data.fields || []);
      setCategories(c.data.categories || []);
      setUsers(u.data.users || []);
      setTicketTypes(tt.data.types || []);
    }).catch(() => toast.error('Failed to load ticket'));
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const assigneeChanged = (form?.assignedTo || '') !== originalAssignedTo;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (assigneeChanged && !saveNote.trim()) {
      toast.error('Please add a note explaining why you are reassigning this ticket.');
      return;
    }
    setLoading(true);
    try {
      if (pendingDeletes.size > 0) {
        await Promise.all([...pendingDeletes].map(attId => api.delete(`/attachments/${attId}`)));
        setPendingDeletes(new Set());
      }
      if (saveNote.trim()) {
        await api.post(`/tickets/${id}/comments`, { body: saveNote.trim(), type: 'COMMENT' });
      }
      const payload = {
        ...form,
        typeId:          form.typeId          || undefined,
        classification:  form.classification  || undefined,
        assignmentGroup: form.assignmentGroup || undefined,
        assignedTo:      form.assignedTo      || null,
        ...(isAdmin ? { ticketOwner: form.ticketOwner || null } : {}),
        customData,
      };
      await api.put(`/tickets/${id}`, payload);
      toast.success('Ticket updated');
      navigate(isAdmin ? `/tickets/${id}` : '/tickets');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/tickets/${id}`);
      toast.success('Ticket deleted');
      navigate('/tickets');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed');
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
      const errors   = res.data.errors   || [];
      const uploaded = res.data.attachments || [];
      setUploadQueue(prev => prev.map(q => {
        const hasError = errors.find(e => e.startsWith(q.name));
        return { ...q, progress: 100, status: hasError ? 'error' : 'done' };
      }));
      if (errors.length)   errors.forEach(e => toast.error(e));
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

  const markForDelete = (attId) => {
    setPendingDeletes(prev => {
      const next = new Set(prev);
      if (next.has(attId)) next.delete(attId); else next.add(attId);
      return next;
    });
  };

  const handleDownloadAll = () => {
    attachments.forEach(att => {
      const a = document.createElement('a');
      a.href = `/api/attachments/${att.id}/download`;
      a.download = att.file_name;
      a.click();
    });
  };

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  if (!form) return <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>;

  const customFields = fields.filter(f => !SYSTEM_KEYS.includes(f.field_key));
  const fieldByKey   = Object.fromEntries(fields.map(f => [f.field_key, f]));

  const statusOpts      = parseOpts(fieldByKey['status']?.options).length    > 0 ? parseOpts(fieldByKey['status']?.options)    : STATUSES.map(s => ({ value: s, label: s }));
  const priorityOpts    = parseOpts(fieldByKey['priority']?.options).length  > 0 ? parseOpts(fieldByKey['priority']?.options)  : PRIORITIES.map(p => ({ value: p, label: p }));
  const impactOpts      = parseOpts(fieldByKey['impact']?.options).length    > 0 ? parseOpts(fieldByKey['impact']?.options)    : IMPACTS.map(v => ({ value: v, label: v }));
  const urgencyOpts     = parseOpts(fieldByKey['urgency']?.options).length   > 0 ? parseOpts(fieldByKey['urgency']?.options)   : URGENCIES.map(v => ({ value: v, label: v }));
  const customerOpts    = parseOpts(fieldByKey['customer_name']?.options);
  const moduleOpts      = parseOpts(fieldByKey['module_text']?.options).length
    ? parseOpts(fieldByKey['module_text'].options) : MODULE_DEFAULTS;
  const assignGroupOpts = parseOpts(fieldByKey['assignment_group']?.options).length
    ? parseOpts(fieldByKey['assignment_group']?.options) : ASSIGN_GROUP_DEFAULTS;

  const categoryOpts    = categories.map(c => ({ value: String(c.id), label: c.name }));
  const typeOpts        = ticketTypes.map(t => ({ value: String(t.id), label: t.name }));
  const classOpts       = CLASSIFICATIONS.filter(Boolean).map(c => ({ value: c, label: c }));
  const userOpts        = users.map(u => ({ value: String(u.id), label: u.full_name }));

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

  const totalAttachCount = attachments.length - pendingDeletes.size;

  return (
    <div className="ip-page">

      {/* ── Header ── */}
      <div className="ip-header">
        <div className="ip-header-left">
          <div className="ip-breadcrumb">
            <Link to="/tickets">Tickets</Link> / <Link to={`/tickets/${id}`}>{ticketNumber}</Link> / Edit
          </div>
          <div className="ip-title-row">
            <h1 className="ip-title">Edit: {ticketNumber}</h1>
          </div>
          <div className="ip-short-desc-head">{form.shortDescription}</div>
        </div>
        <div className="ip-header-actions">
          <button type="button" className="ip-btn" onClick={() => setAttachOpen(true)}>
            <Paperclip size={14} />
            Attachments
            {(attachments.length > 0 || pendingDeletes.size > 0) && (
              <span className="ip-attach-count-badge">{totalAttachCount}</span>
            )}
          </button>
          <button type="button" className="ip-btn ip-btn-danger" onClick={() => setDeleteModal(true)}>
            <Trash2 size={13} /> Delete
          </button>
          <button type="button" className="ip-btn" onClick={() => { setPendingDeletes(new Set()); navigate(-1); }} disabled={loading}>Cancel</button>
          <button type="button" className="ip-btn ip-btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
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
                  <span className="ip-lc">Number</span>
                  <span className="ip-vc ip-input-cell">
                    <input value={ticketNumber} readOnly />
                  </span>
                </div>
                <div className="ip-pair">
                  <span className="ip-lc">State</span>
                  <span className="ip-vc ip-input-cell">
                    <select value={form.status} onChange={e => set('status', e.target.value)}>
                      {statusOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </span>
                </div>
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">{fieldByKey['customer_name']?.label || 'Customer'}{fieldByKey['customer_name']?.is_required && <span className="ip-req"> *</span>}</span>
                  <span className="ip-vc ip-input-cell">
                    <SearchSelect
                      value={form.customerName}
                      onChange={v => set('customerName', v)}
                      options={customerOpts}
                      placeholder="Customer name"
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
              </div>
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">Assigned To</span>
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
              {isAdmin && (
                <div className="ip-row">
                  <div className="ip-pair">
                    <span className="ip-lc">Ticket Owner</span>
                    <span className="ip-vc ip-input-cell">
                      <SearchSelect
                        value={form.ticketOwner}
                        onChange={v => set('ticketOwner', v)}
                        options={[{ value: '', label: 'Select owner' }, ...userOpts]}
                        placeholder="Select owner"
                      />
                    </span>
                  </div>
                  <div className="ip-pair" />
                </div>
              )}
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

          {/* ADD A NOTE */}
          <div className="ip-section">
            <div className="ip-section-bar">
              <span>Add a Note</span>
              {assigneeChanged
                ? <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>* Required when reassigning</span>
                : <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400 }}>Optional — saved with this update</span>
              }
            </div>
            <div className="ip-note-inner">
              <textarea
                className={`ip-note-textarea${assigneeChanged && !saveNote.trim() ? ' ip-note-required' : ''}`}
                rows={5}
                placeholder={assigneeChanged
                  ? 'Required: explain why you are reassigning this ticket...'
                  : 'e.g. Escalating to Bob — he handles network issues (optional)'
                }
                value={saveNote}
                onChange={e => setSaveNote(e.target.value)}
              />
            </div>
          </div>

          {/* ACTION BAR */}
          <div className="ip-action-bar">
            <button type="button" className="ip-btn" onClick={() => { setPendingDeletes(new Set()); navigate(-1); }}>Cancel</button>
            <button type="submit" className="ip-btn ip-btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

        </div>
      </form>

      {/* ATTACHMENT POPUP */}
      {attachOpen && (
        <div className="attach-popup-overlay" onClick={() => setAttachOpen(false)}>
          <div className="attach-popup" onClick={e => e.stopPropagation()}>
            <div className="attach-popup-header">
              <span className="attach-popup-title">
                Attachments {attachments.length > 0 && `(${attachments.length})`}
                {pendingDeletes.size > 0 && <span style={{ color: 'var(--danger)', fontSize: 12, marginLeft: 8 }}>{pendingDeletes.size} marked for removal</span>}
              </span>
              <div className="attach-popup-actions">
                {attachments.length > 0 && (
                  <button className="ip-btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleDownloadAll} title="Download all">
                    <Download size={13} /> Download All
                  </button>
                )}
                <label className="ip-btn" style={{ cursor: 'pointer', fontSize: 12, padding: '6px 12px' }}>
                  <Upload size={13} /> Upload
                  <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
                </label>
                <button className="ip-btn-icon" onClick={() => setAttachOpen(false)} title="Close"><X size={14} /></button>
              </div>
            </div>

            {uploadQueue.length > 0 && (
              <div className="attach-popup-queue">
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

            <div className="attach-popup-body">
              {attachments.length === 0 && uploadQueue.length === 0 && (
                <div className="attach-popup-empty">
                  <Paperclip size={24} strokeWidth={1.5} />
                  <span>No attachments yet.</span>
                  <span style={{ fontSize: 12 }}>Click Upload to attach files.</span>
                </div>
              )}
              {attachments.map(att => {
                const isImage = att.mime_type?.startsWith('image/');
                const isPending = pendingDeletes.has(att.id);
                return (
                  <div key={att.id} className={`attach-popup-item${isPending ? ' attach-popup-pending' : ''}`}>
                    {isImage
                      ? <img src={`/api/attachments/${att.id}/download?preview=true`} alt={att.file_name} className="attach-popup-thumb" style={isPending ? { opacity: 0.4 } : {}} />
                      : <div className="attach-popup-icon" style={isPending ? { opacity: 0.4 } : {}}>📎</div>
                    }
                    <div className="attach-popup-info" style={isPending ? { opacity: 0.45, textDecoration: 'line-through' } : {}}>
                      <div className="attach-popup-name">{att.file_name}</div>
                      <div className="attach-popup-meta">{fmtBytes(att.file_size)} · {fmt(att.uploaded_at)} · {att.uploader_name}</div>
                    </div>
                    <div className="attach-popup-item-actions">
                      {!isPending && (
                        <>
                          <a href={`/api/attachments/${att.id}/download?preview=true`} target="_blank" rel="noreferrer" className="ip-btn-icon" title="View"><Eye size={13} /></a>
                          <a href={`/api/attachments/${att.id}/download`} className="ip-btn-icon" title="Download"><Download size={13} /></a>
                        </>
                      )}
                      {(isAdmin || att.uploaded_by === currentUser?.id) && (
                        <button type="button" className="ip-btn-icon danger" onClick={() => markForDelete(att.id)} title={isPending ? 'Undo removal' : 'Mark for removal'}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Delete Ticket {ticketNumber}?</h3>
            <p>This action cannot be easily undone. The ticket will be soft-deleted.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteModal(false)}>Cancel</button>
              <button className="btn-delete" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
