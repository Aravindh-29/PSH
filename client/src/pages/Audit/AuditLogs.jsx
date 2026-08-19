import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { format } from 'date-fns';
import './AuditLogs.css';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch recent audit logs by loading recent tickets and their audits
    api.get('/tickets?limit=10')
      .then(res => setLogs(res.data.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = d => d ? format(new Date(d), 'dd-MMM-yyyy HH:mm') : '—';

  return (
    <div className="audit-page">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Audit Logs</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Recent system activity and changes</p>
      </div>
      <div className="audit-table-card">
        <table className="audit-tbl">
          <thead><tr><th>TICKET</th><th>SUBJECT</th><th>CUSTOMER</th><th>STATUS</th><th>PRIORITY</th><th>LAST UPDATED</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Loading...</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>No activity yet</td></tr>}
            {logs.map(l => (
              <tr key={l.id}>
                <td style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 12.5 }}>{l.ticket_number}</td>
                <td>{l.short_description}</td>
                <td>{l.customer_name}</td>
                <td>{l.status}</td>
                <td>{l.priority}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(l.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
