import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Download, X, Upload, Send } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../../components/Badge';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { fmt } from '../../utils/dateUtils';
import './TicketDetail.css';

function Field({ label, value }) {
  return (
    <div className="td-field">
      <span className="td-field-label">{label}</span>
      <span className="td-field-value">{value || '—'}</span>
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [commentType, setCommentType] = useState('COMMENT');
  const [submitting, setSubmitting] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]); // [{name, progress, status}]
  const fileInputRef = useRef(null);

  const [customFieldDefs, setCustomFieldDefs] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/tickets/${id}`),
      api.get('/config/fields'),
    ])
      .then(([res, f]) => {
        setData(res.data);
        setCustomFieldDefs((f.data.fields || []).filter(fd => !['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description'].includes(fd.field_key)));
      })
      .catch(() => toast.error('Ticket not found'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    try {
      await api.delete(`/tickets/${id}`);
      toast.success('Ticket deleted');
      navigate('/tickets');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/tickets/${id}/comments`, { body: comment, type: commentType });
      toast.success('Comment added');
      setComment('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
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
      const errors = res.data.errors || [];
      const uploaded = res.data.attachments || [];
      setUploadQueue(prev => prev.map(q => {
        const hasError = errors.find(e => e.startsWith(q.name));
        return { ...q, progress: 100, status: hasError ? 'error' : 'done' };
      }));
      if (errors.length) errors.forEach(e => toast.error(e));
      if (uploaded.length) toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);
      // Refresh attachments + audit log without full page reload
      const fresh = await api.get(`/tickets/${id}`);
      setData(prev => ({ ...prev, attachments: fresh.data.attachments, audit: fresh.data.audit }));
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
      // Remove from list immediately, then refresh audit log from server
      setData(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== attId) }));
      const fresh = await api.get(`/tickets/${id}`);
      setData(prev => ({ ...prev, audit: fresh.data.audit }));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  if (loading) return <div className="td-loading">Loading ticket...</div>;
  if (!data) return <div className="td-loading">Ticket not found.</div>;

  const { ticket, attachments, comments, audit } = data;
  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin || ticket.created_by === user?.id;

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  return (
    <div className="ticket-detail">
      <div className="td-header">
        <div>
          <div className="td-breadcrumb"><Link to="/tickets">Tickets</Link> / {ticket.ticket_number}</div>
          <h1 className="td-title">{ticket.ticket_number}</h1>
        </div>
        {canEdit && (
          <div className="td-header-actions">
            <Link to={`/tickets/${id}/edit`} className="td-btn-edit"><Pencil size={14} /> Edit</Link>
            <button className="td-btn-delete" onClick={() => setDeleteModal(true)}><Trash2 size={14} /> Delete</button>
          </div>
        )}
      </div>

      <div className="td-body">
        {/* Left: Ticket Details */}
        <div className="td-main">
          <div className="td-card">
            <div className="td-status-row">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <h2 className="td-subject">{ticket.short_description}</h2>
            <p className="td-desc">{ticket.description}</p>
            <div className="td-fields-grid">
              <Field label="Customer" value={ticket.customer_name} />
              <Field label="Module" value={ticket.module_name} />
              <Field label="Category" value={ticket.category_name} />
              <Field label="Priority" value={ticket.priority} />
              <Field label="Impact" value={ticket.impact} />
              <Field label="Urgency" value={ticket.urgency} />
              <Field label="Ticket Owner" value={ticket.ticket_owner_name} />
              <Field label="Created By" value={ticket.created_by_name} />
              <Field label="Created At" value={fmt(ticket.created_at)} />
              <Field label="Updated By" value={ticket.updated_by_name} />
              <Field label="Updated At" value={fmt(ticket.updated_at)} />
              {/* Custom fields */}
              {customFieldDefs.map(f => {
                const raw = (ticket.custom_data || {})[f.field_key];
                if (!raw && raw !== 0) return null;
                const opts = Array.isArray(f.options) ? f.options : (JSON.parse(f.options || '[]'));
                const display = f.field_type === 'dropdown'
                  ? (opts.find(o => o.value === raw)?.label || raw)
                  : String(raw);
                return <Field key={f.field_key} label={f.label} value={display} />;
              })}
            </div>
          </div>

          {/* Attachments */}
          <div className="td-card">
            <div className="td-card-header">
              <h3>Attachments</h3>
              <label className="td-upload-btn" style={{ cursor: 'pointer' }}>
                <Upload size={13} />
                Upload Files
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
              </label>
            </div>

            {/* Upload progress queue */}
            {uploadQueue.length > 0 && (
              <div className="upload-queue">
                {uploadQueue.map(item => (
                  <div key={item.id} className={`upload-item upload-${item.status}`}>
                    <div className="upload-item-name">
                      <span className="upload-icon">
                        {item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : '↑'}
                      </span>
                      <span>{item.name}</span>
                    </div>
                    <div className="upload-bar-wrap">
                      <div className="upload-bar" style={{ width: `${item.progress}%` }} />
                    </div>
                    <span className="upload-pct">
                      {item.status === 'done' ? 'Done' : item.status === 'error' ? 'Failed' : `${item.progress}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {attachments.length === 0 && uploadQueue.length === 0 && <p className="td-empty">No attachments</p>}
            {attachments.map(att => (
              <div key={att.id} className="att-row">
                <div className="att-icon">📎</div>
                <div className="att-info">
                  <div className="att-name">{att.file_name}</div>
                  <div className="att-meta">{fmtBytes(att.file_size)} · {fmt(att.uploaded_at)} · {att.uploader_name}</div>
                </div>
                <a href={`/api/attachments/${att.id}/download`} className="att-btn" title="Download"><Download size={13} /></a>
                {(isAdmin || att.uploaded_by === user?.id) && (
                  <button className="att-btn danger" onClick={() => handleDeleteAttachment(att.id)} title="Delete"><X size={13} /></button>
                )}
              </div>
            ))}
          </div>

          {/* Comments */}
          <div className="td-card">
            <div className="td-card-header">
              <h3>Comments &amp; Work Notes</h3>
              {isAdmin && (
                <select className="comment-type-sel" value={commentType} onChange={e => setCommentType(e.target.value)}>
                  <option value="COMMENT">Comment</option>
                  <option value="WORK_NOTE">Work Note</option>
                </select>
              )}
            </div>
            <div className="comments-list">
              {comments.length === 0 && <p className="td-empty">No comments yet</p>}
              {comments.map(c => (
                <div key={c.id} className={`comment-item ${c.type === 'WORK_NOTE' ? 'work-note' : ''}`}>
                  <div className="comment-avatar">{c.author_name?.[0]}</div>
                  <div className="comment-body">
                    <div className="comment-meta">
                      <strong>{c.author_name}</strong>
                      {c.type === 'WORK_NOTE' && <span className="wn-tag">Work Note</span>}
                      <span className="comment-date">{fmt(c.created_at)}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleComment} className="comment-form">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={commentType === 'WORK_NOTE' ? 'Add internal work note...' : 'Add a comment...'}
                rows={3}
              />
              <button type="submit" disabled={submitting || !comment.trim()}>
                <Send size={13} /> {submitting ? 'Posting...' : 'Post'}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Audit */}
        <div className="td-sidebar">
          <div className="td-card">
            <h3 className="td-card-title">Activity History</h3>
            <div className="audit-list">
              {audit.length === 0 && <p className="td-empty">No history</p>}
              {audit.map((a) => (
                <div key={a.id} className="audit-item">
                  <div className="audit-dot" />
                  <div className="audit-content">
                    <div className="audit-action">{a.action.replace('_', ' ')}</div>
                    {a.field_name && (
                      <div className="audit-change">
                        <span className="audit-field">{a.field_name}</span>:
                        {a.old_value && <span className="audit-old"> {a.old_value}</span>}
                        {a.new_value && <span className="audit-new"> → {a.new_value}</span>}
                      </div>
                    )}
                    <div className="audit-meta">{a.user_name} · {fmt(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {deleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Delete Ticket {ticket.ticket_number}?</h3>
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
