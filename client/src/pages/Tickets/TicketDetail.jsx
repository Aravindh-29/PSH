import TicketActivityHistory from '../../components/TicketActivityHistory';
import EmailCommentBody from '../../components/EmailCommentBody';
import TicketCompleteness from '../../components/TicketCompleteness';
import useAccess from '../../hooks/useAccess';
import AccessDenied from '../../components/AccessDenied';
import { TemplateFields } from '../../components/TicketTemplate';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Pencil, Download, X, Clock, Paperclip, ShieldAlert, ArrowLeft } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../../components/Badge';
import {useNotifications} from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { fmt } from '../../utils/dateUtils';
import SLABar from '../../components/SLABar';
import './TicketDetail.css';
import './IncidentPage.css';

export default function TicketDetail() {
  const { id } = useParams();
  const location=useLocation();
  const {markTicketOpened}=useNotifications();
  const [openReceiptError,setOpenReceiptError]=useState(false);
  const {can,record}=useAccess();
  const [denied,setDenied]=useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const loadRequest=useRef(0);
  const [loading, setLoading] = useState(true);
  const [attachOpen, setAttachOpen] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [fieldByKey, setFieldByKey] = useState({});
  const [slaInstances, setSlaInstances] = useState([]);

  const load = () => {
    const request=++loadRequest.current;
    setLoading(true);
    Promise.all([
      api.get(`/tickets/${id}`).then(async res => {
        const sla = request===loadRequest.current && record('sla.view',res.data.ticket)
          ? await api.get(`/sla/ticket/${id}`).catch(() => ({data:{instances:[]}}))
          : {data:{instances:[]}};
        return {res,sla};
      }),
      api.get('/config/fields')
    ])
      .then(([{res,sla}, f]) => {
        if(request!==loadRequest.current)return;
        setData(res.data);
        setSlaInstances(sla.data.instances || []);
        const allFields = f.data.fields || [];
        setFieldByKey(Object.fromEntries(allFields.map(f => [f.field_key, f])));
        setCustomFieldDefs(allFields.filter(fd =>
          !['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description','assignment_group'].includes(fd.field_key)
        ));
      })
      .catch((err) => {
        if(request!==loadRequest.current)return;
        if (err?.response?.status === 403) setDenied(true);
        else toast.error('Ticket not found');
      })
      .finally(() => {if(request===loadRequest.current)setLoading(false)});
  };
  useEffect(() => {setDenied(false);setData(null);setOpenReceiptError(false);load();return()=>{loadRequest.current++}}, [id,location.key]);
  useEffect(()=>{let active=true;if(data?.ticket?.id===id&&data.ticket.inbox_revision)markTicketOpened(data.ticket.id,data.ticket.inbox_revision).then(ok=>{if(active)setOpenReceiptError(!ok)});return()=>{active=false}},[id,data?.ticket?.id,data?.ticket?.inbox_revision,markTicketOpened]);



  if (loading||data&&data.ticket.id!==id) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Loading ticket...</div>;
  if (denied) return <AccessDenied />;
  if (!data) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Ticket not found.</div>;

  const { ticket, attachments, comments, audit } = data;
  const isAdmin = user?.role === 'admin';
  const canEdit = ['edit','priority','impact','urgency','category','type','classification','template','status','assign','owner'].some(key=>record('tickets.'+key,ticket));

  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  const handleDownloadZip = () => {
    const a = document.createElement('a');
    a.href = `/api/tickets/${id}/attachments/zip`;
    a.download = `${ticket.ticket_number}-attachments.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const customVisible = customFieldDefs.filter(f => {
    const raw = (ticket.custom_data || {})[f.field_key];
    return raw !== undefined && raw !== null && raw !== '';
  });

  const customPairs = [];
  for (let i = 0; i < customVisible.length; i += 2) {
    customPairs.push([customVisible[i], customVisible[i+1] || null]);
  }

  const renderCustomValue = (f) => {
    const raw = (ticket.custom_data || {})[f.field_key];
    const opts = Array.isArray(f.options) ? f.options : JSON.parse(f.options || '[]');
    return f.field_type === 'dropdown' ? (opts.find(o => o.value === raw)?.label || raw) : String(raw);
  };

  const Val = ({ v }) => v ? <span>{v}</span> : <span className="ip-val-empty">—</span>;

  return (
    <div className="ip-page ip-ticket-view">{openReceiptError&&<p role="alert">Could not update your unopened ticket count. <button type="button" onClick={()=>markTicketOpened(ticket.id,ticket.inbox_revision).then(ok=>setOpenReceiptError(!ok))}>Retry</button></p>}
      <TicketCompleteness ticket={ticket}/>

      {/* ── Header ── */}
      <div className="ip-header">
        <div className="ip-header-left">
          <div className="ip-breadcrumb">
            <button className="ip-back-btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={14} /> Back
            </button>
            <span className="ip-breadcrumb-sep">/</span>
            {ticket.ticket_number}
          </div>
          <div className="ip-title-row">
            <h1 className="ip-title">{ticket.ticket_number}</h1>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          {ticket.template_snapshot?.name && <div className="ip-short-desc-head">{ticket.template_snapshot.name}</div>}
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
              <Link to={`/tickets/${id}/edit`} className="ip-btn">
                <Pencil size={13} /> Edit
              </Link>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="ip-body">

        {/* INCIDENT DETAILS */}
        <div className="ip-section">
          <div className="ip-section-bar"><span>Incident Details</span></div>
          <div className="ip-two-cols">
            {/* Left column — flows independently, no gap from optional fields */}
            <div className="ip-col">
              <div className="ip-pair">
                <span className="ip-lc">Number</span>
                <span className="ip-vc">{ticket.ticket_number}</span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['customer_name']?.label || 'Customer'}</span>
                <span className="ip-vc"><Val v={ticket.customer_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['module_text']?.label || 'Module'}</span>
                <span className="ip-vc"><Val v={ticket.module_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['category_id']?.label || 'Category'}</span>
                <span className="ip-vc"><Val v={ticket.category_name} /></span>
              </div>
              {ticket.subcategory_name && (
                <div className="ip-pair">
                  <span className="ip-lc">Subcategory</span>
                  <span className="ip-vc"><Val v={ticket.subcategory_name} /></span>
                </div>
              )}
              <div className="ip-pair">
                <span className="ip-lc">Type</span>
                <span className="ip-vc"><Val v={ticket.type_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Assigned To</span>
                <span className="ip-vc">
                  {ticket.assigned_to_name || <span className="ip-val-empty">Unassigned</span>}
                </span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Ticket Owner</span>
                <span className="ip-vc"><Val v={ticket.ticket_owner_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Created At</span>
                <span className="ip-vc">{fmt(ticket.created_at)}</span>
              </div>
              {ticket.updated_by_name && (
                <div className="ip-pair">
                  <span className="ip-lc">Updated By</span>
                  <span className="ip-vc">{ticket.updated_by_name}</span>
                </div>
              )}
            </div>

            {/* Right column — flows independently */}
            <div className="ip-col">
              <div className="ip-pair">
                <span className="ip-lc">State</span>
                <span className="ip-vc"><StatusBadge status={ticket.status} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['priority']?.label || 'Priority'}</span>
                <span className="ip-vc"><PriorityBadge priority={ticket.priority} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['impact']?.label || 'Impact'}</span>
                <span className="ip-vc"><Val v={ticket.impact} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">{fieldByKey['urgency']?.label || 'Urgency'}</span>
                <span className="ip-vc"><Val v={ticket.urgency} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Classification</span>
                <span className="ip-vc"><Val v={ticket.classification} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Department</span>
                <span className="ip-vc"><Val v={ticket.assignment_group_name || ticket.assignment_group} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Sub Department</span><span className="ip-vc"><Val v={ticket.subgroup_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Created By</span>
                <span className="ip-vc"><Val v={ticket.created_by_name} /></span>
              </div>
              <div className="ip-pair">
                <span className="ip-lc">Updated At</span>
                <span className="ip-vc">{fmt(ticket.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ADDITIONAL FIELDS (custom) */}
        {customVisible.length > 0 && (
          <div className="ip-section">
            <div className="ip-section-bar"><span>Additional Fields</span></div>
            <div className="ip-fields ip-view-mode">
              {customPairs.map((pair, ri) => (
                <div className="ip-row" key={`cf-${ri}`}>
                  {pair.map((f, fi) => f ? (
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

        <TemplateFields template={ticket.template_snapshot} values={ticket.template_values} readOnly />

        {/* SLA Panel */}
        {slaInstances.length > 0 && (
          <div className="ip-sla-section">
            <div className="ip-section-bar">
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ShieldAlert size={14} style={{ color: '#E85D04' }} />
                SLA Status
              </span>
            </div>
            <div className="ip-sla-bars">
              {slaInstances.map(inst => (
                <SLABar key={inst.id} instance={inst} />
              ))}
            </div>
          </div>
        )}

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
                    {[...comments].reverse().map((c, idx, arr) => {
                      const isFirst = idx === 0;
                      const isLast  = idx === arr.length - 1;
                      const isWorkNote = c.type === 'WORK_NOTE';
                      const roleLabel = c.author_role_name || (c.author_role === 'admin' ? 'Admin' : 'Employee');
                      return (
                        <div key={c.id} className={`ct-item${isLast ? ' ct-last' : ''}${isWorkNote ? ' ct-work-note' : ''}${isFirst ? ' ct-first' : ''}`}>
                          <div className="ct-gutter">
                            <div className={`ct-dot${isFirst ? ' ct-dot-latest' : ''}`} />
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
                            {c.email_sender?<EmailCommentBody comment={c}/>:<div className="ct-body">{c.body}</div>}
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
              <TicketActivityHistory entries={audit}/>
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
                  <button className="ip-btn" style={{ fontSize: 12, padding: '6px 12px' }} disabled={!can('attachments.zip')} onClick={handleDownloadZip} title="Download all as ZIP">
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
                      <a href={`/api/attachments/${att.id}/download`} className="ip-btn-icon" title="Download"><Download size={13} /></a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
