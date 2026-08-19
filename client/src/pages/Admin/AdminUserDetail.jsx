import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Pencil, Search } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../../components/Badge';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import './Admin.css';

const STATUSES = ['NEW','OPEN','ASSIGNED','IN_PROGRESS','WORK_IN_PROGRESS','PENDING','ON_HOLD','RESOLVED','CLOSED','REOPENED','CANCELLED'];
const PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [ticketsLoading, setTicketsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', priority: '' });
  const [page, setPage] = useState(1);

  useEffect(() => {
    setUserLoading(true);
    api.get(`/users/${userId}`)
      .then(r => setUser(r.data.user))
      .catch(() => toast.error('User not found'))
      .finally(() => setUserLoading(false));
  }, [userId]);

  const fetchTickets = async (p = 1) => {
    setTicketsLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 20, createdBy: userId });
      if (search) params.set('search', search);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      const res = await api.get(`/tickets?${params}`);
      setTickets(res.data.tickets);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load tickets');
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => { setPage(1); fetchTickets(1); }, [userId, search, filters]);
  useEffect(() => { fetchTickets(page); }, [page]);

  if (userLoading) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  if (!user) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>User not found.</div>;

  return (
    <div className="admin-page">
      {/* Page header */}
      <div className="admin-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ud-back-btn" onClick={() => navigate('/admin/user-tickets')}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1A2B3C', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
              {user.full_name[0]}
            </div>
            <div>
              <h1 style={{ marginBottom: 3 }}>{user.full_name}</h1>
              <p style={{ margin: 0 }}>
                {user.email} &nbsp;·&nbsp; @{user.username} &nbsp;·&nbsp;
                <span className={`role-badge ${user.role}`}>{user.role}</span>
              </p>
            </div>
          </div>
        </div>
        <span className={`status-pill ${user.is_active ? 'active' : 'inactive'}`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stat cards */}
      <div className="ud-stat-cards">
        <div className="ud-stat-card">
          <div className="ud-stat-num">{user.ticket_count || 0}</div>
          <div className="ud-stat-label">Total Tickets</div>
        </div>
        <div className="ud-stat-card">
          <div className="ud-stat-num orange">{user.open_count || 0}</div>
          <div className="ud-stat-label">Open</div>
        </div>
        <div className="ud-stat-card">
          <div className="ud-stat-num green">{user.resolved_count || 0}</div>
          <div className="ud-stat-label">Resolved / Closed</div>
        </div>
        <div className="ud-stat-card">
          <div className="ud-stat-num red">{user.critical_count || 0}</div>
          <div className="ud-stat-label">Critical Priority</div>
        </div>
      </div>

      {/* Tickets table */}
      <div className="admin-table-card" style={{ marginTop: 20 }}>
        <div className="ud-tickets-header">
          <h2>Tickets by {user.full_name} <span style={{ color: '#94A3B8', fontWeight: 400 }}>({pagination.total})</span></h2>
          <div className="ud-filters">
            <div className="ud-search-wrap">
              <Search size={13} className="ud-search-icon" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="ud-search"
              />
            </div>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
            <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>TICKET ID</th>
              <th>SUBJECT</th>
              <th>CUSTOMER</th>
              <th>PRIORITY</th>
              <th>STATUS</th>
              <th>UPDATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {ticketsLoading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: '#94A3B8' }}>Loading...</td></tr>
            )}
            {!ticketsLoading && tickets.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: '#94A3B8' }}>No tickets found</td></tr>
            )}
            {tickets.map(t => (
              <tr key={t.id} className="ud-ticket-row">
                <td>
                  <Link to={`/tickets/${t.id}`} className="ud-ticket-link">{t.ticket_number}</Link>
                </td>
                <td className="ud-subj-cell">{t.short_description}</td>
                <td>{t.customer_name}</td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td><StatusBadge status={t.status} /></td>
                <td style={{ color: '#64748b', fontSize: '12.5px' }}>
                  {t.updated_at ? formatDistanceToNow(new Date(t.updated_at), { addSuffix: true }) : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link to={`/tickets/${t.id}`} className="toggle-btn ud-action-btn" title="View">
                      <Eye size={13} />
                    </Link>
                    <Link to={`/tickets/${t.id}/edit`} className="toggle-btn ud-action-btn" title="Edit">
                      <Pencil size={13} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pagination.pages > 1 && (
          <div className="ud-pagination">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span>Page {page} of {pagination.pages}</span>
            <button disabled={page === pagination.pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
