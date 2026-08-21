import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip as PieTooltip
} from 'recharts';
import {
  Plus, Eye, Calendar, TrendingUp, TrendingDown, ChevronDown,
  Ticket, AlertTriangle, ChevronRight, Users, ShieldCheck, LayoutList
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge, PriorityBadge } from '../../components/Badge';
import api from '../../api/axios';
import { formatDistanceToNow, format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import './Dashboard.css';

const DATE_PRESETS = [
  { label: 'All Tickets',  getRange: () => null },
  { label: 'Last 7 days',  getRange: () => ({ start: subDays(new Date(), 6), end: new Date() }) },
  { label: 'Last 14 days', getRange: () => ({ start: subDays(new Date(), 13), end: new Date() }) },
  { label: 'Last 30 days', getRange: () => ({ start: subDays(new Date(), 29), end: new Date() }) },
  { label: 'This month',   getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'Last month',   getRange: () => ({ start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }) },
];

const STAT_CONFIG = [
  { key: 'total',      chartKey: null,        label: 'Total Tickets', color: '#6366F1', bg: '#EEF2FF' },
  { key: 'open',       chartKey: 'Open',       label: 'Open',          color: '#10B981', bg: '#DCFCE7' },
  { key: 'inProgress', chartKey: 'InProgress', label: 'In Progress',   color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'pending',    chartKey: 'Pending',    label: 'Pending',       color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'resolved',   chartKey: 'Resolved',   label: 'Resolved',      color: '#14B8A6', bg: '#CCFBF1' },
  { key: 'closed',     chartKey: 'Closed',     label: 'Closed',        color: '#8B5CF6', bg: '#F3E8FF' },
];

const PRIORITY_SLA = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#10B981' };

function SparkLine({ data, color }) {
  const pts = data && data.length ? data : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts);
  const W = 80; const H = 28;
  const toX = i => (i / (pts.length - 1)) * W;
  const toY = v => H - ((v - min) / (max - min + 0.001)) * (H * 0.85);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [stats, setStats]           = useState(null);
  const [trends, setTrends]         = useState({});
  const [chartData, setChartData]   = useState([]);
  const [slaBreaches, setSlaBreaches] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading]       = useState(true);

  const [dateRange, setDateRange]   = useState(null); // null = All Tickets
  const [showPicker, setShowPicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]   = useState('');
  const pickerRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateRange) {
      params.set('startDate', format(dateRange.start, 'yyyy-MM-dd'));
      params.set('endDate',   format(dateRange.end,   'yyyy-MM-dd'));
    }
    api.get(`/dashboard?${params}`)
      .then(res => {
        setStats(res.data.stats);
        setTrends(res.data.trends || {});
        setChartData(res.data.chartData || []);
        setSlaBreaches(res.data.slaBreaches || []);
        setRecentTickets(res.data.recentTickets || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateRange]);

  const applyPreset = (preset) => {
    setDateRange(preset.getRange());
    setShowPicker(false);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    setDateRange({ start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') });
    setShowPicker(false);
  };

  const displayStats = stats || { total: 0, open: 0, inProgress: 0, pending: 0, resolved: 0, closed: 0, critical: 0, high: 0, medium: 0, low: 0 };

  const priorityData = [
    { name: 'Critical', value: displayStats.critical, color: '#EF4444' },
    { name: 'High',     value: displayStats.high,     color: '#F97316' },
    { name: 'Medium',   value: displayStats.medium,   color: '#F59E0B' },
    { name: 'Low',      value: displayStats.low,      color: '#10B981' },
  ].filter(d => d.value > 0);

  const dateRangeLabel = dateRange
    ? `${format(dateRange.start, 'MMM d')} – ${format(dateRange.end, 'MMM d, yyyy')}`
    : 'All Tickets';
  const activePreset = DATE_PRESETS.find(p => {
    const r = p.getRange();
    if (r === null && dateRange === null) return true;
    if (!r || !dateRange) return false;
    return format(r.start, 'yyyy-MM-dd') === format(dateRange.start, 'yyyy-MM-dd')
        && format(r.end,   'yyyy-MM-dd') === format(dateRange.end,   'yyyy-MM-dd');
  });

  // Quick actions — different per role
  const quickActions = isAdmin ? [
    { label: 'Create New Ticket',  to: '/tickets/new',          icon: Plus },
    { label: 'User Wise Tickets',  to: '/admin/user-tickets',   icon: LayoutList },
    { label: 'User Management',    to: '/admin/users',           icon: Users },
    { label: 'Audit Logs',         to: '/audit-logs',            icon: ShieldCheck },
  ] : [
    { label: 'Create New Ticket',  to: '/tickets/new',          icon: Plus },
    { label: 'My Tickets',         to: '/my-tickets',            icon: Ticket },
    { label: 'My Pending',         to: '/my-tickets',            icon: AlertTriangle, badge: displayStats.pending || null },
  ];

  // Sparkline data per stat
  const getSparkData = (chartKey) => {
    if (!chartData.length) return [];
    if (!chartKey) return chartData.map(d => (d.Open || 0) + (d.InProgress || 0) + (d.Pending || 0) + (d.Resolved || 0) + (d.Closed || 0));
    return chartData.map(d => d[chartKey] || 0);
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-welcome">Welcome back, {user?.fullName?.split(' ')[0]}! 👋</h1>
          <p className="dash-sub">
            {isAdmin
              ? "Here's an overview of all tickets across the system."
              : "Here's what's happening with your tickets today."}
          </p>
        </div>
        <div className="dash-header-right">
          <div className="date-picker-wrap" ref={pickerRef}>
            <button className="date-picker-btn" onClick={() => setShowPicker(p => !p)}>
              <Calendar size={14} />
              <span>{dateRangeLabel}</span>
              <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.6 }} />
            </button>
            {showPicker && (
              <div className="date-picker-dropdown">
                <div className="date-picker-presets">
                  {DATE_PRESETS.map(p => (
                    <button
                      key={p.label}
                      className={`date-preset-btn${activePreset?.label === p.label ? ' active' : ''}`}
                      onClick={() => applyPreset(p)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="date-picker-divider" />
                <div className="date-picker-custom">
                  <p className="date-custom-label">Custom range</p>
                  <div className="date-custom-row">
                    <label>From</label>
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd || format(new Date(), 'yyyy-MM-dd')}
                      onChange={e => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div className="date-custom-row">
                    <label>To</label>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart}
                      max={format(new Date(), 'yyyy-MM-dd')}
                      onChange={e => setCustomEnd(e.target.value)}
                    />
                  </div>
                  <button
                    className="date-apply-btn"
                    disabled={!customStart || !customEnd}
                    onClick={applyCustom}
                  >
                    Apply Range
                  </button>
                </div>
              </div>
            )}
          </div>
          <Link to="/tickets/new" className="btn-create-ticket">
            <Plus size={16} />
            Create New Ticket
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="dash-stats">
        {STAT_CONFIG.map(cfg => {
          const trend = trends[cfg.key] || { change: 0, up: true };
          const sparkData = getSparkData(cfg.chartKey);
          return (
            <div key={cfg.key} className="stat-card">
              <div className="stat-card-top">
                <div className="stat-icon" style={{ background: cfg.bg, color: cfg.color }}>
                  <Ticket size={18} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">{cfg.label}</div>
                  <div className="stat-value">{loading ? '—' : (displayStats[cfg.key] ?? 0).toLocaleString()}</div>
                  <div className={`stat-change ${trend.up ? 'up' : 'down'}`}>
                    {trend.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {trend.up ? '+' : '-'}{trend.change}%
                    <span className="stat-vs">vs last 7 days</span>
                  </div>
                </div>
              </div>
              <div className="stat-sparkline">
                <SparkLine data={sparkData} color={cfg.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Middle Row */}
      <div className="dash-middle">
        {/* Line Chart */}
        <div className="dash-chart-card">
          <div className="dash-card-header">
            <h3>Tickets Overview — {activePreset ? activePreset.label : dateRange ? `${format(dateRange.start, 'MMM d')} – ${format(dateRange.end, 'MMM d, yyyy')}` : 'All Time'}</h3>
          </div>
          <div className="dash-chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Open"       stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="InProgress" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Pending"    stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Resolved"   stroke="#14B8A6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Closed"     stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="dash-donut-card">
          <div className="dash-card-header">
            <h3>Tickets by Priority</h3>
          </div>
          <div className="donut-wrap">
            <div style={{ position: 'relative' }}>
              <PieChart width={180} height={180}>
                <Pie
                  data={priorityData.length ? priorityData : [{ name: 'No data', value: 1, color: '#E2E8F0' }]}
                  cx={90} cy={90} innerRadius={55} outerRadius={82}
                  paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}
                >
                  {(priorityData.length ? priorityData : [{ color: '#E2E8F0' }]).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <PieTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              </PieChart>
              <div className="donut-center">
                <div className="donut-total">{displayStats.total.toLocaleString()}</div>
                <div className="donut-label">Total</div>
              </div>
            </div>
            <div className="donut-legend">
              {[
                { label: 'Critical', value: displayStats.critical, color: '#EF4444' },
                { label: 'High',     value: displayStats.high,     color: '#F97316' },
                { label: 'Medium',   value: displayStats.medium,   color: '#F59E0B' },
                { label: 'Low',      value: displayStats.low,      color: '#10B981' },
              ].map(item => (
                <div key={item.label} className="donut-legend-item">
                  <span className="donut-dot" style={{ background: item.color }} />
                  <span className="donut-legend-label">{item.label}</span>
                  <span className="donut-legend-val">
                    {item.value} ({displayStats.total ? ((item.value / displayStats.total) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="dash-right-panel">
          {/* Quick Actions */}
          <div className="dash-panel-card">
            <h3 className="panel-title">Quick Actions</h3>
            {quickActions.map(({ label, to, icon: Icon, badge }) => (
              <Link key={label} to={to} className="quick-action-item">
                <div className="qa-icon"><Icon size={15} /></div>
                <span>{label}</span>
                {badge ? <span className="qa-badge">{badge}</span> : null}
                <ChevronRight size={14} className="qa-chevron" />
              </Link>
            ))}
          </div>

          {/* SLA Breaches */}
          <div className="dash-panel-card">
            <div className="panel-header">
              <h3 className="panel-title">SLA Breaches</h3>
              <Link to="/my-tickets" className="view-all">View all</Link>
            </div>
            {slaBreaches.length === 0 && !loading && (
              <div style={{ fontSize: 13, color: '#94A3B8', padding: '8px 0' }}>No SLA breaches 🎉</div>
            )}
            {slaBreaches.map(b => (
              <Link key={b.id} to={`/tickets/${b.ticketId}`} className="sla-item" style={{ textDecoration: 'none' }}>
                <AlertTriangle size={14} color={PRIORITY_SLA[b.priority] || '#EF4444'} style={{ flexShrink: 0, marginTop: 2 }} />
                <div className="sla-info">
                  <div className="sla-id" style={{ color: PRIORITY_SLA[b.priority] }}>{b.id}</div>
                  <div className="sla-title">{b.title}</div>
                </div>
                <div className="sla-time">
                  <div>{b.time}</div>
                  <div className="sla-overdue">Overdue</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="dash-recent">
        <div className="dash-card-header">
          <h3>{isAdmin ? 'Recent Tickets (All Users)' : 'My Recent Tickets'}</h3>
          <Link to="/my-tickets" className="view-all">View all →</Link>
        </div>
        <div className="recent-table-wrap">
          <table className="recent-table">
            <thead>
              <tr>
                <th>TICKET ID</th><th>SUBJECT</th><th>CUSTOMER</th>
                <th>PRIORITY</th><th>STATUS</th>
                <th>OWNER</th><th>CREATED BY</th>
                <th>UPDATED</th><th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.length === 0 && !loading && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>No tickets yet</td></tr>
              )}
              {recentTickets.map(t => (
                <tr key={t.id}>
                  <td><Link to={`/tickets/${t.id}`} className="ticket-id-link">{t.ticket_number}</Link></td>
                  <td className="td-subject"><span className="truncate">{t.short_description}</span></td>
                  <td>{t.customer_name}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>
                    <div className="assigned-cell">
                      <div className="mini-avatar">{(t.ticket_owner_name || '?')[0]}</div>
                      <span>{t.ticket_owner_name || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="assigned-cell">
                      <div className="mini-avatar">{(t.created_by_name || '?')[0]}</div>
                      <span>{t.created_by_name || '—'}</span>
                    </div>
                  </td>
                  <td className="td-updated">
                    {t.updated_at ? formatDistanceToNow(new Date(t.updated_at), { addSuffix: true }) : '—'}
                  </td>
                  <td>
                    <div className="action-btns">
                      <Link to={`/tickets/${t.id}`} className="action-btn" title="View"><Eye size={14} /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
