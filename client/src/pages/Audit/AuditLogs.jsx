import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
         getDay, isToday, subMonths, addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Users, FileText, Activity,
         Clock, X, ArrowRight, History, Search, Shield, User,
         Layers, Settings, Mail, Key, Trash2, Plus, Edit2 } from 'lucide-react';
import './AuditLogs.css';

// ── Action badge config ────────────────────────────────────────────────────────
const ACTION_META = {
  CREATED:             { label: 'Created',            color: '#16a34a', bg: '#dcfce7' },
  UPDATED:             { label: 'Updated',            color: '#2563eb', bg: '#dbeafe' },
  DELETED:             { label: 'Deleted',            color: '#dc2626', bg: '#fee2e2' },
  ATTACHMENT_UPLOADED: { label: 'Attachment Added',   color: '#7c3aed', bg: '#f3e8ff' },
  ATTACHMENT_DELETED:  { label: 'Attachment Removed', color: '#b45309', bg: '#fef3c7' },
};
function ActionBadge({ action }) {
  const m = ACTION_META[action] || { label: action, color: '#64748b', bg: '#f1f5f9' };
  return <span className="al-badge" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

// ── Admin action badge config ──────────────────────────────────────────────────
const ADMIN_ACTION_META = {
  USER_CREATED:          { label: 'User Created',         color: '#16a34a', bg: '#dcfce7',  icon: <Plus size={11}/> },
  USER_UPDATED:          { label: 'User Updated',         color: '#2563eb', bg: '#dbeafe',  icon: <Edit2 size={11}/> },
  USER_DELETED:          { label: 'User Deleted',         color: '#dc2626', bg: '#fee2e2',  icon: <Trash2 size={11}/> },
  USER_BULK_CREATED:     { label: 'Bulk User Import',     color: '#7c3aed', bg: '#f3e8ff',  icon: <Users size={11}/> },
  USER_PASSWORD_RESET:   { label: 'Password Reset',       color: '#b45309', bg: '#fef3c7',  icon: <Key size={11}/> },
  GROUP_CREATED:         { label: 'Group Created',        color: '#16a34a', bg: '#dcfce7',  icon: <Plus size={11}/> },
  GROUP_UPDATED:         { label: 'Group Updated',        color: '#2563eb', bg: '#dbeafe',  icon: <Edit2 size={11}/> },
  GROUP_DELETED:         { label: 'Group Deleted',        color: '#dc2626', bg: '#fee2e2',  icon: <Trash2 size={11}/> },
  GROUP_MEMBERS_SET:     { label: 'Group Members Updated',color: '#0891b2', bg: '#cffafe',  icon: <Users size={11}/> },
  TICKET_TYPE_CREATED:   { label: 'Type Created',         color: '#16a34a', bg: '#dcfce7',  icon: <Plus size={11}/> },
  TICKET_TYPE_UPDATED:   { label: 'Type Updated',         color: '#2563eb', bg: '#dbeafe',  icon: <Edit2 size={11}/> },
  TICKET_TYPE_DELETED:   { label: 'Type Deleted',         color: '#dc2626', bg: '#fee2e2',  icon: <Trash2 size={11}/> },
  TICKET_FIELD_CREATED:  { label: 'Field Created',        color: '#16a34a', bg: '#dcfce7',  icon: <Plus size={11}/> },
  TICKET_FIELD_UPDATED:  { label: 'Field Updated',        color: '#2563eb', bg: '#dbeafe',  icon: <Edit2 size={11}/> },
  TICKET_FIELD_DELETED:  { label: 'Field Deleted',        color: '#dc2626', bg: '#fee2e2',  icon: <Trash2 size={11}/> },
  CATEGORY_CREATED:      { label: 'Category Created',     color: '#16a34a', bg: '#dcfce7',  icon: <Plus size={11}/> },
  CATEGORY_UPDATED:      { label: 'Category Updated',     color: '#2563eb', bg: '#dbeafe',  icon: <Edit2 size={11}/> },
  CATEGORY_DELETED:      { label: 'Category Deleted',     color: '#dc2626', bg: '#fee2e2',  icon: <Trash2 size={11}/> },
  SUBCATEGORY_CREATED:   { label: 'Subcategory Created',  color: '#16a34a', bg: '#dcfce7',  icon: <Plus size={11}/> },
  SUBCATEGORY_UPDATED:   { label: 'Subcategory Updated',  color: '#2563eb', bg: '#dbeafe',  icon: <Edit2 size={11}/> },
  SUBCATEGORY_DELETED:   { label: 'Subcategory Deleted',  color: '#dc2626', bg: '#fee2e2',  icon: <Trash2 size={11}/> },
  EMAIL_CONFIG_UPDATED:  { label: 'Email Config Updated', color: '#E85D04', bg: '#ffedd5',  icon: <Mail size={11}/> },
  SSO_CONFIG_UPDATED:    { label: 'SSO Config Updated',   color: '#E85D04', bg: '#ffedd5',  icon: <Settings size={11}/> },
  RETENTION_UPDATED:     { label: 'Retention Policy',     color: '#64748b', bg: '#f1f5f9',  icon: <Settings size={11}/> },
};

const ENTITY_TYPE_LABEL = {
  user: 'User', group: 'Group', category: 'Category', subcategory: 'Subcategory',
  ticket_type: 'Ticket Type', ticket_field: 'Ticket Field',
  email_config: 'Email Config', sso_config: 'SSO Config', retention_settings: 'Retention',
};

function AdminActionBadge({ action }) {
  const m = ADMIN_ACTION_META[action] || { label: action.replace(/_/g,' '), color: '#64748b', bg: '#f1f5f9', icon: null };
  return (
    <span className="al-badge" style={{ color: m.color, background: m.bg, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {m.icon}{m.label}
    </span>
  );
}

// ── Admin Logs Details Popover ─────────────────────────────────────────────────
function DetailsPopover({ details, onClose }) {
  if (!details || Object.keys(details).length === 0) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, padding: '22px 26px', minWidth: 320, maxWidth: 480, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>Change Details</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={16}/></button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {Object.entries(details).map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '7px 0', color: '#64748B', fontWeight: 500, width: '40%', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</td>
                <td style={{ padding: '7px 0 7px 12px', color: '#0F172A', wordBreak: 'break-all' }}>
                  {v === null || v === undefined ? <em style={{ color: '#94A3B8' }}>—</em>
                   : typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No')
                   : String(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Admin Logs Panel ───────────────────────────────────────────────────────────
function AdminLogsPanel({ selectedDate, viewMonth }) {
  const [logs,       setLogs]       = useState([]);
  const [summary,    setSummary]    = useState({ total: 0, admins: 0 });
  const [activeDays, setActiveDays] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search,     setSearch]     = useState('');
  const [popover,    setPopover]    = useState(null);
  const LIMIT = 50;

  const load = useCallback(async (date, month, p = 1) => {
    setLoading(true);
    try {
      const yr = format(month, 'yyyy');
      const mo = format(month, 'M');
      const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const res = await api.get(`/admin-audit?date=${date}&year=${yr}&month=${mo}&page=${p}&limit=${LIMIT}&tz=${tz}`);
      const d = res.data;
      setLogs(d.logs || []);
      setSummary(d.summary || { total: 0, admins: 0 });
      setActiveDays(d.activeDays || []);
      setTotalPages(d.pagination?.pages || 1);
      setPage(p);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(selectedDate, viewMonth, 1); setSearch(''); }, [selectedDate, viewMonth]);

  const filtered = search.trim()
    ? logs.filter(l => {
        const q = search.toLowerCase();
        return (l.admin_name || '').toLowerCase().includes(q)
            || (l.entity_name || '').toLowerCase().includes(q)
            || (l.action || '').toLowerCase().includes(q)
            || (l.entity_type || '').toLowerCase().includes(q);
      })
    : logs;

  return (
    <div className="al-main">
      <div className="al-table-header">
        <span className="al-table-title">Admin Activity on {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : '—'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 10px', minWidth: 220 }}>
            <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input type="text" placeholder="Search by admin, action, entity…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', width: '100%', color: '#374151' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 0 }}><X size={12}/></button>}
          </div>
          {!loading && <span className="al-count-chip">{search ? `${filtered.length} / ${summary.total}` : summary.total} entries</span>}
        </div>
      </div>

      <div className="al-table-scroll">
        <table className="al-tbl">
          <thead>
            <tr>
              <th style={{ width: 72 }}>TIME</th>
              <th style={{ width: 170 }}>ADMIN</th>
              <th style={{ width: 200 }}>ACTION</th>
              <th style={{ width: 130 }}>ENTITY TYPE</th>
              <th>NAME / DESCRIPTION</th>
              <th style={{ width: 80 }}>DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="al-empty">Loading…</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={6} className="al-empty">No admin activity on this date</td></tr>}
            {!loading && logs.length > 0 && filtered.length === 0 && <tr><td colSpan={6} className="al-empty">No results for "{search}"</td></tr>}
            {filtered.map((l, i) => {
              const details = typeof l.details === 'object' ? l.details : {};
              const hasDetails = Object.keys(details).length > 0;
              return (
                <tr key={l.id || i} className={i % 2 === 0 ? '' : 'al-row-alt'}>
                  <td className="al-td-time">
                    <Clock size={11} style={{ marginRight: 4, opacity: 0.5, flexShrink: 0 }} />
                    {l.created_at ? format(new Date(l.created_at), 'HH:mm') : '—'}
                  </td>
                  <td>
                    <div className="al-employee">
                      <span className="al-avatar" style={{ background: '#E85D04' }}>{(l.admin_name || 'S')[0].toUpperCase()}</span>
                      <div>
                        <div className="al-emp-name">{l.admin_name || 'System'}</div>
                        <div className="al-emp-role">{l.admin_role || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><AdminActionBadge action={l.action} /></td>
                  <td>
                    <span style={{ fontSize: 12, background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                      {ENTITY_TYPE_LABEL[l.entity_type] || l.entity_type}
                    </span>
                  </td>
                  <td style={{ color: '#334155', fontSize: 13 }}>{l.entity_name || <span className="al-nil">—</span>}</td>
                  <td>
                    {hasDetails
                      ? <button onClick={() => setPopover(details)} style={{ background: '#EFF6FF', color: '#2563EB', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>View</button>
                      : <span className="al-nil">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="al-pagination">
          <button disabled={page === 1} onClick={() => load(selectedDate, viewMonth, page - 1)}><ChevronLeft size={13}/> Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => load(selectedDate, viewMonth, page + 1)}>Next <ChevronRight size={13}/></button>
        </div>
      )}

      {popover && <DetailsPopover details={popover} onClose={() => setPopover(null)} />}
    </div>
  );
}

const FIELD_LABELS = {
  status: 'Status', priority: 'Priority', impact: 'Impact', urgency: 'Urgency',
  short_description: 'Title', customer_name: 'Customer',
  description: 'Description', ticket_owner: 'Owner', category_id: 'Category',
  type_id: 'Type', classification: 'Classification', assignment_group: 'Assignment Group',
  assignment_group_id: 'Assignment Group', assigned_to: 'Assignee', custom_data: 'Custom Fields',
  module_text: 'Module',
};
const fieldLabel = (f) => f ? (FIELD_LABELS[f] || f.replace(/_/g, ' ')) : '—';

// ── Group consecutive CREATED rows for the same ticket into one entry ──────────
function groupLogs(logs) {
  const result = [];
  let i = 0;
  while (i < logs.length) {
    const l = logs[i];
    if (l.action === 'CREATED' && l.ticket_number) {
      const group = [l];
      const t0 = l.created_at ? new Date(l.created_at).getTime() : 0;
      let j = i + 1;
      while (j < logs.length &&
             logs[j].action === 'CREATED' &&
             logs[j].ticket_number === l.ticket_number &&
             Math.abs(new Date(logs[j].created_at).getTime() - t0) < 5000) {
        group.push(logs[j]);
        j++;
      }
      result.push({ key: l.id, type: 'created', time: l.created_at, employee_name: l.employee_name, employee_role: l.employee_role, ticket_number: l.ticket_number, items: group });
      i = j;
    } else {
      result.push({ key: l.id || i, type: 'single', log: l });
      i++;
    }
  }
  return result;
}

// ── Build a meaningful activity description for a single log row ──────────────
function buildActivity(log) {
  const { action, field_name, old_value: ov, new_value: nv } = log;
  const fl = FIELD_LABELS[field_name] || (field_name ? field_name.replace(/_/g, ' ') : '');
  if (action === 'UPDATED') {
    if (field_name === 'status')      return { text: 'Status changed',    diff: { from: ov, to: nv } };
    if (field_name === 'priority')    return { text: 'Priority changed',  diff: { from: ov, to: nv } };
    if (field_name === 'impact')      return { text: 'Impact changed',    diff: { from: ov, to: nv } };
    if (field_name === 'urgency')     return { text: 'Urgency changed',   diff: { from: ov, to: nv } };
    if (field_name === 'customer_name') return { text: 'Customer changed', diff: { from: ov, to: nv } };
    if (field_name === 'module_text') return { text: 'Module changed',    diff: { from: ov, to: nv } };
    if (field_name === 'classification') return { text: 'Classification changed', diff: { from: ov, to: nv } };
    if (field_name === 'assigned_to') {
      if (!ov && nv)  return { text: `Assigned to ${nv}` };
      if (ov && !nv)  return { text: `Assignee removed`, sub: `was ${ov}` };
      return { text: `Reassigned to ${nv}`, sub: `from ${ov}` };
    }
    if (field_name === 'ticket_owner') {
      if (!ov && nv)  return { text: `Owner set to ${nv}` };
      if (ov && !nv)  return { text: `Owner removed`, sub: `was ${ov}` };
      return { text: `Owner changed to ${nv}`, sub: `from ${ov}` };
    }
    if (field_name === 'assignment_group' || field_name === 'assignment_group_id') {
      if (!ov && nv)  return { text: `Assigned to group: ${nv}` };
      if (ov && !nv)  return { text: `Group assignment removed`, sub: `was ${ov}` };
      return { text: `Group changed to ${nv}`, sub: `from ${ov}` };
    }
    if (field_name === 'category_id')  return { text: `Category → ${nv || '—'}`, sub: ov ? `from ${ov}` : null };
    if (field_name === 'type_id')      return { text: `Type → ${nv || '—'}`, sub: ov ? `from ${ov}` : null };
    if (field_name === 'short_description') return { text: 'Title updated' };
    if (field_name === 'description')  return { text: 'Description updated' };
    if (field_name === 'custom_data')  return { text: 'Custom fields updated' };
    if (ov && nv) return { text: `${fl} updated`, diff: { from: ov, to: nv } };
    if (!ov && nv) return { text: `${fl} set to ${nv}` };
    if (ov && !nv) return { text: `${fl} cleared`, sub: `was ${ov}` };
    return { text: `${fl} updated` };
  }
  if (action === 'DELETED') return { text: 'Ticket deleted', danger: true };
  if (action === 'ATTACHMENT_ADDED' || action === 'ATTACHMENT_UPLOADED') return { text: 'Attachment added', sub: nv };
  if (action === 'ATTACHMENT_DELETED') return { text: 'Attachment removed', sub: ov };
  return { text: action.replace(/_/g, ' ') };
}

function ActivityCell({ activity }) {
  return (
    <div className="al-activity">
      <span className={`al-act-text${activity.danger ? ' al-act-danger' : ''}`}>{activity.text}</span>
      {activity.diff && (
        <span className="al-act-diff">
          <span className="al-act-from">{activity.diff.from || <em>empty</em>}</span>
          <ArrowRight size={11} className="al-act-arrow" />
          <span className="al-act-to">{activity.diff.to || <em>empty</em>}</span>
        </span>
      )}
      {activity.sub && !activity.diff && (
        <span className="al-act-sub">{activity.sub}</span>
      )}
    </div>
  );
}

function CreatedGroupRow({ entry, onTicketClick }) {
  return (
    <>
      <td className="al-td-time">
        <Clock size={11} style={{ marginRight: 4, opacity: 0.5, flexShrink: 0 }} />
        {entry.time ? format(new Date(entry.time), 'HH:mm') : '—'}
      </td>
      <td>
        <div className="al-employee">
          <span className="al-avatar">{(entry.employee_name || '?')[0].toUpperCase()}</span>
          <div>
            <div className="al-emp-name">{entry.employee_name || 'System'}</div>
            <div className="al-emp-role">{entry.employee_role || ''}</div>
          </div>
        </div>
      </td>
      <td>
        <button className="al-ticket-btn" onClick={() => onTicketClick(entry.ticket_number)} title="View full history">
          {entry.ticket_number}<History size={11} className="al-ticket-btn-icon" />
        </button>
      </td>
      <td><ActionBadge action="CREATED" /></td>
      <td>
        <span className="al-act-text">Ticket created</span>
      </td>
    </>
  );
}

// ── Ticket History Modal ───────────────────────────────────────────────────────
function TicketHistoryModal({ ticketNumber, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/audit/ticket/${ticketNumber}`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketNumber]);

  const ticket = data?.ticket;
  const logs   = data?.logs || [];

  return (
    <div className="al-modal-overlay" onClick={onClose}>
      <div className="al-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="al-modal-head">
          <div className="al-modal-title-row">
            <History size={16} className="al-modal-icon" />
            <div>
              <div className="al-modal-ticket-num">{ticketNumber}</div>
              {ticket && <div className="al-modal-subject">{ticket.short_description}</div>}
            </div>
          </div>
          {ticket && (
            <div className="al-modal-meta">
              <span className="al-modal-meta-item">Created by <strong>{ticket.created_by_name}</strong></span>
              <span className="al-modal-meta-sep">·</span>
              <span className="al-modal-meta-item">{format(new Date(ticket.created_at), 'MMM d, yyyy HH:mm')}</span>
              <span className="al-modal-meta-sep">·</span>
              <span className="al-modal-meta-item">{logs.length} event{logs.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          <button className="al-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="al-modal-body">
          {loading && <div className="al-modal-empty">Loading history…</div>}
          {!loading && logs.length === 0 && (
            <div className="al-modal-empty">No history recorded for this ticket.</div>
          )}
          {!loading && logs.length > 0 && (
            <div className="al-timeline">
              {logs.map((l, i) => {
                const isCreate = l.action === 'CREATED';
                const isDelete = l.action === 'DELETED';
                const meta = ACTION_META[l.action] || { color: '#64748b', bg: '#f1f5f9' };
                return (
                  <div key={l.id || i} className="al-tl-row">
                    {/* Spine */}
                    <div className="al-tl-spine">
                      <span className="al-tl-dot" style={{ background: meta.color }} />
                      {i < logs.length - 1 && <span className="al-tl-line" />}
                    </div>

                    {/* Content */}
                    <div className="al-tl-content">
                      <div className="al-tl-top">
                        <span className="al-tl-emp">
                          <span className="al-tl-avatar" style={{ background: meta.color + '22', color: meta.color }}>
                            {(l.employee_name || '?')[0].toUpperCase()}
                          </span>
                          <strong>{l.employee_name || 'System'}</strong>
                          <span className="al-tl-role">{l.employee_role}</span>
                        </span>
                        <ActionBadge action={l.action} />
                        <span className="al-tl-time">
                          <Clock size={10} />
                          {format(new Date(l.created_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>

                      {/* Change detail */}
                      {!isCreate && !isDelete && l.field_name && (
                        <div className="al-tl-change">
                          <span className="al-tl-field">{fieldLabel(l.field_name)}</span>
                          <span className="al-tl-from">{l.old_value || <em>empty</em>}</span>
                          <ArrowRight size={12} className="al-tl-arrow" />
                          <span className="al-tl-to">{l.new_value || <em>empty</em>}</span>
                        </div>
                      )}
                      {isCreate && (
                        <div className="al-tl-note">Ticket <strong>{l.new_value}</strong> was created</div>
                      )}
                      {isDelete && (
                        <div className="al-tl-note al-tl-note-danger">Ticket was deleted</div>
                      )}
                      {l.action === 'ATTACHMENT_UPLOADED' && (
                        <div className="al-tl-note">Attachment added: <strong>{l.new_value}</strong></div>
                      )}
                      {l.action === 'ATTACHMENT_DELETED' && (
                        <div className="al-tl-note">Attachment removed: <strong>{l.old_value}</strong></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mini calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ viewMonth, activeDays, selectedDate, onSelectDate, onPrev, onNext }) {
  const start = startOfMonth(viewMonth);
  const end   = endOfMonth(viewMonth);
  const days  = eachDayOfInterval({ start, end });
  const blanks = Array(getDay(start)).fill(null);

  return (
    <div className="al-calendar">
      <div className="al-cal-nav">
        <button onClick={onPrev}><ChevronLeft size={14} /></button>
        <span className="al-cal-month-label">{format(viewMonth, 'MMMM yyyy')}</span>
        <button onClick={onNext}><ChevronRight size={14} /></button>
      </div>
      <div className="al-cal-grid">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <span key={d} className="al-cal-dow">{d}</span>
        ))}
        {blanks.map((_, i) => <span key={`b${i}`} />)}
        {days.map(d => {
          const iso = format(d, 'yyyy-MM-dd');
          const active   = activeDays.includes(iso);
          const selected = selectedDate === iso;
          const today    = isToday(d);
          return (
            <button
              key={iso}
              className={['al-cal-day', active ? 'has-activity' : '', selected ? 'selected' : '', today ? 'today' : ''].filter(Boolean).join(' ')}
              onClick={() => onSelectDate(iso)}
            >
              {d.getDate()}
              {active && !selected && <span className="al-cal-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuditLogs() {
  const [activeTab,     setActiveTab]     = useState('ticket'); // 'ticket' | 'admin'
  const [selectedDate,  setSelectedDate]  = useState(format(new Date(), 'yyyy-MM-dd'));
  const [viewMonth,     setViewMonth]     = useState(new Date());
  const [logs,          setLogs]          = useState([]);
  const [summary,       setSummary]       = useState({ total: 0, employees: 0, ticketsTouched: 0 });
  const [activeDays,    setActiveDays]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [page,          setPage]          = useState(1);
  const [totalPages,    setTotalPages]    = useState(1);
  const [historyTicket, setHistoryTicket] = useState(null);
  const [search, setSearch] = useState('');
  const [retention, setRetention]           = useState({ enabled: false, retention_days: 30 });
  const [retentionDraft, setRetentionDraft] = useState({ enabled: false, retention_days: 30 });
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [showRetention, setShowRetention]   = useState(false);

  const LIMIT = 50;

  const load = useCallback(async (date, month, p = 1) => {
    setLoading(true);
    try {
      const yr  = format(month, 'yyyy');
      const mo  = format(month, 'M');
      const tz  = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const res = await api.get(`/audit?date=${date}&year=${yr}&month=${mo}&page=${p}&limit=${LIMIT}&tz=${tz}`);
      const d   = res.data;
      setLogs(d.logs);
      setSummary(d.summary);
      setActiveDays(d.activeDays || []);
      setTotalPages(d.pagination.pages || 1);
      setPage(p);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(selectedDate, viewMonth, 1); }, [selectedDate, viewMonth]);
  useEffect(() => { setSearch(''); }, [selectedDate]);
  useEffect(() => {
    api.get('/audit/retention').then(r => {
      const s = r.data.settings;
      setRetention(s);
      setRetentionDraft({ enabled: s.enabled, retention_days: s.retention_days });
    }).catch(() => {});
  }, []);

  const saveRetention = async () => {
    const days = parseInt(retentionDraft.retention_days);
    if (isNaN(days) || days < 1) { alert('Enter a valid number of days (min 1)'); return; }
    setRetentionSaving(true);
    try {
      const r = await api.put('/audit/retention', { enabled: retentionDraft.enabled, retention_days: days });
      setRetention(r.data.settings);
      setShowRetention(false);
    } catch { alert('Failed to save retention settings'); }
    finally { setRetentionSaving(false); }
  };

  const displayDate = selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : '—';

  const filteredLogs = search.trim()
    ? logs.filter(l => {
        const q = search.toLowerCase();
        return (l.employee_name || '').toLowerCase().includes(q)
            || (l.ticket_number || '').toLowerCase().includes(q);
      })
    : logs;

  const groupedEntries = groupLogs(filteredLogs);

  return (
    <div className="al-page">
      <div className="al-header">
        <div>
          <h1 className="al-title">Audit Logs</h1>
          <p className="al-sub">Full audit trail — ticket changes and admin portal activity</p>
        </div>
        <button className="al-retention-btn" onClick={() => { setRetentionDraft({ enabled: retention.enabled, retention_days: retention.retention_days }); setShowRetention(p => !p); }}>
          ⚙ Retention Policy
          {retention.enabled && <span className="al-retention-badge">{retention.retention_days}d</span>}
        </button>
      </div>

      {/* Tab switcher */}
      <div className="al-tabs">
        <button
          className={`al-tab${activeTab === 'ticket' ? ' al-tab-active' : ''}`}
          onClick={() => setActiveTab('ticket')}
        >
          <FileText size={14} /> Ticket Logs
        </button>
        <button
          className={`al-tab${activeTab === 'admin' ? ' al-tab-active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          <Shield size={14} /> Admin Logs
        </button>
      </div>

      {showRetention && (
        <div className="al-retention-panel">
          <div className="al-retention-title">Log Retention Policy</div>
          <p className="al-retention-desc">Automatically delete audit logs older than the specified period. Runs daily at server startup.</p>
          <div className="al-retention-row">
            <label className="al-retention-toggle">
              <input type="checkbox" checked={retentionDraft.enabled} onChange={e => setRetentionDraft(p => ({ ...p, enabled: e.target.checked }))} />
              <span>Enable auto-deletion</span>
            </label>
          </div>
          <div className="al-retention-presets">
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d} className={`al-preset-btn${retentionDraft.retention_days === d ? ' active' : ''}`} onClick={() => setRetentionDraft(p => ({ ...p, retention_days: d }))}>
                {d} days
              </button>
            ))}
          </div>
          <div className="al-retention-custom-row">
            <span>Custom:</span>
            <input
              type="number" min="1" max="3650"
              className="al-retention-input"
              value={retentionDraft.retention_days}
              onChange={e => setRetentionDraft(p => ({ ...p, retention_days: parseInt(e.target.value) || '' }))}
            />
            <span>days</span>
          </div>
          {retentionDraft.enabled && (
            <p className="al-retention-warn">⚠ Logs older than <strong>{retentionDraft.retention_days} days</strong> will be permanently deleted daily.</p>
          )}
          <div className="al-retention-actions">
            <button className="al-retention-cancel" onClick={() => setShowRetention(false)}>Cancel</button>
            <button className="al-retention-save" onClick={saveRetention} disabled={retentionSaving}>
              {retentionSaving ? 'Saving…' : 'Save Policy'}
            </button>
          </div>
        </div>
      )}

      <div className="al-body">
        {/* Sidebar */}
        <div className="al-sidebar">
          <MiniCalendar
            viewMonth={viewMonth}
            activeDays={activeDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onPrev={() => setViewMonth(m => subMonths(m, 1))}
            onNext={() => setViewMonth(m => addMonths(m, 1))}
          />
          <div className="al-day-summary">
            <p className="al-day-label">{displayDate}</p>
            <div className="al-stat-rows">
              <div className="al-stat-row">
                <span className="al-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Activity size={13} /></span>
                <span className="al-stat-text">{summary.total} actions</span>
              </div>
              <div className="al-stat-row">
                <span className="al-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><Users size={13} /></span>
                <span className="al-stat-text">{summary.employees} employee{summary.employees !== 1 ? 's' : ''} active</span>
              </div>
              <div className="al-stat-row">
                <span className="al-stat-icon" style={{ background: '#fdf4ff', color: '#9333ea' }}><FileText size={13} /></span>
                <span className="al-stat-text">{summary.ticketsTouched} ticket{summary.ticketsTouched !== 1 ? 's' : ''} touched</span>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Logs panel (replaces main table when on admin tab) */}
        {activeTab === 'admin' && (
          <AdminLogsPanel selectedDate={selectedDate} viewMonth={viewMonth} />
        )}

        {/* Ticket Logs main table */}
        {activeTab === 'ticket' && <div className="al-main">
          <div className="al-table-header">
            <span className="al-table-title">Activity on {displayDate}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 10px', minWidth: 220 }}>
                <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search by name or ticket..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ border: 'none', outline: 'none', fontSize: 12.5, background: 'transparent', width: '100%', color: '#374151' }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 0 }}>
                    <X size={12} />
                  </button>
                )}
              </div>
              {!loading && (
                <span className="al-count-chip">
                  {search ? `${filteredLogs.length} / ${summary.total}` : `${summary.total}`} events
                </span>
              )}
            </div>
          </div>

          <div className="al-table-scroll">
            <table className="al-tbl">
              <thead>
                <tr>
                  <th style={{ width: 68 }}>TIME</th>
                  <th style={{ width: 160 }}>EMPLOYEE</th>
                  <th style={{ width: 116 }}>TICKET</th>
                  <th style={{ width: 120 }}>ACTION</th>
                  <th>WHAT HAPPENED</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="al-empty">Loading…</td></tr>}
                {!loading && logs.length === 0 && (
                  <tr><td colSpan={5} className="al-empty">No activity on this date</td></tr>
                )}
                {!loading && logs.length > 0 && filteredLogs.length === 0 && (
                  <tr><td colSpan={5} className="al-empty">No results for "{search}"</td></tr>
                )}
                {groupedEntries.map((entry, i) => {
                  if (entry.type === 'created') {
                    return (
                      <tr key={entry.key} className={i % 2 === 0 ? '' : 'al-row-alt'}>
                        <CreatedGroupRow
                          entry={entry}
                          onTicketClick={setHistoryTicket}
                        />
                      </tr>
                    );
                  }
                  const l = entry.log;
                  const activity = buildActivity(l);
                  return (
                    <tr key={entry.key} className={i % 2 === 0 ? '' : 'al-row-alt'}>
                      <td className="al-td-time">
                        <Clock size={11} style={{ marginRight: 4, opacity: 0.5, flexShrink: 0 }} />
                        {l.created_at ? format(new Date(l.created_at), 'HH:mm') : '—'}
                      </td>
                      <td>
                        <div className="al-employee">
                          <span className="al-avatar">{(l.employee_name || '?')[0].toUpperCase()}</span>
                          <div>
                            <div className="al-emp-name">{l.employee_name || 'System'}</div>
                            <div className="al-emp-role">{l.employee_role || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {l.ticket_number ? (
                          <button className="al-ticket-btn" onClick={() => setHistoryTicket(l.ticket_number)} title="View full history">
                            {l.ticket_number}<History size={11} className="al-ticket-btn-icon" />
                          </button>
                        ) : '—'}
                      </td>
                      <td><ActionBadge action={l.action} /></td>
                      <td><ActivityCell activity={activity} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="al-pagination">
              <button disabled={page === 1} onClick={() => load(selectedDate, viewMonth, page - 1)}>
                <ChevronLeft size={13} /> Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => load(selectedDate, viewMonth, page + 1)}>
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>}
      </div>

      {/* Ticket history modal */}
      {historyTicket && (
        <TicketHistoryModal
          ticketNumber={historyTicket}
          onClose={() => setHistoryTicket(null)}
        />
      )}
    </div>
  );
}
