import React, { useEffect, useState } from 'react';
import { CheckCircle2, History, RefreshCw, Search } from 'lucide-react';
import api from '../../api/axios';

const actionNames = {
  USER_CREATED: 'User created', USER_UPDATED: 'Account updated',
  USER_PASSWORD_RESET: 'Password changed', USER_MFA_RESET: 'MFA enrollment reset',
  USER_DELETED: 'User deleted',
};
const fieldNames = {
  username: 'Username', role: 'Role', old_role: 'Previous role',
  groupIds: 'Departments', managedGroupIds: 'Managed departments', isActive: 'Account active',
  mfaRequired: 'Require MFA', old_role_name: 'Previous role', role_name: 'Role',
};

export default function UserActivityHistory({ userId, roles, groups }) {
  const [events, setEvents] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [search, setSearch] = useState(''), [visibleCount, setVisibleCount] = useState(10);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    api.get(`/users/${userId}/activity`).then(({ data }) => {
      if (current) { setEvents(data.activity || []); setVisibleCount(10); }
    }).catch(e => {
      if (current) setError(e.response?.data?.message || 'Could not load activity. Please try again.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId, revision]);

  const displayValue = (key, value) => {
    if (value === null || value === undefined || value === '') return 'Not set';
    if (['role', 'old_role'].includes(key)) return roles.find(r => r.key === value)?.name || String(value);
    if (Array.isArray(value)) return value.length ? value.map(v => groups.find(g => g.id === v)?.name || (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') : 'None';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  };
  const actionName = event => actionNames[event.action] || event.action.replaceAll('_', ' ').toLowerCase();
  const query = search.trim().toLowerCase();
  const filtered = events.filter(event => !query || [actionName(event), event.actor_name || 'System',
    ...Object.entries(event.details || {}).map(([key, value]) => `${fieldNames[key] || key} ${displayValue(key, value)}`),
    JSON.stringify(event.details),
  ].join(' ').toLowerCase().includes(query));

  return <section className="rbac-user-activity" aria-label="User activity history">
    <div className="rbac-activity-heading"><div><h3>User activity</h3><p>Newest first · Up to 100 recent events</p></div><button type="button" className="cfg-btn-cancel" disabled={loading} onClick={() => setRevision(r => r + 1)}><RefreshCw size={14} aria-hidden="true"/>{loading ? 'Loading…' : 'Refresh'}</button></div>
    <div className="rbac-activity-search"><Search size={16} aria-hidden="true"/><input aria-label="Search user activity" placeholder="Search action, administrator or details…" value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(10); }}/>{search && <button type="button" className="cfg-btn-cancel" onClick={() => { setSearch(''); setVisibleCount(10); }}>Clear search</button>}</div>
    {error && <p role="alert" className="rbac-error">{error}</p>}
    <p className="rbac-activity-count" role="status">{loading ? 'Loading activity…' : `${filtered.length} ${filtered.length === 1 ? 'event' : 'events'}${search ? ' matching your search' : ''}`}</p>
    <div className="rbac-activity-scroll" role="region" aria-label="Scrollable activity timeline" tabIndex={0} aria-busy={loading}>
      {filtered.length ? <ol className="rbac-activity-timeline">{filtered.slice(0, visibleCount).map((event, index) => <li key={event.id || `${event.created_at}-${event.action}-${index}`}>
        <span className={'rbac-activity-icon' + (event.action.includes('PASSWORD') || event.action.includes('MFA') ? ' is-security' : '')}><CheckCircle2 size={16} aria-hidden="true"/></span>
        <div className="rbac-activity-event"><strong>{actionName(event)}</strong><p><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time><span> · {event.actor_name || 'System'}</span></p>
          {Object.keys(event.details || {}).length > 0 && <details><summary>View details</summary><dl>{Object.entries(event.details).map(([key, value]) => <div key={key}><dt>{fieldNames[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}</dt><dd>{displayValue(key, value)}</dd></div>)}</dl></details>}
        </div>
      </li>)}</ol> : !loading && !error && <div className="rbac-activity-empty"><History size={26} aria-hidden="true"/><p>{search ? 'No activity matches your search.' : 'No recorded administration activity.'}</p></div>}
      {visibleCount < filtered.length && <button type="button" className="cfg-btn-cancel rbac-activity-more" onClick={() => setVisibleCount(count => count + 10)}>Show 10 more ({filtered.length - visibleCount} remaining)</button>}
    </div>
    <p className="rbac-activity-footnote">Scroll to browse. Expand an event to see its details. Audit records are retained.</p>
  </section>;
}
