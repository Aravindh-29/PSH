import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../../components/Badge';
import api from '../../api/axios';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import './TicketList.css';

const STATUSES = ['NEW','OPEN','ASSIGNED','IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','CANCELLED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];
const LIMIT = 25;

function getPageWindow(current, total) {
  if (total <= 1) return [1];
  const delta = 2;
  const near = new Set([1, total]);
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) near.add(i);
  const sorted = Array.from(near).sort((a, b) => a - b);
  const result = [];
  let prev = null;
  for (const n of sorted) {
    if (prev !== null && n - prev > 1) result.push('...');
    result.push(n);
    prev = n;
  }
  return result;
}

export default function TicketList({ myTickets }) {
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', priority: '' });
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState(null);

  const fetchTickets = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: LIMIT });
      if (search) params.set('search', search);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (myTickets) params.set('myTickets', 'true');
      const res = await api.get(`/tickets?${params}`);
      setTickets(res.data.tickets);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(1); setPage(1); }, [search, filters]);
  useEffect(() => { fetchTickets(page); }, [page]);

  const confirmDelete = async () => {
    try {
      await api.delete(`/tickets/${deleteId}`);
      toast.success('Ticket deleted');
      setDeleteId(null);
      fetchTickets(page);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="ticket-list-page">
      <div className="tl-header">
        <div>
          <h1>{myTickets ? 'My Tickets' : 'All Tickets'}</h1>
          <p>{pagination.total} total tickets</p>
        </div>
        <Link to="/tickets/new" className="btn-create">
          <Plus size={15} /> New Ticket
        </Link>
      </div>

      <div className="tl-filters">
        <div className="tl-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search by ticket ID, subject, customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="tl-table-wrap">
        <table className="tl-table">
          <thead>
            <tr>
              <th>TICKET ID</th><th>SUBJECT</th><th>CUSTOMER</th>
              <th>PRIORITY</th><th>STATUS</th>
              <th>OWNER</th><th>CREATED BY</th>
              <th>UPDATED</th><th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="tl-empty">Loading...</td></tr>
            )}
            {!loading && tickets.length === 0 && (
              <tr><td colSpan={9} className="tl-empty">No tickets found</td></tr>
            )}
            {tickets.map(t => (
              <tr key={t.id}>
                <td><Link to={`/tickets/${t.id}`} className="ticket-id-link">{t.ticket_number}</Link></td>
                <td className="td-subj"><span>{t.short_description}</span></td>
                <td>{t.customer_name}</td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td><StatusBadge status={t.status} /></td>
                <td>
                  {t.ticket_owner_name
                    ? <div className="assigned-cell"><div className="mini-av">{t.ticket_owner_name[0]}</div>{t.ticket_owner_name}</div>
                    : <span style={{ color: '#94A3B8' }}>—</span>}
                </td>
                <td>
                  {t.created_by_name
                    ? <div className="assigned-cell"><div className="mini-av">{t.created_by_name[0]}</div>{t.created_by_name}</div>
                    : <span style={{ color: '#94A3B8' }}>—</span>}
                </td>
                <td className="td-updated">{t.updated_at ? formatDistanceToNow(new Date(t.updated_at), { addSuffix: true }) : '—'}</td>
                <td>
                  <div className="tl-actions">
                    <Link to={`/tickets/${t.id}`} className="tl-action-btn" title="View"><Eye size={14} /></Link>
                    <Link to={`/tickets/${t.id}/edit`} className="tl-action-btn" title="Edit"><Pencil size={14} /></Link>
                    <button className="tl-action-btn danger" title="Delete" onClick={() => setDeleteId(t.id)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="tl-pagination">
          <span className="tl-pag-info">
            Showing <strong>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, pagination.total)}</strong> of <strong>{pagination.total}</strong> tickets
          </span>
          <div className="tl-pag-pages">
            <button className="tl-pag-btn tl-pag-nav" disabled={page === 1} onClick={() => setPage(1)} title="First page">
              <ChevronsLeft size={13} />
            </button>
            <button className="tl-pag-btn tl-pag-nav" disabled={page === 1} onClick={() => setPage(p => p - 1)} title="Previous page">
              <ChevronLeft size={13} />
            </button>
            {getPageWindow(page, pagination.pages).map((pg, i) =>
              pg === '...'
                ? <span key={`el-${i}`} className="tl-pag-ellipsis">…</span>
                : <button
                    key={pg}
                    className={`tl-pag-btn${pg === page ? ' active' : ''}`}
                    onClick={() => setPage(pg)}
                  >
                    {pg}
                  </button>
            )}
            <button className="tl-pag-btn tl-pag-nav" disabled={page === pagination.pages} onClick={() => setPage(p => p + 1)} title="Next page">
              <ChevronRight size={13} />
            </button>
            <button className="tl-pag-btn tl-pag-nav" disabled={page === pagination.pages} onClick={() => setPage(pagination.pages)} title="Last page">
              <ChevronsRight size={13} />
            </button>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Delete Ticket</h3>
            <p>Are you sure you want to delete this ticket? This action cannot be easily undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
