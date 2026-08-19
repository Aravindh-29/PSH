import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Download, Users, Ticket, CheckCircle, AlertTriangle, Activity, Clock, TrendingUp,
} from 'lucide-react';
import XLSX from 'xlsx-js-style';
import api from '../../api/axios';
import { format } from 'date-fns';
import './Reports.css';

const STATUS_COLORS = {
  'NEW': '#6366F1', 'OPEN': '#10B981', 'ASSIGNED': '#3B82F6',
  'IN PROGRESS': '#F59E0B', 'WORK IN PROGRESS': '#F97316',
  'PENDING': '#8B5CF6', 'ON HOLD': '#94A3B8',
  'RESOLVED': '#14B8A6', 'CLOSED': '#64748B',
};
const PRI_COLORS = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#10B981' };

function fmtHours(h) {
  if (h === null || h === undefined) return 'N/A';
  const v = parseFloat(h);
  if (v < 1) return `${Math.round(v * 60)}m`;
  if (v < 24) return `${Math.floor(v)}h ${Math.round((v % 1) * 60)}m`;
  return `${Math.floor(v / 24)}d ${Math.floor(v % 24)}h`;
}

const SUMMARY_CARDS = [
  { key: 'total',       label: 'Total Tickets',    icon: Ticket,        color: '#6366F1', bg: '#EEF2FF' },
  { key: 'activeUsers', label: 'Active Users',      icon: Users,         color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'open',        label: 'Open',              icon: Activity,      color: '#10B981', bg: '#DCFCE7' },
  { key: 'inProgress',  label: 'In Progress',       icon: TrendingUp,    color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'resolved',    label: 'Resolved',          icon: CheckCircle,   color: '#14B8A6', bg: '#CCFBF1' },
  { key: 'closed',      label: 'Closed',            icon: CheckCircle,   color: '#8B5CF6', bg: '#F3E8FF' },
  { key: 'critical',    label: 'Critical',          icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2' },
];

export default function GlobalReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/reports/global')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const exportToExcel = useCallback(() => {
    if (!data) return;
    setExporting(true);

    // ── Style helpers ─────────────────────────────────────────────────────────
    const ORANGE = 'E85D04', NAVY = '0D1B2A', WHITE = 'FFFFFF';
    const ALT = 'EFF6FF', LIGHT = 'F8FAFC', BORDER_C = 'E2E8F0';

    const STATUS_PAL = {
      NEW: { bg: 'EEF2FF', fg: '6366F1' }, OPEN: { bg: 'DCFCE7', fg: '16A34A' },
      ASSIGNED: { bg: 'DBEAFE', fg: '2563EB' }, IN_PROGRESS: { bg: 'FEF3C7', fg: 'D97706' },
      WORK_IN_PROGRESS: { bg: 'FFEDD5', fg: 'EA580C' }, PENDING: { bg: 'F3E8FF', fg: '7C3AED' },
      ON_HOLD: { bg: 'F1F5F9', fg: '64748B' }, RESOLVED: { bg: 'CCFBF1', fg: '0D9488' },
      CLOSED: { bg: 'E2E8F0', fg: '475569' },
    };
    const PRI_PAL = {
      CRITICAL: { bg: 'FEE2E2', fg: 'EF4444' }, HIGH: { bg: 'FFEDD5', fg: 'F97316' },
      MEDIUM: { bg: 'FEFCE8', fg: 'CA8A04' }, LOW: { bg: 'DCFCE7', fg: '16A34A' },
    };
    const ACTIVITY_PAL = (total, max) => {
      if (!total) return { bg: 'F8FAFC', fg: '94A3B8' };
      const pct = total / max;
      if (pct >= 0.8) return { bg: 'FEE2E2', fg: 'DC2626' };
      if (pct >= 0.5) return { bg: 'FFEDD5', fg: 'EA580C' };
      if (pct >= 0.2) return { bg: 'FEF3C7', fg: 'D97706' };
      return { bg: 'DCFCE7', fg: '16A34A' };
    };

    const bdr = (rgb = BORDER_C) => ({ style: 'thin', color: { rgb } });
    const borders = { top: bdr(), bottom: bdr(), left: bdr(), right: bdr() };
    const fnt = (o = {}) => ({ name: 'Calibri', sz: o.sz || 10, bold: o.bold || false, color: { rgb: o.color || NAVY } });
    const fl = (rgb) => ({ fgColor: { rgb }, patternType: 'solid' });
    const al = (h = 'left', v = 'center') => ({ horizontal: h, vertical: v });
    const hdr = (bg = ORANGE, fg = WHITE, sz = 11) => ({ fill: fl(bg), font: fnt({ sz, bold: true, color: fg }), alignment: al('center'), border: borders });
    const dat = (bg = WHITE, fg = NAVY, h = 'left', bold = false) => ({ fill: fl(bg), font: fnt({ bold, color: fg }), alignment: al(h), border: borders });
    const cs = (v, s) => ({ v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s });
    const cn = (v, s) => ({ v: v || 0, t: 'n', s });
    const bar = (val, max, w = 12) => { if (!max) return '░'.repeat(w); const f = Math.min(Math.round((val / max) * w), w); return '█'.repeat(f) + '░'.repeat(w - f); };

    const wb = XLSX.utils.book_new();
    const genDate = format(new Date(), 'PPP p');

    // ── Sheet 1: Global Summary ───────────────────────────────────────────────
    const s = data.summary;
    const avgPerUser = s.activeUsers ? (s.total / s.activeUsers).toFixed(1) : '0';
    const s1 = [
      [cs('PSH TICKETING SYSTEM — GLOBAL REPORT', { fill: fl(NAVY), font: fnt({ sz: 16, bold: true, color: WHITE }), alignment: al('center'), border: borders }), cs('', {}), cs('', {}), cs('', {})],
      [cs(`System-Wide Report   |   Generated: ${genDate}`, { fill: fl(ORANGE), font: fnt({ sz: 10, color: WHITE }), alignment: al('center'), border: borders }), cs('', {}), cs('', {}), cs('', {})],
      [cs('', dat(LIGHT)), cs('', dat(LIGHT)), cs('', dat(LIGHT)), cs('', dat(LIGHT))],
      [cs('METRIC', hdr(NAVY)), cs('VALUE', hdr(NAVY)), cs('VISUAL', hdr(NAVY)), cs('% SHARE', hdr(NAVY))],
      [cs('Total Tickets', dat(LIGHT, '334155', 'left', true)), cn(s.total, { fill: fl('EEF2FF'), font: fnt({ bold: true, color: '6366F1' }), alignment: al('center'), border: borders }), cs(bar(s.total, s.total), { fill: fl('EEF2FF'), font: fnt({ color: '6366F1', sz: 9 }), alignment: al('center'), border: borders }), cs('100%', dat(WHITE, '64748B', 'center'))],
      [cs('Active Users', dat(LIGHT, '334155', 'left', true)), cn(s.activeUsers, { fill: fl('DBEAFE'), font: fnt({ bold: true, color: '2563EB' }), alignment: al('center'), border: borders }), cs(`Avg ${avgPerUser} tickets/user`, { fill: fl('DBEAFE'), font: fnt({ color: '2563EB', sz: 9 }), alignment: al('center'), border: borders }), cs('—', dat(WHITE, '64748B', 'center'))],
      ...[
        ['Open',        s.open,       '16A34A', 'DCFCE7'],
        ['In Progress', s.inProgress, 'D97706', 'FEF3C7'],
        ['Pending',     s.pending,    '7C3AED', 'F3E8FF'],
        ['Resolved',    s.resolved,   '0D9488', 'CCFBF1'],
        ['Closed',      s.closed,     '475569', 'E2E8F0'],
        ['Critical',    s.critical,   'EF4444', 'FEE2E2'],
        ['High',        s.high,       'F97316', 'FFEDD5'],
      ].map(([label, val, fg, bg]) => [
        cs(label, dat(LIGHT, '334155', 'left', true)),
        cn(val, { fill: fl(bg), font: fnt({ bold: true, color: fg }), alignment: al('center'), border: borders }),
        cs(bar(val, s.total || 1), { fill: fl(bg), font: fnt({ color: fg, sz: 9 }), alignment: al('center'), border: borders }),
        cs(s.total ? `${((val / s.total) * 100).toFixed(1)}%` : '0%', dat(WHITE, '64748B', 'center')),
      ]),
      [cs('Avg Resolution', dat(LIGHT, '334155', 'left', true)), cs(fmtHours(s.avgResolutionHours), { fill: fl('FFF7ED'), font: fnt({ bold: true, color: ORANGE }), alignment: al('center'), border: borders }), cs('—', dat(WHITE, '64748B', 'center')), cs('—', dat(WHITE, '64748B', 'center'))],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }];
    ws1['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }];
    ws1['!rows'] = [{ hpt: 36 }, { hpt: 24 }, { hpt: 6 }, { hpt: 22 }, ...Array(11).fill({ hpt: 20 })];
    XLSX.utils.book_append_sheet(wb, ws1, 'Global Summary');

    // ── Sheet 2: Monthly Trend ────────────────────────────────────────────────
    const maxM = Math.max(...data.monthly.map(r => r.Created), 1);
    const s2 = [
      [cs('MONTHLY TICKET TREND — SYSTEM-WIDE', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {}), cs('', {})],
      [cs('MONTH', hdr(NAVY)), cs('CREATED', hdr(NAVY)), cs('RESOLVED', hdr(NAVY)), cs('CLOSED', hdr(NAVY)), cs('TREND', hdr(NAVY))],
      ...data.monthly.map((r, i) => {
        const bg = i % 2 === 0 ? WHITE : ALT;
        return [
          cs(r.label, dat(LIGHT, '334155', 'left', true)),
          cn(r.Created, { fill: fl(r.Created > 0 ? 'EEF2FF' : bg), font: fnt({ bold: r.Created > 0, color: r.Created > 0 ? '6366F1' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(r.Resolved, { fill: fl(r.Resolved > 0 ? 'CCFBF1' : bg), font: fnt({ bold: r.Resolved > 0, color: r.Resolved > 0 ? '0D9488' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(r.Closed, { fill: fl(r.Closed > 0 ? 'F3E8FF' : bg), font: fnt({ bold: r.Closed > 0, color: r.Closed > 0 ? '7C3AED' : '94A3B8' }), alignment: al('center'), border: borders }),
          cs(bar(r.Created, maxM), { fill: fl(r.Created > 0 ? 'FFF7ED' : bg), font: fnt({ color: ORANGE, sz: 9 }), alignment: al('left'), border: borders }),
        ];
      }),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws2['!cols'] = [{ wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 20 }];
    ws2['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.monthly.map(() => ({ hpt: 18 }))];
    XLSX.utils.book_append_sheet(wb, ws2, 'Monthly Trend');

    // ── Sheet 3: Weekly Trend ─────────────────────────────────────────────────
    const maxW = Math.max(...data.weekly.map(r => r.Created), 1);
    const s3 = [
      [cs('WEEKLY TICKET TREND — SYSTEM-WIDE', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {})],
      [cs('WEEK', hdr(NAVY)), cs('CREATED', hdr(NAVY)), cs('RESOLVED', hdr(NAVY)), cs('TREND', hdr(NAVY))],
      ...data.weekly.map((r, i) => {
        const bg = i % 2 === 0 ? WHITE : ALT;
        return [
          cs(r.label, dat(LIGHT, '334155', 'left', true)),
          cn(r.Created, { fill: fl(r.Created > 0 ? 'EEF2FF' : bg), font: fnt({ bold: r.Created > 0, color: r.Created > 0 ? '6366F1' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(r.Resolved, { fill: fl(r.Resolved > 0 ? 'CCFBF1' : bg), font: fnt({ bold: r.Resolved > 0, color: r.Resolved > 0 ? '0D9488' : '94A3B8' }), alignment: al('center'), border: borders }),
          cs(bar(r.Created, maxW), { fill: fl(r.Created > 0 ? 'FFF7ED' : bg), font: fnt({ color: ORANGE, sz: 9 }), alignment: al('left'), border: borders }),
        ];
      }),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws3['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 20 }];
    ws3['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.weekly.map(() => ({ hpt: 18 }))];
    XLSX.utils.book_append_sheet(wb, ws3, 'Weekly Trend');

    // ── Sheet 4: Per Employee ─────────────────────────────────────────────────
    const maxEmpTotal = Math.max(...data.employees.map(e => e.total), 1);
    const empHeaders = ['NAME', 'EMAIL', 'ROLE', 'STATUS', 'TOTAL', 'OPEN', 'IN PROG.', 'RESOLVED', 'CLOSED', 'CRITICAL', 'AVG RESOLUTION', 'ACTIVITY'];
    const s4 = [
      [cs('EMPLOYEE TICKET REPORT', hdr('1E3A5F', WHITE, 13)), ...Array(empHeaders.length - 1).fill(cs('', { fill: fl('1E3A5F'), border: borders }))],
      empHeaders.map(h => cs(h, hdr(NAVY))),
      ...data.employees.map((e, i) => {
        const bg = i % 2 === 0 ? WHITE : ALT;
        const act = ACTIVITY_PAL(e.total, maxEmpTotal);
        const roleBg = e.role === 'admin' ? { bg: 'EEF2FF', fg: '6366F1' } : { bg: 'F0FDF4', fg: '16A34A' };
        return [
          cs(e.fullName, { fill: fl(bg), font: fnt({ bold: true, color: '0F172A' }), alignment: al('left'), border: borders }),
          cs(e.email, dat(bg, '64748B')),
          cs(e.role.toUpperCase(), { fill: fl(roleBg.bg), font: fnt({ bold: true, color: roleBg.fg, sz: 9 }), alignment: al('center'), border: borders }),
          cs(e.isActive ? 'ACTIVE' : 'INACTIVE', { fill: fl(e.isActive ? 'DCFCE7' : 'FEE2E2'), font: fnt({ bold: true, color: e.isActive ? '16A34A' : 'EF4444', sz: 9 }), alignment: al('center'), border: borders }),
          cn(e.total, { fill: fl(act.bg), font: fnt({ bold: true, color: act.fg }), alignment: al('center'), border: borders }),
          cn(e.open, { fill: fl(e.open > 0 ? 'DCFCE7' : bg), font: fnt({ color: e.open > 0 ? '16A34A' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(e.inProgress, { fill: fl(e.inProgress > 0 ? 'FEF3C7' : bg), font: fnt({ color: e.inProgress > 0 ? 'D97706' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(e.resolved, { fill: fl(e.resolved > 0 ? 'CCFBF1' : bg), font: fnt({ color: e.resolved > 0 ? '0D9488' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(e.closed, { fill: fl(e.closed > 0 ? 'F3E8FF' : bg), font: fnt({ color: e.closed > 0 ? '7C3AED' : '94A3B8' }), alignment: al('center'), border: borders }),
          cn(e.critical, { fill: fl(e.critical > 0 ? 'FEE2E2' : bg), font: fnt({ bold: e.critical > 0, color: e.critical > 0 ? 'EF4444' : '94A3B8' }), alignment: al('center'), border: borders }),
          cs(fmtHours(e.avgResolutionHours), { fill: fl(bg), font: fnt({ color: e.avgResolutionHours ? ORANGE : '94A3B8' }), alignment: al('center'), border: borders }),
          cs(bar(e.total, maxEmpTotal), { fill: fl(act.bg), font: fnt({ color: act.fg, sz: 9 }), alignment: al('left'), border: borders }),
        ];
      }),
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(s4);
    ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: empHeaders.length - 1 } }];
    ws4['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 16 }, { wch: 16 }];
    ws4['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.employees.map(() => ({ hpt: 18 }))];
    ws4['!freeze'] = { xSplit: 0, ySplit: 2 };
    XLSX.utils.book_append_sheet(wb, ws4, 'Per Employee');

    // ── Sheet 5: By Status ────────────────────────────────────────────────────
    const totSt = data.byStatus.reduce((a, r) => a + r.value, 0) || 1;
    const s5 = [
      [cs('STATUS BREAKDOWN — SYSTEM-WIDE', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {})],
      [cs('STATUS', hdr(NAVY)), cs('COUNT', hdr(NAVY)), cs('PERCENTAGE', hdr(NAVY)), cs('VISUAL', hdr(NAVY))],
      ...data.byStatus.map(r => {
        const key = r.name.replace(/ /g, '_');
        const pal = STATUS_PAL[key] || { bg: 'F1F5F9', fg: '64748B' };
        return [
          cs(r.name, { fill: fl(pal.bg), font: fnt({ bold: true, color: pal.fg }), alignment: al('left'), border: borders }),
          cn(r.value, { fill: fl(pal.bg), font: fnt({ bold: true, color: pal.fg }), alignment: al('center'), border: borders }),
          cs(`${((r.value / totSt) * 100).toFixed(1)}%`, { fill: fl(pal.bg), font: fnt({ color: pal.fg }), alignment: al('center'), border: borders }),
          cs(bar(r.value, totSt), { fill: fl(pal.bg), font: fnt({ color: pal.fg, sz: 9 }), alignment: al('left'), border: borders }),
        ];
      }),
    ];
    const ws5 = XLSX.utils.aoa_to_sheet(s5);
    ws5['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws5['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];
    ws5['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.byStatus.map(() => ({ hpt: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws5, 'By Status');

    // ── Sheet 6: By Priority ──────────────────────────────────────────────────
    const totPr = data.byPriority.reduce((a, r) => a + r.value, 0) || 1;
    const s6 = [
      [cs('PRIORITY BREAKDOWN — SYSTEM-WIDE', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {})],
      [cs('PRIORITY', hdr(NAVY)), cs('COUNT', hdr(NAVY)), cs('PERCENTAGE', hdr(NAVY)), cs('VISUAL', hdr(NAVY))],
      ...data.byPriority.map(r => {
        const pal = PRI_PAL[r.name] || { bg: 'F1F5F9', fg: '64748B' };
        return [
          cs(r.name, { fill: fl(pal.bg), font: fnt({ bold: true, color: pal.fg }), alignment: al('left'), border: borders }),
          cn(r.value, { fill: fl(pal.bg), font: fnt({ bold: true, color: pal.fg }), alignment: al('center'), border: borders }),
          cs(`${((r.value / totPr) * 100).toFixed(1)}%`, { fill: fl(pal.bg), font: fnt({ color: pal.fg }), alignment: al('center'), border: borders }),
          cs(bar(r.value, totPr), { fill: fl(pal.bg), font: fnt({ color: pal.fg, sz: 9 }), alignment: al('left'), border: borders }),
        ];
      }),
    ];
    const ws6 = XLSX.utils.aoa_to_sheet(s6);
    ws6['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws6['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];
    ws6['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.byPriority.map(() => ({ hpt: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws6, 'By Priority');

    // ── Sheet 7: Visual Charts ────────────────────────────────────────────────
    const CHART_H = 14;
    const barFillS = { fill: fl(ORANGE), border: { style: 'thin', color: { rgb: ORANGE } } };
    const empBarS  = { fill: fl('6366F1'), border: { style: 'thin', color: { rgb: '6366F1' } } };
    const emptyS   = { fill: fl('F1F5F9'), border: { style: 'thin', color: { rgb: BORDER_C } } };
    const yLblS    = { fill: fl(LIGHT), font: fnt({ sz: 8, color: '64748B' }), alignment: al('right'), border: { style: 'thin', color: { rgb: BORDER_C } } };

    const chartRows = [];
    const colCount = data.monthly.length + 1;
    chartRows.push([cs('MONTHLY TICKET CREATION — BAR CHART', { fill: fl(NAVY), font: fnt({ sz: 13, bold: true, color: WHITE }), alignment: al('center'), border: borders }), ...Array(colCount - 1).fill(cs('', { fill: fl(NAVY), border: borders }))]);
    chartRows.push(Array(colCount).fill(cs('', { fill: fl(LIGHT) })));
    const cMaxM = Math.max(...data.monthly.map(r => r.Created), 1);
    for (let r = 0; r < CHART_H; r++) {
      const row = [{ v: Math.round(cMaxM * (CHART_H - r) / CHART_H), t: 'n', s: yLblS }];
      data.monthly.forEach(m => { const bh = Math.round((m.Created / cMaxM) * CHART_H); row.push({ v: '', t: 's', s: r >= (CHART_H - bh) ? barFillS : emptyS }); });
      chartRows.push(row);
    }
    const mLbl = [cs('', emptyS)]; data.monthly.forEach(m => mLbl.push(cs(m.label, { fill: fl('E2E8F0'), font: fnt({ sz: 8, bold: true }), alignment: { horizontal: 'center', vertical: 'center', textRotation: 45 } })));
    const mVal = [cs('', emptyS)]; data.monthly.forEach(m => mVal.push({ v: m.Created, t: 'n', s: { fill: fl('FFF7ED'), font: fnt({ sz: 9, bold: true, color: ORANGE }), alignment: al('center') } }));
    chartRows.push(mLbl); chartRows.push(mVal);

    // Top 10 employees bar chart
    const top10 = data.employees.slice(0, 10);
    const empCols = top10.length + 1;
    chartRows.push(Array(Math.max(colCount, empCols)).fill(cs('', { fill: fl(WHITE) })));
    chartRows.push([cs('TOP 10 EMPLOYEES — TICKET COUNT', { fill: fl('1E3A5F'), font: fnt({ sz: 13, bold: true, color: WHITE }), alignment: al('center'), border: borders }), ...Array(empCols - 1).fill(cs('', { fill: fl('1E3A5F'), border: borders }))]);
    chartRows.push(Array(empCols).fill(cs('', { fill: fl(LIGHT) })));
    const cMaxE = Math.max(...top10.map(e => e.total), 1);
    for (let r = 0; r < CHART_H; r++) {
      const row = [{ v: Math.round(cMaxE * (CHART_H - r) / CHART_H), t: 'n', s: yLblS }];
      top10.forEach(e => { const bh = Math.round((e.total / cMaxE) * CHART_H); row.push({ v: '', t: 's', s: r >= (CHART_H - bh) ? empBarS : emptyS }); });
      chartRows.push(row);
    }
    const eLbl = [cs('', emptyS)]; top10.forEach(e => eLbl.push(cs(e.fullName.split(' ')[0], { fill: fl('E2E8F0'), font: fnt({ sz: 8, bold: true }), alignment: { horizontal: 'center', vertical: 'center', textRotation: 45 } })));
    const eVal = [cs('', emptyS)]; top10.forEach(e => eVal.push({ v: e.total, t: 'n', s: { fill: fl('EEF2FF'), font: fnt({ sz: 9, bold: true, color: '6366F1' }), alignment: al('center') } }));
    chartRows.push(eLbl); chartRows.push(eVal);

    const ws7 = XLSX.utils.aoa_to_sheet(chartRows);
    ws7['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: data.monthly.length } },
      { s: { r: CHART_H + 5, c: 0 }, e: { r: CHART_H + 5, c: top10.length } },
    ];
    ws7['!cols'] = [{ wch: 5 }, ...Array(Math.max(colCount, empCols) - 1).fill({ wch: 5 })];
    ws7['!rows'] = [{ hpt: 26 }, { hpt: 6 }, ...Array(CHART_H).fill({ hpt: 14 }), { hpt: 30 }, { hpt: 18 }, { hpt: 8 }, { hpt: 6 }, { hpt: 26 }, { hpt: 6 }, ...Array(CHART_H).fill({ hpt: 14 }), { hpt: 30 }, { hpt: 18 }];
    XLSX.utils.book_append_sheet(wb, ws7, 'Visual Charts');

    // ── Sheet 8: All Tickets ──────────────────────────────────────────────────
    const tHdrs = ['Ticket ID', 'Subject', 'Customer', 'Module', 'Status', 'Priority', 'Owner', 'Created By', 'Created At', 'Last Updated'];
    const s8 = [
      [cs('ALL SYSTEM TICKETS', hdr(ORANGE)), ...Array(tHdrs.length - 1).fill(cs('', { fill: fl(ORANGE), border: borders }))],
      tHdrs.map(h => cs(h, hdr(NAVY))),
      ...data.allTickets.map((t, i) => {
        const bg = i % 2 === 0 ? WHITE : ALT;
        const stKey = t.status?.replace(/ /g, '_') || '';
        const stPal = STATUS_PAL[stKey] || { bg: 'F1F5F9', fg: '64748B' };
        const prPal = PRI_PAL[t.priority] || { bg: 'F1F5F9', fg: '64748B' };
        return [
          cs(t.ticket_number, { fill: fl(bg), font: fnt({ bold: true, color: '6366F1', sz: 9 }), alignment: al('center'), border: borders }),
          cs(t.short_description, { fill: fl(bg), font: fnt({ color: '0F172A' }), alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borders }),
          cs(t.customer_name, dat(bg)),
          cs(t.module_name || '—', dat(bg, '64748B')),
          cs(t.status?.replace(/_/g, ' '), { fill: fl(stPal.bg), font: fnt({ bold: true, color: stPal.fg, sz: 9 }), alignment: al('center'), border: borders }),
          cs(t.priority, { fill: fl(prPal.bg), font: fnt({ bold: true, color: prPal.fg, sz: 9 }), alignment: al('center'), border: borders }),
          cs(t.ticket_owner_name || '—', dat(bg, '334155')),
          cs(t.created_by_name || '—', dat(bg, '334155')),
          cs(t.created_at ? format(new Date(t.created_at), 'yyyy-MM-dd HH:mm') : '—', dat(bg, '64748B')),
          cs(t.updated_at ? format(new Date(t.updated_at), 'yyyy-MM-dd HH:mm') : '—', dat(bg, '64748B')),
        ];
      }),
    ];
    const ws8 = XLSX.utils.aoa_to_sheet(s8);
    ws8['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: tHdrs.length - 1 } }];
    ws8['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 11 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];
    ws8['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.allTickets.map(() => ({ hpt: 18 }))];
    ws8['!freeze'] = { xSplit: 0, ySplit: 2 };
    XLSX.utils.book_append_sheet(wb, ws8, 'All Tickets');

    XLSX.writeFile(wb, `PSH_Global_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    setExporting(false);
  }, [data]);

  const summary = data?.summary || {};

  return (
    <div className="rpt-global">
      {/* Header */}
      <div className="rpt-global-topbar">
        <div>
          <h2 className="rpt-global-title">Global Reports</h2>
          <p className="rpt-sub">System-wide statistics across all users</p>
        </div>
        <button className="rpt-export-btn" onClick={exportToExcel} disabled={!data || exporting}>
          <Download size={15} />
          {exporting ? 'Exporting…' : 'Export Global Report'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="rpt-global-cards">
        {SUMMARY_CARDS.map(cfg => (
          <div key={cfg.key} className="rpt-card">
            <div className="rpt-card-icon" style={{ background: cfg.bg, color: cfg.color }}>
              <cfg.icon size={18} />
            </div>
            <div className="rpt-card-info">
              <div className="rpt-card-label">{cfg.label}</div>
              <div className="rpt-card-value" style={{ color: cfg.color }}>
                {loading ? '—' : (summary[cfg.key] ?? 0)}
              </div>
            </div>
          </div>
        ))}
        <div className="rpt-card">
          <div className="rpt-card-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
            <Clock size={18} />
          </div>
          <div className="rpt-card-info">
            <div className="rpt-card-label">Avg Resolution</div>
            <div className="rpt-card-value" style={{ color: '#EA580C' }}>
              {loading ? '—' : fmtHours(summary.avgResolutionHours)}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Monthly + Status donut */}
      <div className="rpt-charts-row">
        <div className="rpt-chart-card rpt-chart-wide">
          <div className="rpt-chart-header"><h3>Monthly Ticket Activity — System Wide (Last 12 Months)</h3></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.monthly || []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Created" fill="#6366F1" radius={[3,3,0,0]} maxBarSize={20} />
              <Bar dataKey="Resolved" fill="#14B8A6" radius={[3,3,0,0]} maxBarSize={20} />
              <Bar dataKey="Closed" fill="#8B5CF6" radius={[3,3,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rpt-chart-card rpt-chart-narrow">
          <div className="rpt-chart-header"><h3>By Status</h3></div>
          {data?.byStatus?.length ? (
            <div className="rpt-donut-wrap">
              <PieChart width={160} height={160}>
                <Pie data={data.byStatus} cx={80} cy={80} innerRadius={48} outerRadius={72} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                  {data.byStatus.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.name] || '#94A3B8'} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
              <div className="rpt-legend">
                {data.byStatus.map((e, i) => (
                  <div key={i} className="rpt-legend-item">
                    <span className="rpt-legend-dot" style={{ background: STATUS_COLORS[e.name] || '#94A3B8' }} />
                    <span className="rpt-legend-name">{e.name}</span>
                    <span className="rpt-legend-val">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="rpt-empty-chart">No data</div>}
        </div>
      </div>

      {/* Charts Row 2: Per-Employee bar + Priority donut */}
      <div className="rpt-charts-row">
        <div className="rpt-chart-card rpt-chart-wide">
          <div className="rpt-chart-header"><h3>Tickets per Employee (Top 10)</h3></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart layout="vertical" data={(data?.employees || []).slice(0, 10)} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="fullName" type="category" width={110} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="total"    name="Total"    fill="#6366F1" radius={[0,3,3,0]} maxBarSize={16} />
              <Bar dataKey="resolved" name="Resolved" fill="#14B8A6" radius={[0,3,3,0]} maxBarSize={16} />
              <Bar dataKey="open"     name="Open"     fill="#10B981" radius={[0,3,3,0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rpt-chart-card rpt-chart-narrow">
          <div className="rpt-chart-header"><h3>By Priority</h3></div>
          {data?.byPriority?.length ? (
            <div className="rpt-donut-wrap">
              <PieChart width={160} height={160}>
                <Pie data={data.byPriority} cx={80} cy={80} innerRadius={48} outerRadius={72} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                  {data.byPriority.map((e, i) => <Cell key={i} fill={PRI_COLORS[e.name] || '#94A3B8'} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
              <div className="rpt-legend">
                {data.byPriority.map((e, i) => (
                  <div key={i} className="rpt-legend-item">
                    <span className="rpt-legend-dot" style={{ background: PRI_COLORS[e.name] || '#94A3B8' }} />
                    <span className="rpt-legend-name">{e.name}</span>
                    <span className="rpt-legend-val">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="rpt-empty-chart">No data</div>}
        </div>
      </div>

      {/* Employees Table */}
      <div className="rpt-table-card">
        <div className="rpt-chart-header">
          <h3>All Employees ({data?.employees?.length ?? 0})</h3>
        </div>
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th>NAME</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th>
                <th>TOTAL</th><th>OPEN</th><th>IN PROG.</th><th>RESOLVED</th>
                <th>CLOSED</th><th>CRITICAL</th><th>AVG RESOLUTION</th>
              </tr>
            </thead>
            <tbody>
              {!data?.employees?.length && !loading && (
                <tr><td colSpan={11} className="rpt-empty-row">No employees found</td></tr>
              )}
              {data?.employees?.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: '#0F172A' }}>{e.fullName}</td>
                  <td style={{ color: '#64748B', fontSize: 12 }}>{e.email}</td>
                  <td>
                    <span className="rpt-status-pill" style={{ background: e.role === 'admin' ? '#EEF2FF' : '#F0FDF4', color: e.role === 'admin' ? '#6366F1' : '#16A34A' }}>
                      {e.role}
                    </span>
                  </td>
                  <td>
                    <span className="rpt-status-pill" style={{ background: e.isActive ? '#DCFCE7' : '#FEE2E2', color: e.isActive ? '#16A34A' : '#EF4444' }}>
                      {e.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: '#6366F1', textAlign: 'center' }}>{e.total}</td>
                  <td style={{ textAlign: 'center', color: e.open > 0 ? '#10B981' : '#94A3B8' }}>{e.open}</td>
                  <td style={{ textAlign: 'center', color: e.inProgress > 0 ? '#F59E0B' : '#94A3B8' }}>{e.inProgress}</td>
                  <td style={{ textAlign: 'center', color: e.resolved > 0 ? '#14B8A6' : '#94A3B8' }}>{e.resolved}</td>
                  <td style={{ textAlign: 'center', color: e.closed > 0 ? '#8B5CF6' : '#94A3B8' }}>{e.closed}</td>
                  <td style={{ textAlign: 'center', color: e.critical > 0 ? '#EF4444' : '#94A3B8', fontWeight: e.critical > 0 ? 700 : 400 }}>{e.critical}</td>
                  <td style={{ textAlign: 'center', color: e.avgResolutionHours ? '#E85D04' : '#94A3B8', fontSize: 12 }}>{fmtHours(e.avgResolutionHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
