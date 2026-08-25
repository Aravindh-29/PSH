import React, { useEffect, useRef, useState } from 'react';
import './SLABar.css';

function formatDuration(minutes) {
  if (minutes <= 0) return '0m';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SLABar({ instance }) {
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef(null);

  // Live tick every 10s for active instances
  useEffect(() => {
    if (instance.stage !== 'active') return;
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, [instance.stage]);

  const startedMs    = new Date(instance.started_at).getTime();
  const targetMs     = new Date(instance.target_at).getTime();
  const pausedTotalMs = parseFloat(instance.total_pause_minutes || 0) * 60000;
  const durationMs   = instance.duration_minutes * 60000;

  let pct = 0;
  let stage = instance.stage;
  let label = '';
  let remainingMs = 0;

  if (stage === 'active') {
    const elapsedMs = now - startedMs - pausedTotalMs;
    pct = Math.min((elapsedMs / durationMs) * 100, 110);
    remainingMs = targetMs - now;
    if (remainingMs <= 0) {
      label = `Overdue by ${formatDuration(-remainingMs / 60000)}`;
      stage = 'breached';
    } else {
      label = `${formatDuration(remainingMs / 60000)} remaining`;
    }
  } else if (stage === 'paused') {
    const pauseStartedMs = instance.pause_started_at ? new Date(instance.pause_started_at).getTime() : now;
    const elapsedMs = pauseStartedMs - startedMs - pausedTotalMs;
    pct = Math.min((elapsedMs / durationMs) * 100, 100);
    remainingMs = targetMs - pauseStartedMs;
    label = `Paused · ${formatDuration(remainingMs / 60000)} remaining when resumed`;
  } else if (stage === 'breached') {
    pct = 100;
    const overdueMs = instance.breached_at
      ? now - new Date(instance.breached_at).getTime() + (now - targetMs)
      : now - targetMs;
    label = `Breached · overdue by ${formatDuration((now - targetMs) / 60000)}`;
  } else if (stage === 'completed') {
    const elapsedMs = new Date(instance.completed_at).getTime() - startedMs - pausedTotalMs;
    pct = Math.min((elapsedMs / durationMs) * 100, 100);
    label = `Completed in ${formatDuration(elapsedMs / 60000)}`;
  }

  const colorClass = stage === 'breached' ? 'sla-breached'
    : pct >= 75 ? 'sla-critical'
    : pct >= 50 ? 'sla-warn'
    : 'sla-ok';

  const displayPct = Math.min(Math.round(pct), 100);

  return (
    <div className={`sla-bar-wrap ${colorClass}`}>
      <div className="sla-bar-header">
        <span className="sla-bar-name">{instance.sla_name}</span>
        <span className="sla-bar-stage-badge">{stage.toUpperCase()}</span>
      </div>
      <div className="sla-bar-meta">
        <span className="sla-bar-trigger">Starts on: <strong>{instance.start_status?.replace(/_/g,' ')}</strong></span>
        <span className="sla-bar-target">
          Target: <strong>{new Date(instance.target_at).toLocaleString()}</strong>
        </span>
      </div>
      <div className="sla-bar-track">
        <div
          className={`sla-bar-fill ${stage === 'breached' ? 'sla-fill-pulse' : ''}`}
          style={{ width: `${displayPct}%` }}
        />
        <span className="sla-bar-pct">{displayPct}%</span>
      </div>
      <div className={`sla-bar-label ${colorClass}`}>{label}</div>
    </div>
  );
}
