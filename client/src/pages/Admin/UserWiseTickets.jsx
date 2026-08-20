import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './Admin.css';

export default function UserWiseTickets() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/users?scope=with_tickets')
      .then(r => setUsers(r.data.users))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>User Wise Tickets</h1>
          <p>Browse tickets by user — click any user to view and manage their tickets</p>
        </div>
        <div className="uwt-search-wrap">
          <Search size={14} className="uwt-search-icon" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="uwt-search"
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94A3B8' }}>Loading users...</div>
      ) : (
        <div className="uwt-grid">
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px', color: '#94A3B8' }}>No users found</div>
          )}
          {filtered.map(u => (
            <div
              key={u.id}
              className="uwt-card"
              onClick={() => navigate(`/admin/user-tickets/${u.id}`)}
            >
              <div className="uwt-card-left">
                <div className="uwt-avatar">{u.full_name[0]}</div>
                <div className="uwt-user-info">
                  <div className="uwt-name">{u.full_name}</div>
                  <div className="uwt-meta">@{u.username} · {u.email}</div>
                </div>
              </div>

              <div className="uwt-card-right">
                <span className={`role-badge ${u.role}`}>{u.role}</span>
                {u.deleted_at
                  ? <span className="status-pill" style={{ background: '#fee2e2', color: '#dc2626' }}>Deleted</span>
                  : <span className={`status-pill ${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                }

                <div className="uwt-stats">
                  <div className="uwt-stat">
                    <div className="uwt-stat-num">{u.ticket_count || 0}</div>
                    <div className="uwt-stat-lbl">Total</div>
                  </div>
                  <div className="uwt-stat">
                    <div className="uwt-stat-num orange">{u.open_count || 0}</div>
                    <div className="uwt-stat-lbl">Open</div>
                  </div>
                  <div className="uwt-stat">
                    <div className="uwt-stat-num green">{u.resolved_count || 0}</div>
                    <div className="uwt-stat-lbl">Resolved</div>
                  </div>
                  <div className="uwt-stat">
                    <div className="uwt-stat-num red">{u.critical_count || 0}</div>
                    <div className="uwt-stat-lbl">Critical</div>
                  </div>
                </div>

                <ChevronRight size={16} className="uwt-chevron" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
