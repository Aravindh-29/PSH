import React, { useEffect, useState } from 'react';
import './SLABar.css';

function formatDuration(minutes) {
  if (minutes <= 0) return '0m';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SLABar({ instance }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (instance.stage !== 'active') return;
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, [instance.stage]);

  const startedMs     = new Date(instance.started_at).getTime();
  const targetMs      = new Date(instance.target_at).getTime();
  const pausedTotalMs = parseFloat(instance.total_pause_minutes || 0) * 60000;
  const durationMs    = instance.duration_minutes * 60000;

  let pct = 0;
  let stage = instance.stage;
  let timeLabel = '';

  if (stage === 'active') {
    const elapsedMs = now - startedMs - pausedTotalMs;
    pct = Math.min((elapsedMs / durationMs) * 100, 110);
    const remaining = targetMs - now;
    if (remaining <= 0) {
      stage = 'breached';
      timeLabel = `Overdue ${formatDuration(-remaining / 60000)}`;
    } else {
      timeLabel = `${formatDuration(remaining / 60000)} left`;
    }
  } else if (stage === 'paused') {
    const pauseMs = instance.pause_started_at ? new Date(instance.pause_started_at).getTime() : now;
    pct = Math.min(((pauseMs - startedMs - pausedTotalMs) / durationMs) * 100, 100);
    timeLabel = `${formatDuration((targetMs - pauseMs) / 60000)} left`;
  } else if (stage === 'breached') {
    pct = 100;
    timeLabel = `Overdue ${formatDuration((now - targetMs) / 60000)}`;
  } else if (stage === 'completed') {
    const elapsed = new Date(instance.completed_at).getTime() - startedMs - pausedTotalMs;
    pct = Math.min((elapsed / durationMs) * 100, 100);
    timeLabel = `Done ${formatDuration(elapsed / 60000)}`;
  }

  const colorClass   = stage === 'breached' ? 'sla-breached'
    : pct >= 75 ? 'sla-critical'
    : pct >= 50 ? 'sla-warn'
    : 'sla-ok';
  const displayPct   = Math.min(Math.round(pct), 100);
  const stageLabel   = stage === 'active' ? 'ACTIVE'
    : stage === 'paused'    ? 'PAUSED'
    : stage === 'breached'  ? 'BREACHED'
    : 'DONE';

  return (
    <div className={`sla-row ${colorClass}`}>
      <div className="sla-row-top">
        <span className="sla-row-name">{instance.sla_name}</span>
        <div className="sla-row-right">
          <span className={`sla-row-badge ${colorClass}`}>{stageLabel}</span>
          <span className={`sla-row-time ${colorClass}`}>{timeLabel}</span>
        </div>
      </div>
      <div className="sla-row-bottom">
        <div className="sla-row-track">
          <div
            className={`sla-row-fill ${stage === 'breached' ? 'sla-fill-pulse' : ''}`}
            style={{ width: `${displayPct}%` }}
          />
        </div>
        <span className="sla-row-pct">{displayPct}%</span>
      </div>
    </div>
  );
}
