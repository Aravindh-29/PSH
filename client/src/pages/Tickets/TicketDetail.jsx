import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Download, Eye, X, Clock, Paperclip } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../../components/Badge';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { fmt } from '../../utils/dateUtils';
import './TicketDetail.css';
import './IncidentPage.css';

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [fieldByKey, setFieldByKey] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([api.get(`/tickets/${id}`), api.get('/config/fields')])
      .then(([res, f]) => {
        setData(res.data);
        const allFields = f.data.fields || [];
        setFieldByKey(Object.fromEntries(allFields.map(f => [f.field_key, f])));
        setCustomFieldDefs(allFields.filter(fd =>
          !['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description','assignment_group'].includes(fd.field_key)
        ));
      })
      .catch((err) => {
        if (err?.response?.status === 403) navigate('/tickets');
        else toast.error('Ticket not found');
      })
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


  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Loading ticket...</div>;
  if (!data) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Ticket not found.</div>;

  const { ticket, attachments, comments, audit } = data;
  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin || ticket.created_by === user?.id || ticket.assigned_to === user?.id;

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  const handleDownloadZip = () => {
    const a = document.createElement('a');
    a.href = `/api/tickets/${id}/attachments/zip`;
    a.download = `${ticket.ticket_number}-attachments.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const FIELD_LABELS = {
    ticket_owner: 'Ticket Owner', assigned_to: 'Assigned To',
    category_id: 'Category', type_id: 'Type',
    status: 'Status', priority: 'Priority', impact: 'Impact', urgency: 'Urgency',
    short_description: 'Short Description', description: 'Description',
    customer_name: 'Customer', module_text: 'Module',
    assignment_group: 'Assignment Group', classification: 'Classification',
    attachment: 'Attachment',
  };

  const auditActionLabel = (a) => {
    if (a.action === 'CREATED') return 'CREATED';
    if (a.action === 'DELETED') return 'DELETED';
    if (a.action === 'ATTACHMENT_ADDED') return 'ATTACHMENT ADDED';
    if (a.action === 'ATTACHMENT_DELETED') return 'ATTACHMENT DELETED';
    if (a.action === 'UPDATED' && a.field_name) {
      const label = FIELD_LABELS[a.field_name] || a.field_name.replace(/_/g, ' ').toUpperCase();
      return `${label} UPDATED`;
    }
    return a.action.replace(/_/g, ' ');
  };

  const customVisible = customFieldDefs.filter(f => {
    const raw = (ticket.custom_data || {})[f.field_key];
    return raw !== undefined && raw !== null && raw !== '';
  });

  const customTriples = [];
  for (let i = 0; i < customVisible.length; i += 3) {
    customTriples.push([customVisible[i], customVisible[i+1] || null, customVisible[i+2] || null]);
  }

  const renderCustomValue = (f) => {
    const raw = (ticket.custom_data || {})[f.field_key];
    const opts = Array.isArray(f.options) ? f.options : JSON.parse(f.options || '[]');
    return f.field_type === 'dropdown' ? (opts.find(o => o.value === raw)?.label || raw) : String(raw);
  };

  const Val = ({ v }) => v ? <span>{v}</span> : <span className="ip-val-empty">—</span>;

  return (
    <div className="ip-page">

      {/* ── Header ── */}
      <div className="ip-header">
        <div className="ip-header-left">
          <div className="ip-breadcrumb">
            <Link to="/tickets">Tickets</Link> / {ticket.ticket_number}
          </div>
          <div className="ip-title-row">
            <h1 className="ip-title">{ticket.ticket_number}</h1>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <div className="ip-short-desc-head">{ticket.short_description}</div>
        </div>
        <div className="ip-header-actions">
          {attachments.length > 0 && (
            <button type="button" className="ip-btn" onClick={() => setAttachOpen(true)}>
              <Paperclip size={14} />
              Attachments
              <span className="ip-attach-count-badge">{attachments.length}</span>
            </button>
          )}
          {canEdit && (
            <>
              <Link to={`/tickets/${id}/edit`} className="ip-btn">
                <Pencil size={13} /> Edit
              </Link>
              <button className="ip-btn ip-btn-danger" onClick={() => setDeleteModal(true)}>
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="ip-body">

        {/* INCIDENT DETAILS */}
        <div className="ip-section">
          <div className="ip-section-bar"><span>Incident Details</span></div>
          <div className="ip-fields ip-view-mode">
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">Number</span>
                <span className="ip-vc">{ticket.ticket_number}</span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">State</span>
                <span className="ip-vc"><StatusBadge status={ticket.status} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['customer_name']?.label || 'Customer'}</span>
                <span className="ip-vc"><Val v={ticket.customer_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['priority']?.label || 'Priority'}</span>
                <span className="ip-vc"><PriorityBadge priority={ticket.priority} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['module_text']?.label || 'Module'}</span>
                <span className="ip-vc"><Val v={ticket.module_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['impact']?.label || 'Impact'}</span>
                <span className="ip-vc"><Val v={ticket.impact} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['category_id']?.label || 'Category'}</span>
                <span className="ip-vc"><Val v={ticket.category_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['urgency']?.label || 'Urgency'}</span>
                <span className="ip-vc"><Val v={ticket.urgency} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">Type</span>
                <span className="ip-vc"><Val v={ticket.type_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Classification</span>
                <span className="ip-vc"><Val v={ticket.classification} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">Assigned To</span>
                <span className="ip-vc">
                  {ticket.assigned_to_name || <span className="ip-val-empty">Unassigned</span>}
                </span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['assignment_group']?.label || 'Assignment Group'}</span>
                <span className="ip-vc"><Val v={ticket.assignment_group} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">Ticket Owner</span>
                <span className="ip-vc"><Val v={ticket.ticket_owner_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Created By</span>
                <span className="ip-vc"><Val v={ticket.created_by_name} /></span>
              </div>
            </div>
            <div className="ip-row">
              <div className="ip-pair">
                <span className="ip-lc">Created At</span>
                <span className="ip-vc">{fmt(ticket.created_at)}</span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Updated At</span>
                <span className="ip-vc">{fmt(ticket.updated_at)}</span>
              </div>
            </div>
            {ticket.updated_by_name && (
              <div className="ip-row">
                <div className="ip-pair">
                  <span className="ip-lc">Updated By</span>
                  <span className="ip-vc">{ticket.updated_by_name}</span>
                </div>
                <div className="ip-pair" />
              </div>
            )}
          </div>
        </div>

        {/* ADDITIONAL FIELDS (custom) */}
        {customVisible.length > 0 && (
          <div className="ip-section">
            <div className="ip-section-bar"><span>Additional Fields</span></div>
            <div className="ip-fields ip-fields-3col ip-view-mode">
              {customTriples.map((triple, ri) => (
                <div className="ip-row" key={`cf-${ri}`}>
                  {triple.map((f, fi) => f ? (
                    <div className="ip-pair" key={fi}>
                      <span className="ip-lc">{f.label}</span>
                      <span className="ip-vc">{renderCustomValue(f)}</span>
                    </div>
                  ) : <div className="ip-pair" key={fi} />)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHORT DESCRIPTION */}
        <div className="ip-section">
          <div className="ip-section-bar"><span>Short Description</span></div>
          <div className="ip-standalone-value-box ip-val-box-short">
            {ticket.short_description || <span className="ip-val-empty">No short description</span>}
          </div>
        </div>

        {/* FULL DESCRIPTION */}
        <div className="ip-section">
          <div className="ip-section-bar"><span>Full Description</span></div>
          <div className="ip-standalone-value-box ip-val-box-full">
            {ticket.description || <span className="ip-val-empty">No description provided</span>}
          </div>
        </div>

        {/* COMMENTS + ACTIVITY */}
        <div className="ip-bottom">
          <div className="ip-bottom-left">
            <div className="ip-section-bar" style={{ cursor: 'default', userSelect: 'text' }}>
              <span>Comments &amp; Work Notes</span>
            </div>
            <div className="ip-comments-inner">
              {comments.length === 0
                ? <p className="ip-empty-msg">No comments yet</p>
                : (
                  <div className="ct-timeline">
                    {comments.map((c, idx) => {
                      const isLast = idx === comments.length - 1;
                      const isWorkNote = c.type === 'WORK_NOTE';
                      const roleLabel = c.author_role === 'admin' ? 'Admin' : 'Employee';
                      return (
                        <div key={c.id} className={`ct-item${isLast ? ' ct-last' : ''}${isWorkNote ? ' ct-work-note' : ''}`}>
                          <div className="ct-gutter">
                            <div className="ct-dot" />
                            {!isLast && <div className="ct-connector" />}
                          </div>
                          <div className={`ct-card${isWorkNote ? ' ct-work-note' : ''}`}>
                            <div className="ct-header">
                              <div className="ct-avatar">{c.author_name?.[0]?.toUpperCase() || '?'}</div>
                              <span className="ct-name">{c.author_name}</span>
                              <span className={`ct-role-badge${isWorkNote ? ' ct-badge-worknote' : c.author_role === 'admin' ? ' ct-badge-admin' : ''}`}>
                                {isWorkNote ? 'Work Note' : roleLabel}
                              </span>
                              <div className="ct-timestamp"><Clock size={11} /><span>{fmt(c.created_at)}</span></div>
                            </div>
                            <div className="ct-body">{c.body}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          </div>
          <div className="ip-bottom-right">
            <div className="ip-section-bar" style={{ cursor: 'default', userSelect: 'text' }}>
              <span>Activity History</span>
            </div>
            <div className="ip-activity-inner">
              {audit.length === 0
                ? <p className="ip-empty-msg">No activity yet</p>
                : (
                  <div className="audit-list" style={{ maxHeight: 'unset' }}>
                    {audit.map(a => (
                      <div key={a.id} className="audit-item">
                        <div className="audit-dot" />
                        <div className="audit-content">
                          <div className="audit-action">{auditActionLabel(a)}</div>
                          {a.field_name && (a.old_value || a.new_value) && (
                            <div className="audit-change">
                              {a.field_name.replace(/_/g, ' ')}:{' '}
                              {a.old_value && <span className="audit-old">{a.old_value}</span>}
                              {a.old_value && a.new_value && ' → '}
                              {a.new_value && <span className="audit-new">{a.new_value}</span>}
                            </div>
                          )}
                          {a.action === 'ATTACHMENT_ADDED' && a.new_value && (
                            <div className="audit-change">
                              <a href={`/api/attachments/${a.new_value}/download?preview=true`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)' }}>{a.new_value}</a>
                            </div>
                          )}
                          <div className="audit-meta">{a.user_name} · {fmt(a.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        </div>

      </div>

      {/* ATTACHMENT POPUP (view-only: no upload, no delete) */}
      {attachOpen && (
        <div className="attach-popup-overlay" onClick={() => setAttachOpen(false)}>
          <div className="attach-popup" onClick={e => e.stopPropagation()}>
            <div className="attach-popup-header">
              <span className="attach-popup-title">
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </span>
              <div className="attach-popup-actions">
                {attachments.length > 0 && (
                  <button className="ip-btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleDownloadZip} title="Download all as ZIP">
                    <Download size={13} /> Download All
                  </button>
                )}
                <button className="ip-btn-icon" onClick={() => setAttachOpen(false)} title="Close"><X size={14} /></button>
              </div>
            </div>
            <div className="attach-popup-body">
              {attachments.length === 0 && (
                <div className="attach-popup-empty">
                  <Paperclip size={24} strokeWidth={1.5} />
                  <span>No attachments.</span>
                </div>
              )}
              {attachments.map(att => {
                const isImage = att.mime_type?.startsWith('image/');
                return (
                  <div key={att.id} className="attach-popup-item">
                    {isImage
                      ? <img src={`/api/attachments/${att.id}/download?preview=true`} alt={att.file_name} className="attach-popup-thumb" />
                      : <div className="attach-popup-icon">📎</div>
                    }
                    <div className="attach-popup-info">
                      <div className="attach-popup-name">{att.file_name}</div>
                      <div className="attach-popup-meta">{fmtBytes(att.file_size)} · {att.uploader_name} · {fmt(att.uploaded_at)}</div>
                    </div>
                    <div className="attach-popup-item-actions">
                      <a href={`/api/attachments/${att.id}/download?preview=true`} target="_blank" rel="noopener noreferrer" className="ip-btn-icon" title="View"><Eye size={13} /></a>
                      <a href={`/api/attachments/${att.id}/download`} className="ip-btn-icon" title="Download"><Download size={13} /></a>
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
