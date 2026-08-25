import React, { useEffect, useState } from 'react';
import { Clock, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ShieldAlert } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import './AdminSLA.css';

const ALL_STATUSES = [
  { value: 'NEW',              label: 'New' },
  { value: 'OPEN',             label: 'Open' },
  { value: 'ASSIGNED',         label: 'Assigned' },
  { value: 'IN_PROGRESS',      label: 'In Progress' },
  { value: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
  { value: 'PENDING',          label: 'Pending' },
  { value: 'ON_HOLD',          label: 'On Hold' },
  { value: 'RESOLVED',         label: 'Resolved' },
  { value: 'CLOSED',           label: 'Closed' },
  { value: 'REOPENED',         label: 'Reopened' },
  { value: 'CANCELLED',        label: 'Cancelled' },
];

function minutesToHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { h, m };
}
function hmToMinutes(h, m) {
  return parseInt(h || 0) * 60 + parseInt(m || 0);
}

function SLAModal({ sla, startStatus, onSave, onClose }) {
  const existing = sla || null;
  const init = existing ? minutesToHM(existing.duration_minutes) : { h: 8, m: 0 };

  const [name,            setName]            = useState(existing?.name             || `${startStatus} SLA`);
  const [description,     setDescription]     = useState(existing?.description      || '');
  const [hours,           setHours]           = useState(init.h);
  const [mins,            setMins]            = useState(init.m);
  const [stopStatuses,    setStopStatuses]    = useState(existing?.stop_statuses    || ['RESOLVED','CLOSED','CANCELLED']);
  const [pauseStatuses,   setPauseStatuses]   = useState(existing?.pause_statuses   || ['ON_HOLD','PENDING']);
  const [warnPct,         setWarnPct]         = useState(existing?.warn_pct         ?? 50);
  const [criticalPct,     setCriticalPct]     = useState(existing?.critical_pct     ?? 75);
  const [notifyWarn,      setNotifyWarn]      = useState(existing?.notify_on_warn   ?? true);
  const [notifyCritical,  setNotifyCritical]  = useState(existing?.notify_on_critical ?? true);
  const [notifyBreach,    setNotifyBreach]    = useState(existing?.notify_on_breach  ?? true);
  const [saving, setSaving] = useState(false);

  const toggleStop  = v => setStopStatuses(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  const togglePause = v => setPauseStatuses(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);

  const save = async () => {
    const durationMinutes = hmToMinutes(hours, mins);
    if (!name.trim()) return toast.error('Name is required');
    if (durationMinutes < 1) return toast.error('Duration must be at least 1 minute');
    if (warnPct >= criticalPct) return toast.error('Warning % must be less than Critical %');

    setSaving(true);
    try {
      const payload = {
        name: name.trim(), description,
        start_status: startStatus,
        stop_statuses: stopStatuses, pause_statuses: pauseStatuses,
        duration_minutes: durationMinutes,
        warn_pct: warnPct, critical_pct: criticalPct,
        notify_on_warn: notifyWarn, notify_on_critical: notifyCritical, notify_on_breach: notifyBreach,
        is_active: true,
      };
      if (existing?.id) {
        await api.put(`/sla/definitions/${existing.id}`, payload);
      } else {
        await api.post('/sla/definitions', payload);
      }
      toast.success(existing ? 'SLA updated' : 'SLA created');
      onSave();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sla-modal-overlay" onClick={onClose}>
      <div className="sla-modal" onClick={e => e.stopPropagation()}>
        <div className="sla-modal-header">
          <Clock size={18} />
          <h3>{existing ? 'Edit SLA' : 'Configure SLA'} — <em>{ALL_STATUSES.find(s => s.value === startStatus)?.label || startStatus}</em></h3>
          <button className="sla-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="sla-modal-body">
          <div className="sla-form-row">
            <label>SLA Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Incident Resolution Time" />
          </div>

          <div className="sla-form-row">
            <label>Description <span className="sla-optional">(optional)</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" />
          </div>

          <div className="sla-form-row">
            <label>Duration <span className="sla-hint">(max time allowed in this status)</span></label>
            <div className="sla-duration-wrap">
              <input type="number" min="0" max="999" value={hours} onChange={e => setHours(e.target.value)} className="sla-num" />
              <span>hrs</span>
              <input type="number" min="0" max="59" value={mins}  onChange={e => setMins(e.target.value)}  className="sla-num" />
              <span>min</span>
              <span className="sla-duration-preview">
                = {hmToMinutes(hours, mins) >= 60
                  ? `${Math.floor(hmToMinutes(hours, mins)/60)}h ${hmToMinutes(hours, mins)%60}m`
                  : `${hmToMinutes(hours, mins)}m`}
              </span>
            </div>
          </div>

          <div className="sla-form-two-col">
            <div className="sla-form-row">
              <label>Stop conditions <span className="sla-hint">(SLA completes)</span></label>
              <div className="sla-check-grid">
                {ALL_STATUSES.filter(s => s.value !== startStatus).map(s => (
                  <label key={s.value} className="sla-chk">
                    <input type="checkbox" checked={stopStatuses.includes(s.value)} onChange={() => toggleStop(s.value)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="sla-form-row">
              <label>Pause conditions <span className="sla-hint">(clock stops temporarily)</span></label>
              <div className="sla-check-grid">
                {ALL_STATUSES.filter(s => s.value !== startStatus && !stopStatuses.includes(s.value)).map(s => (
                  <label key={s.value} className="sla-chk">
                    <input type="checkbox" checked={pauseStatuses.includes(s.value)} onChange={() => togglePause(s.value)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="sla-form-two-col">
            <div className="sla-form-row">
              <label>Warning threshold</label>
              <div className="sla-pct-wrap">
                <input type="range" min="10" max="90" step="5" value={warnPct} onChange={e => setWarnPct(+e.target.value)} className="sla-range sla-range-warn" />
                <span className="sla-pct-val sla-warn-val">{warnPct}%</span>
              </div>
            </div>
            <div className="sla-form-row">
              <label>Critical threshold</label>
              <div className="sla-pct-wrap">
                <input type="range" min="20" max="99" step="5" value={criticalPct} onChange={e => setCriticalPct(+e.target.value)} className="sla-range sla-range-crit" />
                <span className="sla-pct-val sla-crit-val">{criticalPct}%</span>
              </div>
            </div>
          </div>

          <div className="sla-form-row">
            <label>Email notifications</label>
            <div className="sla-notify-row">
              <label className="sla-chk">
                <input type="checkbox" checked={notifyWarn} onChange={e => setNotifyWarn(e.target.checked)} />
                Warning ({warnPct}%)
              </label>
              <label className="sla-chk">
                <input type="checkbox" checked={notifyCritical} onChange={e => setNotifyCritical(e.target.checked)} />
                Critical ({criticalPct}%)
              </label>
              <label className="sla-chk">
                <input type="checkbox" checked={notifyBreach} onChange={e => setNotifyBreach(e.target.checked)} />
                Breach (100%)
              </label>
            </div>
          </div>
        </div>

        <div className="sla-modal-footer">
          <button className="sla-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="sla-btn-save" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Update SLA' : 'Create SLA'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSLA() {
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modalStatus, setModalStatus] = useState(null); // the start_status being configured
  const [editSLA, setEditSLA]         = useState(null); // existing SLA being edited
  const [deleteId, setDeleteId]       = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/sla/definitions')
      .then(r => setDefinitions(r.data.definitions || []))
      .catch(() => toast.error('Failed to load SLA definitions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    try {
      await api.delete(`/sla/definitions/${deleteId}`);
      toast.success('SLA disabled');
      setDeleteId(null);
      load();
    } catch { toast.error('Failed to disable SLA'); }
  };

  const toggleActive = async (def) => {
    try {
      await api.put(`/sla/definitions/${def.id}`, { ...def, is_active: !def.is_active });
      toast.success(def.is_active ? 'SLA disabled' : 'SLA enabled');
      load();
    } catch { toast.error('Failed to update SLA'); }
  };

  // Group definitions by start_status for easy lookup
  const byStatus = {};
  for (const d of definitions) {
    if (!byStatus[d.start_status]) byStatus[d.start_status] = [];
    byStatus[d.start_status].push(d);
  }

  return (
    <div className="admin-sla">
      <div className="sla-page-header">
        <div className="sla-page-header-left">
          <ShieldAlert size={20} className="sla-page-icon" />
          <div>
            <div className="sla-page-title">SLA Configuration</div>
            <div className="sla-page-sub">Define time limits for each ticket status. Breaches trigger alerts and emails.</div>
          </div>
        </div>
      </div>

      <div className="sla-status-grid">
        {ALL_STATUSES.map(status => {
          const defs = byStatus[status.value] || [];
          const activeDef = defs.find(d => d.is_active);
          const anyDef = defs[0];

          return (
            <div key={status.value} className={`sla-status-card ${activeDef ? 'sla-card-active' : ''}`}>
              <div className="sla-card-top">
                <span className="sla-status-pill">{status.label}</span>
                {activeDef && (
                  <span className="sla-card-configured-badge">SLA Active</span>
                )}
              </div>

              {activeDef ? (
                <div className="sla-card-def">
                  <div className="sla-card-def-name">{activeDef.name}</div>
                  <div className="sla-card-def-duration">
                    <Clock size={12} />
                    {minutesToHM(activeDef.duration_minutes).h > 0
                      ? `${minutesToHM(activeDef.duration_minutes).h}h ${minutesToHM(activeDef.duration_minutes).m}m`
                      : `${activeDef.duration_minutes}m`}
                  </div>
                  <div className="sla-card-thresholds">
                    <span className="sla-thresh warn">⚠ {activeDef.warn_pct}%</span>
                    <span className="sla-thresh crit">🔴 {activeDef.critical_pct}%</span>
                  </div>
                  <div className="sla-card-actions">
                    <button className="sla-card-btn edit" onClick={() => { setEditSLA(activeDef); setModalStatus(status.value); }}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="sla-card-btn toggle" onClick={() => toggleActive(activeDef)}>
                      {activeDef.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                      {activeDef.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sla-card-empty">
                  <span>No SLA configured</span>
                  <button className="sla-card-btn add" onClick={() => { setEditSLA(null); setModalStatus(status.value); }}>
                    <Plus size={13} /> Assign SLA
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All defined SLAs table */}
      {definitions.length > 0 && (
        <div className="sla-table-section">
          <h4 className="sla-table-title">All SLA Definitions</h4>
          <div className="sla-table-wrap">
            <table className="sla-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Starts When</th>
                  <th>Duration</th>
                  <th>Stop Conditions</th>
                  <th>Warn / Critical</th>
                  <th>Emails</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map(d => {
                  const { h, m } = minutesToHM(d.duration_minutes);
                  return (
                    <tr key={d.id} className={!d.is_active ? 'sla-row-inactive' : ''}>
                      <td className="sla-td-name">{d.name}</td>
                      <td><span className="sla-status-pill sla-pill-sm">{d.start_status.replace(/_/g,' ')}</span></td>
                      <td className="sla-td-dur">{h > 0 ? `${h}h ${m}m` : `${d.duration_minutes}m`}</td>
                      <td className="sla-td-stops">
                        {(d.stop_statuses || []).map(s => (
                          <span key={s} className="sla-pill-tag">{s.replace(/_/g,' ')}</span>
                        ))}
                      </td>
                      <td className="sla-td-thresh">
                        <span className="sla-thresh warn">⚠ {d.warn_pct}%</span>
                        <span className="sla-thresh crit">🔴 {d.critical_pct}%</span>
                      </td>
                      <td className="sla-td-notify">
                        {d.notify_on_warn    && <span className="sla-notify-dot warn"  title="Email on warn">W</span>}
                        {d.notify_on_critical && <span className="sla-notify-dot crit" title="Email on critical">C</span>}
                        {d.notify_on_breach  && <span className="sla-notify-dot breach" title="Email on breach">B</span>}
                      </td>
                      <td>
                        <span className={`sla-status-badge ${d.is_active ? 'active' : 'inactive'}`}>
                          {d.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="sla-td-actions">
                        <button className="sla-tbl-btn" onClick={() => { setEditSLA(d); setModalStatus(d.start_status); }} title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button className="sla-tbl-btn danger" onClick={() => setDeleteId(d.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SLA Modal */}
      {modalStatus && (
        <SLAModal
          sla={editSLA}
          startStatus={modalStatus}
          onSave={() => { setModalStatus(null); setEditSLA(null); load(); }}
          onClose={() => { setModalStatus(null); setEditSLA(null); }}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="sla-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="sla-confirm-modal" onClick={e => e.stopPropagation()}>
            <h4>Disable SLA?</h4>
            <p>This will disable the SLA definition. Active ticket instances will remain until resolved.</p>
            <div className="sla-confirm-btns">
              <button className="sla-btn-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="sla-btn-danger" onClick={handleDelete}>Disable</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
