import React from 'react';
import './Badge.css';

const STATUS_COLORS = {
  NEW: 'blue', OPEN: 'green', ASSIGNED: 'teal',
  IN_PROGRESS: 'blue', WORK_IN_PROGRESS: 'indigo',
  PENDING: 'amber', ON_HOLD: 'gray', RESOLVED: 'teal',
  CLOSED: 'slate', REOPENED: 'purple', CANCELLED: 'red',
};
const PRIORITY_COLORS = {
  LOW: 'green', MEDIUM: 'amber', HIGH: 'orange', CRITICAL: 'red',
};

export function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'gray';
  return <span className={`badge badge-status badge-${color}`}>{status?.replace('_',' ')}</span>;
}

export function PriorityBadge({ priority }) {
  const color = PRIORITY_COLORS[priority] || 'gray';
  return <span className={`badge badge-priority badge-${color}`}>{priority}</span>;
}
