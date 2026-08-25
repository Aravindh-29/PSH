import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Search } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { format, subDays, startOfMonth } from 'date-fns';
import '../Dashboard/Dashboard.css';
import './MyQuery.css';

const QA_STATUSES = [
  { key: 'NEW',              label: 'New',              color: '#6366F1', bg: '#EEF2FF' },
  { key: 'OPEN',             label: 'Open',             color: '#10B981', bg: '#DCFCE7' },
  { key: 'ASSIGNED',         label: 'Assigned',         color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'IN_PROGRESS',      label: 'In Progress',      color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'WORK_IN_PROGRESS', label: 'Work In Progress', color: '#F97316', bg: '#FFF7ED' },
  { key: 'PENDING',          label: 'Pending',          color: '#64748B', bg: '#F1F5F9' },
  { key: 'ON_HOLD',          label: 'On Hold',          color: '#8B5CF6', bg: '#F5F3FF' },
  { key: 'RESOLVED',         label: 'Resolved',         color: '#14B8A6', bg: '#CCFBF1' },
  { key: 'CLOSED',           label: 'Closed',           color: '#475569', bg: '#F8FAFC' },
  { key: 'REOPENED',         label: 'Reopened',         color: '#EF4444', bg: '#FEF2F2' },
  { key: 'CANCELLED',        label: 'Cancelled',        color: '#94A3B8', bg: '#F8FAFC' },
];

const QA_TABS = [
  { label: 'Today',       getRange: () => { const t = new Date(); return { start: t, end: t }; } },
  { label: 'Last 7 Days', getRange: () => ({ start: subDays(new Date(), 6), end: new Date() }) },
  { label: 'This Month',  getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'All Time',    getRange: () => null },
];
const CUSTOM_TAB = 4;

export default function MyQuery() {
  const [activeTab, setActiveTab]     = useState(3); // default: All Time
  const [customRange, setCustomRange] = useState(null);
  const [showCustom, setShowCustom]   = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [counts, setCounts]           = useState({});
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const customRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (customRef.current && !customRef.current.contains(e.target)) setShowCustom(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const dr = activeTab === CUSTOM_TAB ? customRange : QA_TABS[activeTab]?.getRange?.() ?? null;
    setLoading(true);
    const params = new URLSearchParams();
    if (dr) {
      params.set('startDate', format(dr.start, 'yyyy-MM-dd'));
      params.set('endDate',   format(dr.end,   'yyyy-MM-dd'));
    }
    api.get(`/dashboard/query?${params}`)
      .then(r => {
        setCounts(r.data.counts || {});
        setTotal(Number(r.data.total) || 0);
      })
      .catch(() => toast.error('Failed to load query data'))
      .finally(() => setLoading(false));
  }, [activeTab, customRange]);

  const buildLink = (statusKey) => {
    const dr = activeTab === CUSTOM_TAB ? customRange : QA_TABS[activeTab]?.getRange?.() ?? null;
    const p = new URLSearchParams({ status: statusKey });
    if (dr) {
      p.set('startDate', format(dr.start, 'yyyy-MM-dd'));
      p.set('endDate',   format(dr.end,   'yyyy-MM-dd'));
    }
    return `/my-tickets?${p}`;
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    setCustomRange({ start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') });
    setActiveTab(CUSTOM_TAB);
    setShowCustom(false);
  };

  const knownKeys = new Set(QA_STATUSES.map(s => s.key));
  const extras = Object.keys(counts)
    .filter(k => !knownKeys.has(k))
    .map(k => ({ key: k, label: k.replace(/_/g, ' '), color: '#94A3B8', bg: '#F8FAFC' }));
  const allStatuses = [...QA_STATUSES, ...extras];

  const customLabel = activeTab === CUSTOM_TAB && customRange
    ? `${format(customRange.start, 'MMM d')} – ${format(customRange.end, 'MMM d')}`
    : 'Custom';

  const activeRange = activeTab === CUSTOM_TAB ? customRange : QA_TABS[activeTab]?.getRange?.() ?? null;
  const rangeLabel = activeRange
    ? `${format(activeRange.start, 'MMM d, yyyy')} – ${format(activeRange.end, 'MMM d, yyyy')}`
    : 'All time';

  return (
    <div className="myquery-page">
      {/* Page header */}
      <div className="myquery-header">
        <div className="myquery-header-left">
          <div className="myquery-icon"><Search size={20} /></div>
          <div>
            <h1 className="myquery-title">My Query</h1>
            <p className="myquery-sub">Your ticket counts by status · {rangeLabel}</p>
          </div>
        </div>

        {/* Date tabs */}
        <div className="dash-query-tabs">
          {QA_TABS.map((tab, i) => (
            <button
              key={tab.label}
              className={`dash-query-tab ${activeTab === i ? 'active' : ''}`}
              onClick={() => { setActiveTab(i); setShowCustom(false); }}
            >
              {tab.label}
            </button>
          ))}
          <div className="dq-custom-wrap" ref={customRef}>
            <button
              className={`dash-query-tab ${activeTab === CUSTOM_TAB ? 'active' : ''}`}
              onClick={() => setShowCustom(s => !s)}
            >
              <Calendar size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {customLabel}
            </button>
            {showCustom && (
              <div className="dq-custom-picker">
                <div className="dq-custom-row">
                  <label>From</label>
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div className="dq-custom-row">
                  <label>To</label>
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
                <button className="dq-custom-apply" onClick={applyCustom} disabled={!customStart || !customEnd}>
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="myquery-card">
        <div className="dash-query-table-wrap">
          <table className="dash-query-table">
            <thead>
              <tr>
                {allStatuses.map(s => (
                  <th key={s.key}>
                    <span className="dq-th-pill" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                  </th>
                ))}
                <th><span className="dq-th-pill dq-th-total">Total</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {allStatuses.map(s => {
                  const n = counts[s.key] || 0;
                  return (
                    <td key={s.key}>
                      {n > 0 ? (
                        <Link to={buildLink(s.key)} className="dq-count" style={{ color: s.color }}>
                          {n}
                        </Link>
                      ) : (
                        <span className="dq-count dq-zero">0</span>
                      )}
                    </td>
                  );
                })}
                <td>
                  <span className="dq-count dq-total-val">
                    {loading ? '—' : total}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {!loading && total === 0 && (
          <div className="myquery-empty">No tickets found for this period.</div>
        )}
      </div>
    </div>
  );
}
