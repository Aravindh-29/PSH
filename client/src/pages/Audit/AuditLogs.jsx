import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
         getDay, isToday, subMonths, addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Users, FileText, Activity,
         Clock, X, ArrowRight, History, Search } from 'lucide-react';
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

const FIELD_LABELS = {
  status: 'Status', priority: 'Priority', impact: 'Impact', urgency: 'Urgency',
  short_description: 'Short Description', customer_name: 'Customer',
  description: 'Description', ticket_owner: 'Owner', category_id: 'Category',
  assigned_to: 'Assigned To', custom_data: 'Custom Fields',
};
const fieldLabel = (f) => f ? (FIELD_LABELS[f] || f.replace(/_/g, ' ')) : '—';

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

  const displayDate = selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : '—';

  const filteredLogs = search.trim()
    ? logs.filter(l => {
        const q = search.toLowerCase();
        return (l.employee_name || '').toLowerCase().includes(q)
            || (l.ticket_number || '').toLowerCase().includes(q);
      })
    : logs;

  return (
    <div className="al-page">
      <div className="al-header">
        <div>
          <h1 className="al-title">Audit Logs</h1>
          <p className="al-sub">Track every employee action — ticket created, field modified, attachment changed</p>
        </div>
      </div>

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

        {/* Main table */}
        <div className="al-main">
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
                  {search ? `${filteredLogs.length} / ${summary.total}` : `${summary.total}`} entries
                </span>
              )}
            </div>
          </div>

          <div className="al-table-scroll">
            <table className="al-tbl">
              <thead>
                <tr>
                  <th style={{ width: 72 }}>TIME</th>
                  <th style={{ width: 160 }}>EMPLOYEE</th>
                  <th style={{ width: 110 }}>ACTION</th>
                  <th style={{ width: 120 }}>TICKET</th>
                  <th style={{ width: 130 }}>FIELD</th>
                  <th>OLD VALUE</th>
                  <th>NEW VALUE</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="al-empty">Loading…</td></tr>}
                {!loading && logs.length === 0 && (
                  <tr><td colSpan={7} className="al-empty">No activity on this date</td></tr>
                )}
                {!loading && logs.length > 0 && filteredLogs.length === 0 && (
                  <tr><td colSpan={7} className="al-empty">No results for "{search}"</td></tr>
                )}
                {filteredLogs.map((l, i) => (
                  <tr key={l.id || i} className={i % 2 === 0 ? '' : 'al-row-alt'}>
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
                    <td><ActionBadge action={l.action} /></td>
                    <td>
                      {l.ticket_number ? (
                        <button
                          className="al-ticket-btn"
                          onClick={() => setHistoryTicket(l.ticket_number)}
                          title="Click to view full history"
                        >
                          {l.ticket_number}
                          <History size={11} className="al-ticket-btn-icon" />
                        </button>
                      ) : '—'}
                    </td>
                    <td className="al-td-field">{fieldLabel(l.field_name)}</td>
                    <td className="al-td-val al-td-old">{l.old_value || <span className="al-nil">—</span>}</td>
                    <td className="al-td-val al-td-new">{l.new_value || <span className="al-nil">—</span>}</td>
                  </tr>
                ))}
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
        </div>
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
