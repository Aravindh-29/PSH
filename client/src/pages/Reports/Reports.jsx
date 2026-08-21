import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Download, Calendar, TrendingUp, Ticket,
  CheckCircle, Clock, AlertTriangle, Activity, User, Globe,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown,
} from 'lucide-react';
import XLSX from '../../utils/xlsxShim';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import GlobalReports from './GlobalReports';
import './Reports.css';

const RPT_LIMIT = 20;

const DATE_PRESETS = [
  { label: 'All Time',    getRange: () => null },
  { label: 'Last 7 days',  getRange: () => ({ start: subDays(new Date(), 6),  end: new Date() }) },
  { label: 'Last 14 days', getRange: () => ({ start: subDays(new Date(), 13), end: new Date() }) },
  { label: 'Last 30 days', getRange: () => ({ start: subDays(new Date(), 29), end: new Date() }) },
  { label: 'This month',   getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'Last month',   getRange: () => ({ start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }) },
];

const SYSTEM_KEYS = ['customer_name','module_text','category_id','status','priority','impact','urgency','short_description','description'];
const parseOpts = (opts) => {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === 'string') { try { return JSON.parse(opts); } catch { return []; } }
  return [];
};

function getPageWindow(current, total) {
  if (total <= 1) return [1];
  const delta = 2;
  const near = new Set([1, total]);
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) near.add(i);
  const sorted = Array.from(near).sort((a, b) => a - b);
  const result = [];
  let prev = null;
  for (const n of sorted) {
    if (prev !== null && n - prev > 1) result.push('...');
    result.push(n);
    prev = n;
  }
  return result;
}

const STATUS_COLORS = {
  'NEW': '#6366F1', 'OPEN': '#10B981', 'ASSIGNED': '#3B82F6',
  'IN PROGRESS': '#F59E0B', 'WORK IN PROGRESS': '#F97316',
  'PENDING': '#8B5CF6', 'ON HOLD': '#94A3B8',
  'RESOLVED': '#14B8A6', 'CLOSED': '#64748B',
};
const PRIORITY_COLORS = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#10B981' };

function formatAvgResolution(hours) {
  if (hours === null || hours === undefined) return 'N/A';
  const h = parseFloat(hours);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
  return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`;
}

const SUMMARY_CARDS = [
  { key: 'total',      label: 'Total Tickets',   icon: Ticket,        color: '#6366F1', bg: '#EEF2FF' },
  { key: 'open',       label: 'Open',             icon: Activity,      color: '#10B981', bg: '#DCFCE7' },
  { key: 'inProgress', label: 'In Progress',      icon: TrendingUp,    color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'resolved',   label: 'Resolved',         icon: CheckCircle,   color: '#14B8A6', bg: '#CCFBF1' },
  { key: 'closed',     label: 'Closed',           icon: CheckCircle,   color: '#8B5CF6', bg: '#F3E8FF' },
  { key: 'critical',   label: 'Critical Priority', icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2' },
];

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [mode, setMode] = useState('personal');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [rptPage, setRptPage] = useState(1);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);

  const [dateRange, setDateRange]     = useState(null); // null = All Time
  const [showPicker, setShowPicker]   = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const pickerRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (mode !== 'personal') return;
    setLoading(true);
    const params = new URLSearchParams();
    if (dateRange) {
      params.set('startDate', format(dateRange.start, 'yyyy-MM-dd'));
      params.set('endDate',   format(dateRange.end,   'yyyy-MM-dd'));
    }
    Promise.all([api.get(`/reports?${params}`), api.get('/config/fields')])
      .then(([res, fRes]) => {
        setData(res.data);
        setRptPage(1);
        setCustomFieldDefs((fRes.data.fields || []).filter(f => !SYSTEM_KEYS.includes(f.field_key)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mode, dateRange]);

  const applyPreset = (preset) => {
    setDateRange(preset.getRange());
    setShowPicker(false);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    setDateRange({ start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') });
    setShowPicker(false);
  };

  const dateRangeLabel = dateRange
    ? `${format(dateRange.start, 'MMM d')} – ${format(dateRange.end, 'MMM d, yyyy')}`
    : 'All Time';

  const activePreset = DATE_PRESETS.find(p => {
    const r = p.getRange();
    if (r === null && dateRange === null) return true;
    if (!r || !dateRange) return false;
    return format(r.start, 'yyyy-MM-dd') === format(dateRange.start, 'yyyy-MM-dd')
        && format(r.end,   'yyyy-MM-dd') === format(dateRange.end,   'yyyy-MM-dd');
  });

  const exportToExcel = useCallback(async () => {
    if (!data) return;
    setExporting(true);

    // ── Style constants ───────────────────────────────────────────────────────
    const ORANGE = 'E85D04', NAVY = '0D1B2A', WHITE = 'FFFFFF';
    const ALT = 'F0F4FF', LIGHT = 'F8FAFC', BORDER_C = 'E2E8F0';

    const STATUS_PALETTE = {
      NEW: { bg: 'EEF2FF', fg: '6366F1' }, OPEN: { bg: 'DCFCE7', fg: '16A34A' },
      ASSIGNED: { bg: 'DBEAFE', fg: '2563EB' }, IN_PROGRESS: { bg: 'FEF3C7', fg: 'D97706' },
      WORK_IN_PROGRESS: { bg: 'FFEDD5', fg: 'EA580C' }, PENDING: { bg: 'F3E8FF', fg: '7C3AED' },
      ON_HOLD: { bg: 'F1F5F9', fg: '64748B' }, RESOLVED: { bg: 'CCFBF1', fg: '0D9488' },
      CLOSED: { bg: 'E2E8F0', fg: '475569' },
    };
    const PRI_PALETTE = {
      CRITICAL: { bg: 'FEE2E2', fg: 'EF4444' }, HIGH: { bg: 'FFEDD5', fg: 'F97316' },
      MEDIUM: { bg: 'FEFCE8', fg: 'CA8A04' }, LOW: { bg: 'DCFCE7', fg: '16A34A' },
    };

    const bdr = (rgb = BORDER_C) => ({ style: 'thin', color: { rgb } });
    const borders = { top: bdr(), bottom: bdr(), left: bdr(), right: bdr() };

    const font = (opts = {}) => ({
      name: 'Calibri', sz: opts.sz || 10, bold: opts.bold || false,
      color: { rgb: opts.color || NAVY }, italic: opts.italic || false,
    });
    const fill = (rgb) => ({ fgColor: { rgb }, patternType: 'solid' });
    const align = (h = 'left', v = 'center', wrap = false) => ({ horizontal: h, vertical: v, wrapText: wrap });

    const hdr = (bg = ORANGE, fg = WHITE, sz = 11) => ({
      fill: fill(bg), font: font({ sz, bold: true, color: fg }),
      alignment: align('center'), border: borders,
    });
    const dat = (bg = WHITE, fg = NAVY, h = 'left', bold = false) => ({
      fill: fill(bg), font: font({ bold, color: fg }),
      alignment: align(h), border: borders,
    });

    // Helper: styled cell
    const cs = (v, s) => ({ v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s });
    const cn = (v, s) => ({ v: v || 0, t: 'n', s });

    // Unicode progress bar
    const bar = (val, max, w = 12) => {
      if (!max) return '░'.repeat(w);
      const f = Math.min(Math.round((val / max) * w), w);
      return '█'.repeat(f) + '░'.repeat(w - f);
    };

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Summary ─────────────────────────────────────────────────────
    const avg = formatAvgResolution(data.summary.avgResolutionHours);
    const sumMetrics = [
      ['Total Tickets', data.summary.total, '6366F1', 'EEF2FF'],
      ['Open',          data.summary.open,  '16A34A', 'DCFCE7'],
      ['In Progress',   data.summary.inProgress, 'D97706', 'FEF3C7'],
      ['Pending',       data.summary.pending,    '7C3AED', 'F3E8FF'],
      ['Resolved',      data.summary.resolved,   '0D9488', 'CCFBF1'],
      ['Closed',        data.summary.closed,     '475569', 'E2E8F0'],
      ['Critical Priority', data.summary.critical, 'EF4444', 'FEE2E2'],
      ['High Priority',     data.summary.high,     'F97316', 'FFEDD5'],
      ['Avg Resolution',    avg,                   'E85D04', 'FFF7ED'],
    ];
    const s1 = [
      [cs('PSH TICKETING SYSTEM — ACTIVITY REPORT', { fill: fill(ORANGE), font: font({ sz: 16, bold: true, color: WHITE }), alignment: align('center'), border: borders }), cs('', {}), cs('', {}), cs('', {})],
      [cs(`Report for: ${user?.fullName || ''}   |   Generated: ${format(new Date(), 'PPP p')}`, { fill: fill(NAVY), font: font({ sz: 10, color: 'CBD5E1' }), alignment: align('center'), border: borders }), cs('', {}), cs('', {}), cs('', {})],
      [cs('', dat(LIGHT)), cs('', dat(LIGHT)), cs('', dat(LIGHT)), cs('', dat(LIGHT))],
      [cs('METRIC', hdr(NAVY)), cs('VALUE', hdr(NAVY, WHITE, 11)), cs('VISUAL', hdr(NAVY)), cs('DETAILS', hdr(NAVY))],
      ...sumMetrics.map(([label, val, fg, bg]) => [
        cs(label, dat(LIGHT, '334155', 'left', true)),
        cn(typeof val === 'number' ? val : 0, { fill: fill(bg), font: font({ bold: true, color: fg }), alignment: align('center'), border: borders }),
        cs(typeof val === 'number' ? bar(val, data.summary.total || 1) : '', { fill: fill(bg), font: font({ color: fg }), alignment: align('center'), border: borders }),
        cs(typeof val === 'number' ? `${data.summary.total ? ((val / data.summary.total) * 100).toFixed(1) : 0}% of total` : val, dat(WHITE, '64748B', 'center')),
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
    ];
    ws1['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 22 }];
    ws1['!rows'] = [{ hpt: 36 }, { hpt: 22 }, { hpt: 8 }, { hpt: 22 }, ...sumMetrics.map(() => ({ hpt: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // ── Sheet 2: Monthly Activity ────────────────────────────────────────────
    const maxM = Math.max(...data.monthly.map(r => r.Created), 1);
    const s2 = [
      [cs('MONTHLY TICKET ACTIVITY — LAST 12 MONTHS', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {}), cs('', {})],
      [cs('MONTH', hdr(NAVY)), cs('CREATED', hdr(NAVY)), cs('RESOLVED', hdr(NAVY)), cs('CLOSED', hdr(NAVY)), cs('CREATED TREND', hdr(NAVY))],
      ...data.monthly.map((r, i) => {
        const bg = i % 2 === 0 ? WHITE : ALT;
        return [
          cs(r.label, dat(LIGHT, '334155', 'left', true)),
          cn(r.Created,  { fill: fill(r.Created > 0 ? 'EEF2FF' : bg), font: font({ bold: r.Created > 0, color: r.Created > 0 ? '6366F1' : '94A3B8' }), alignment: align('center'), border: borders }),
          cn(r.Resolved, { fill: fill(r.Resolved > 0 ? 'CCFBF1' : bg), font: font({ bold: r.Resolved > 0, color: r.Resolved > 0 ? '0D9488' : '94A3B8' }), alignment: align('center'), border: borders }),
          cn(r.Closed,   { fill: fill(r.Closed > 0 ? 'F3E8FF' : bg), font: font({ bold: r.Closed > 0, color: r.Closed > 0 ? '7C3AED' : '94A3B8' }), alignment: align('center'), border: borders }),
          cs(bar(r.Created, maxM), { fill: fill(r.Created > 0 ? 'FFF7ED' : bg), font: font({ color: 'E85D04', sz: 9 }), alignment: align('left'), border: borders }),
        ];
      }),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws2['!cols'] = [{ wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 20 }];
    ws2['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.monthly.map(() => ({ hpt: 18 }))];
    XLSX.utils.book_append_sheet(wb, ws2, 'Monthly Activity');

    // ── Sheet 3: Weekly Activity ─────────────────────────────────────────────
    const maxW = Math.max(...data.weekly.map(r => r.Created), 1);
    const s3 = [
      [cs('WEEKLY TICKET ACTIVITY — LAST 12 WEEKS', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {})],
      [cs('WEEK', hdr(NAVY)), cs('CREATED', hdr(NAVY)), cs('RESOLVED', hdr(NAVY)), cs('CREATED TREND', hdr(NAVY))],
      ...data.weekly.map((r, i) => {
        const bg = i % 2 === 0 ? WHITE : ALT;
        return [
          cs(r.label, dat(LIGHT, '334155', 'left', true)),
          cn(r.Created,  { fill: fill(r.Created > 0 ? 'EEF2FF' : bg), font: font({ bold: r.Created > 0, color: r.Created > 0 ? '6366F1' : '94A3B8' }), alignment: align('center'), border: borders }),
          cn(r.Resolved, { fill: fill(r.Resolved > 0 ? 'CCFBF1' : bg), font: font({ bold: r.Resolved > 0, color: r.Resolved > 0 ? '0D9488' : '94A3B8' }), alignment: align('center'), border: borders }),
          cs(bar(r.Created, maxW), { fill: fill(r.Created > 0 ? 'FFF7ED' : bg), font: font({ color: 'E85D04', sz: 9 }), alignment: align('left'), border: borders }),
        ];
      }),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws3['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 20 }];
    ws3['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.weekly.map(() => ({ hpt: 18 }))];
    XLSX.utils.book_append_sheet(wb, ws3, 'Weekly Activity');

    // ── Sheet 4: Visual Bar Chart (cell grid) ────────────────────────────────
    const CHART_H = 14;
    const barFillS = { fill: fill(ORANGE), border: bdr(ORANGE) };
    const emptyS   = { fill: fill('F1F5F9'), border: bdr(BORDER_C) };
    const yLblS    = { fill: fill(LIGHT), font: font({ sz: 8, color: '64748B' }), alignment: align('right'), border: bdr(BORDER_C) };

    const chartRows = [];
    // Title
    const chartTitleCols = data.monthly.length + 1;
    chartRows.push([cs('MONTHLY CREATED — VISUAL BAR CHART', { fill: fill(NAVY), font: font({ sz: 13, bold: true, color: WHITE }), alignment: align('center'), border: borders }), ...Array(chartTitleCols - 1).fill(cs('', { fill: fill(NAVY), border: borders }))]);
    chartRows.push(Array(chartTitleCols).fill(cs('', { fill: fill(LIGHT), border: bdr(BORDER_C) })));

    // Grid rows (top to bottom)
    const chartMax = Math.max(...data.monthly.map(r => r.Created), 1);
    for (let r = 0; r < CHART_H; r++) {
      const scaleVal = Math.round(chartMax * (CHART_H - r) / CHART_H);
      const gridRow = [{ v: scaleVal, t: 'n', s: yLblS }];
      data.monthly.forEach(m => {
        const bh = Math.round((m.Created / chartMax) * CHART_H);
        gridRow.push({ v: '', t: 's', s: r >= (CHART_H - bh) ? barFillS : emptyS });
      });
      chartRows.push(gridRow);
    }
    // Month labels
    const mLblRow = [cs('', emptyS)];
    data.monthly.forEach(m => mLblRow.push(cs(m.label, { fill: fill('E2E8F0'), font: font({ sz: 8, bold: true, color: '334155' }), alignment: { horizontal: 'center', vertical: 'center', textRotation: 45 }, border: bdr(BORDER_C) })));
    chartRows.push(mLblRow);
    // Value labels
    const mValRow = [cs('', emptyS)];
    data.monthly.forEach(m => mValRow.push({ v: m.Created, t: 'n', s: { fill: fill('FFF7ED'), font: font({ sz: 9, bold: true, color: ORANGE }), alignment: align('center'), border: bdr(ORANGE) } }));
    chartRows.push(mValRow);

    // Spacer + Weekly chart
    chartRows.push(Array(chartTitleCols).fill(cs('', { fill: fill(WHITE), border: bdr(BORDER_C) })));
    const wChartCols = data.weekly.length + 1;
    chartRows.push([cs('WEEKLY CREATED — VISUAL BAR CHART', { fill: fill('1E293B'), font: font({ sz: 13, bold: true, color: WHITE }), alignment: align('center'), border: borders }), ...Array(wChartCols - 1).fill(cs('', { fill: fill('1E293B'), border: borders }))]);
    chartRows.push(Array(wChartCols).fill(cs('', { fill: fill(LIGHT), border: bdr(BORDER_C) })));
    const wChartMax = Math.max(...data.weekly.map(r => r.Created), 1);
    for (let r = 0; r < CHART_H; r++) {
      const scaleVal = Math.round(wChartMax * (CHART_H - r) / CHART_H);
      const gridRow = [{ v: scaleVal, t: 'n', s: yLblS }];
      data.weekly.forEach(m => {
        const bh = Math.round((m.Created / wChartMax) * CHART_H);
        const isFilled = r >= (CHART_H - bh);
        gridRow.push({ v: '', t: 's', s: isFilled ? { fill: fill('6366F1'), border: bdr('6366F1') } : emptyS });
      });
      chartRows.push(gridRow);
    }
    const wLblRow = [cs('', emptyS)];
    data.weekly.forEach(m => wLblRow.push(cs(m.label, { fill: fill('E2E8F0'), font: font({ sz: 8, bold: true, color: '334155' }), alignment: { horizontal: 'center', vertical: 'center', textRotation: 45 }, border: bdr(BORDER_C) })));
    chartRows.push(wLblRow);
    const wValRow = [cs('', emptyS)];
    data.weekly.forEach(m => wValRow.push({ v: m.Created, t: 'n', s: { fill: fill('EEF2FF'), font: font({ sz: 9, bold: true, color: '6366F1' }), alignment: align('center'), border: bdr('6366F1') } }));
    chartRows.push(wValRow);

    const ws4 = XLSX.utils.aoa_to_sheet(chartRows);
    ws4['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: data.monthly.length } },
      { s: { r: CHART_H + 5, c: 0 }, e: { r: CHART_H + 5, c: data.weekly.length } },
    ];
    ws4['!cols'] = [{ wch: 5 }, ...data.monthly.map(() => ({ wch: 5 }))];
    ws4['!rows'] = [{ hpt: 26 }, { hpt: 6 }, ...Array(CHART_H).fill({ hpt: 14 }), { hpt: 30 }, { hpt: 18 }, { hpt: 8 }, { hpt: 6 }, { hpt: 26 }, { hpt: 6 }, ...Array(CHART_H).fill({ hpt: 14 }), { hpt: 30 }, { hpt: 18 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Visual Charts');

    // ── Sheet 5: By Status ───────────────────────────────────────────────────
    const totSt = data.byStatus.reduce((a, r) => a + r.value, 0) || 1;
    const s5 = [
      [cs('TICKET STATUS BREAKDOWN', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {})],
      [cs('STATUS', hdr(NAVY)), cs('COUNT', hdr(NAVY)), cs('PERCENTAGE', hdr(NAVY)), cs('VISUAL', hdr(NAVY))],
      ...data.byStatus.map(r => {
        const key = r.name.replace(/ /g, '_');
        const pal = STATUS_PALETTE[key] || { bg: 'F1F5F9', fg: '64748B' };
        const pct = ((r.value / totSt) * 100).toFixed(1);
        return [
          cs(r.name, { fill: fill(pal.bg), font: font({ bold: true, color: pal.fg }), alignment: align('left'), border: borders }),
          cn(r.value, { fill: fill(pal.bg), font: font({ bold: true, color: pal.fg }), alignment: align('center'), border: borders }),
          cs(`${pct}%`, { fill: fill(pal.bg), font: font({ color: pal.fg }), alignment: align('center'), border: borders }),
          cs(bar(r.value, totSt), { fill: fill(pal.bg), font: font({ color: pal.fg, sz: 9 }), alignment: align('left'), border: borders }),
        ];
      }),
    ];
    const ws5 = XLSX.utils.aoa_to_sheet(s5);
    ws5['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws5['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];
    ws5['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.byStatus.map(() => ({ hpt: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws5, 'By Status');

    // ── Sheet 6: By Priority ─────────────────────────────────────────────────
    const totPr = data.byPriority.reduce((a, r) => a + r.value, 0) || 1;
    const s6 = [
      [cs('TICKET PRIORITY BREAKDOWN', hdr(ORANGE)), cs('', {}), cs('', {}), cs('', {})],
      [cs('PRIORITY', hdr(NAVY)), cs('COUNT', hdr(NAVY)), cs('PERCENTAGE', hdr(NAVY)), cs('VISUAL', hdr(NAVY))],
      ...data.byPriority.map(r => {
        const pal = PRI_PALETTE[r.name] || { bg: 'F1F5F9', fg: '64748B' };
        const pct = ((r.value / totPr) * 100).toFixed(1);
        return [
          cs(r.name, { fill: fill(pal.bg), font: font({ bold: true, color: pal.fg }), alignment: align('left'), border: borders }),
          cn(r.value, { fill: fill(pal.bg), font: font({ bold: true, color: pal.fg }), alignment: align('center'), border: borders }),
          cs(`${pct}%`, { fill: fill(pal.bg), font: font({ color: pal.fg }), alignment: align('center'), border: borders }),
          cs(bar(r.value, totPr), { fill: fill(pal.bg), font: font({ color: pal.fg, sz: 9 }), alignment: align('left'), border: borders }),
        ];
      }),
    ];
    const ws6 = XLSX.utils.aoa_to_sheet(s6);
    ws6['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws6['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];
    ws6['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.byPriority.map(() => ({ hpt: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws6, 'By Priority');

    // ── Sheet 7: All Tickets ─────────────────────────────────────────────────
    const cfResolve = (ticket, f) => {
      const raw = (ticket.custom_data || {})[f.field_key];
      if (raw === null || raw === undefined || raw === '') return '—';
      if (f.field_type === 'dropdown') {
        const opts = parseOpts(f.options);
        return opts.find(o => o.value === raw)?.label || String(raw);
      }
      return String(raw);
    };
    const ticketHeaders = [
      'Ticket ID', 'Subject', 'Customer', 'Module', 'Status', 'Priority',
      'Owner', 'Created By', 'Created At', 'Last Updated',
      ...customFieldDefs.map(f => f.label),
    ];
    const s7 = [
      [cs('ALL TICKETS', hdr(ORANGE)), ...Array(ticketHeaders.length - 1).fill(cs('', { fill: fill(ORANGE), border: borders }))],
      ticketHeaders.map(h => cs(h, hdr(NAVY))),
      ...data.allTickets.map((t, i) => {
        const rowBg = i % 2 === 0 ? WHITE : ALT;
        const stKey = t.status?.replace(/ /g, '_') || '';
        const stPal = STATUS_PALETTE[stKey] || { bg: 'F1F5F9', fg: '64748B' };
        const prPal = PRI_PALETTE[t.priority] || { bg: 'F1F5F9', fg: '64748B' };
        return [
          cs(t.ticket_number, { fill: fill(rowBg), font: font({ bold: true, color: '6366F1', sz: 9 }), alignment: align('center'), border: borders }),
          cs(t.short_description, { fill: fill(rowBg), font: font({ color: '0F172A' }), alignment: align('left', 'center', true), border: borders }),
          cs(t.customer_name, dat(rowBg)),
          cs(t.module_name || '—', dat(rowBg, '64748B')),
          cs(t.status?.replace(/_/g, ' '), { fill: fill(stPal.bg), font: font({ bold: true, color: stPal.fg, sz: 9 }), alignment: align('center'), border: borders }),
          cs(t.priority, { fill: fill(prPal.bg), font: font({ bold: true, color: prPal.fg, sz: 9 }), alignment: align('center'), border: borders }),
          cs(t.ticket_owner_name || '—', dat(rowBg, '334155')),
          cs(t.created_by_name || '—', dat(rowBg, '334155')),
          cs(t.created_at ? format(new Date(t.created_at), 'yyyy-MM-dd HH:mm') : '—', dat(rowBg, '64748B')),
          cs(t.updated_at ? format(new Date(t.updated_at), 'yyyy-MM-dd HH:mm') : '—', dat(rowBg, '64748B')),
          ...customFieldDefs.map(f => cs(cfResolve(t, f), dat(rowBg, '334155'))),
        ];
      }),
    ];
    const ws7 = XLSX.utils.aoa_to_sheet(s7);
    ws7['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ticketHeaders.length - 1 } }];
    ws7['!cols'] = [
      { wch: 14 }, { wch: 32 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 11 },
      { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
      ...customFieldDefs.map(() => ({ wch: 20 })),
    ];
    ws7['!rows'] = [{ hpt: 28 }, { hpt: 22 }, ...data.allTickets.map(() => ({ hpt: 18 }))];
    ws7['!freeze'] = { xSplit: 0, ySplit: 2 };
    XLSX.utils.book_append_sheet(wb, ws7, 'All Tickets');

    const filename = `PSH_Report_${(user?.fullName || 'User').replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    await XLSX.writeFile(wb, filename);
    setExporting(false);
  }, [data, user, customFieldDefs]);

  const summary = data?.summary || {};

  return (
    <div className="reports-page">
      {/* Mode Tabs — admin only */}
      {isAdmin && (
        <div className="rpt-mode-tabs">
          <button
            className={`rpt-mode-tab ${mode === 'personal' ? 'active' : ''}`}
            onClick={() => setMode('personal')}
          >
            <User size={15} /> My Reports
          </button>
          <button
            className={`rpt-mode-tab ${mode === 'global' ? 'active' : ''}`}
            onClick={() => setMode('global')}
          >
            <Globe size={15} /> Global Reports
          </button>
        </div>
      )}

      {/* Global Reports — separate component */}
      {mode === 'global' && <GlobalReports />}

      {/* Personal Reports */}
      {mode === 'personal' && <>

      {/* Header */}
      <div className="rpt-header">
        <div>
          <h1 className="rpt-title">My Reports</h1>
          <p className="rpt-sub">Personal activity overview for {user?.fullName}</p>
        </div>
        <div className="rpt-header-right">
          {/* Date picker */}
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
          <button
            className="rpt-export-btn"
            onClick={exportToExcel}
            disabled={!data || exporting}
          >
            <Download size={15} />
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="rpt-cards">
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
              {loading ? '—' : formatAvgResolution(summary.avgResolutionHours)}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1: Monthly + Status */}
      <div className="rpt-charts-row">
        <div className="rpt-chart-card rpt-chart-wide">
          <div className="rpt-chart-header">
            <h3>Monthly Ticket Activity ({dateRange ? dateRangeLabel : 'Last 12 Months'})</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.monthly || []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Created"  fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Resolved" fill="#14B8A6" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Closed"   fill="#8B5CF6" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rpt-chart-card rpt-chart-narrow">
          <div className="rpt-chart-header">
            <h3>By Status</h3>
          </div>
          {data?.byStatus?.length ? (
            <div className="rpt-donut-wrap">
              <PieChart width={160} height={160}>
                <Pie
                  data={data.byStatus}
                  cx={80} cy={80} innerRadius={48} outerRadius={72}
                  paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}
                >
                  {data.byStatus.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94A3B8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
              <div className="rpt-legend">
                {data.byStatus.map((entry, i) => (
                  <div key={i} className="rpt-legend-item">
                    <span className="rpt-legend-dot" style={{ background: STATUS_COLORS[entry.name] || '#94A3B8' }} />
                    <span className="rpt-legend-name">{entry.name}</span>
                    <span className="rpt-legend-val">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rpt-empty-chart">No data yet</div>
          )}
        </div>
      </div>

      {/* Charts Row 2: Weekly + Priority */}
      <div className="rpt-charts-row">
        <div className="rpt-chart-card rpt-chart-wide">
          <div className="rpt-chart-header">
            <h3>Weekly Ticket Activity ({dateRange ? dateRangeLabel : 'Last 12 Weeks'})</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.weekly || []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Created"  fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Resolved" fill="#14B8A6" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rpt-chart-card rpt-chart-narrow">
          <div className="rpt-chart-header">
            <h3>By Priority</h3>
          </div>
          {data?.byPriority?.length ? (
            <div className="rpt-donut-wrap">
              <PieChart width={160} height={160}>
                <Pie
                  data={data.byPriority}
                  cx={80} cy={80} innerRadius={48} outerRadius={72}
                  paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}
                >
                  {data.byPriority.map((entry, i) => (
                    <Cell key={i} fill={PRIORITY_COLORS[entry.name] || '#94A3B8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
              <div className="rpt-legend">
                {data.byPriority.map((entry, i) => (
                  <div key={i} className="rpt-legend-item">
                    <span className="rpt-legend-dot" style={{ background: PRIORITY_COLORS[entry.name] || '#94A3B8' }} />
                    <span className="rpt-legend-name">{entry.name}</span>
                    <span className="rpt-legend-val">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rpt-empty-chart">No data yet</div>
          )}
        </div>
      </div>

      {/* All Tickets Table */}
      {(() => {
        const allTickets = data?.allTickets || [];
        const totalPages = Math.max(1, Math.ceil(allTickets.length / RPT_LIMIT));
        const safePage = Math.min(rptPage, totalPages);
        const start = (safePage - 1) * RPT_LIMIT;
        const end = Math.min(safePage * RPT_LIMIT, allTickets.length);
        const pageSlice = allTickets.slice(start, end);

        return (
          <div className="rpt-table-card">
            <div className="rpt-chart-header">
              <h3>All My Tickets ({allTickets.length})</h3>
              <button className="rpt-export-btn rpt-export-sm" onClick={exportToExcel} disabled={!data || exporting}>
                <Download size={13} />
                Export
              </button>
            </div>
            <div className="rpt-table-wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>TICKET ID</th>
                    <th>SUBJECT</th>
                    <th>CUSTOMER</th>
                    <th>STATUS</th>
                    <th>PRIORITY</th>
                    <th>MODULE</th>
                    <th>CREATED AT</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && !allTickets.length && (
                    <tr><td colSpan={7} className="rpt-empty-row">No tickets found</td></tr>
                  )}
                  {pageSlice.map((t, i) => (
                    <tr key={start + i}>
                      <td className="rpt-ticket-num">{t.ticket_number}</td>
                      <td className="rpt-subject">{t.short_description}</td>
                      <td>{t.customer_name}</td>
                      <td>
                        <span className="rpt-status-pill" style={{
                          background: `${STATUS_COLORS[t.status?.replace(/_/g, ' ')] || '#94A3B8'}18`,
                          color: STATUS_COLORS[t.status?.replace(/_/g, ' ')] || '#94A3B8',
                        }}>
                          {t.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className="rpt-priority-pill" style={{
                          background: `${PRIORITY_COLORS[t.priority] || '#94A3B8'}18`,
                          color: PRIORITY_COLORS[t.priority] || '#94A3B8',
                        }}>
                          {t.priority}
                        </span>
                      </td>
                      <td>{t.module_name || '—'}</td>
                      <td className="rpt-date">
                        {t.created_at ? format(new Date(t.created_at), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="rpt-pagination">
                <span className="rpt-pag-info">
                  Showing <strong>{start + 1}–{end}</strong> of <strong>{allTickets.length}</strong> tickets
                </span>
                <div className="rpt-pag-pages">
                  <button className="rpt-pag-btn rpt-pag-nav" disabled={safePage === 1} onClick={() => setRptPage(1)} title="First page">
                    <ChevronsLeft size={13} />
                  </button>
                  <button className="rpt-pag-btn rpt-pag-nav" disabled={safePage === 1} onClick={() => setRptPage(p => p - 1)} title="Previous page">
                    <ChevronLeft size={13} />
                  </button>
                  {getPageWindow(safePage, totalPages).map((pg, i) =>
                    pg === '...'
                      ? <span key={`el-${i}`} className="rpt-pag-ellipsis">…</span>
                      : <button
                          key={pg}
                          className={`rpt-pag-btn${pg === safePage ? ' active' : ''}`}
                          onClick={() => setRptPage(pg)}
                        >
                          {pg}
                        </button>
                  )}
                  <button className="rpt-pag-btn rpt-pag-nav" disabled={safePage === totalPages} onClick={() => setRptPage(p => p + 1)} title="Next page">
                    <ChevronRight size={13} />
                  </button>
                  <button className="rpt-pag-btn rpt-pag-nav" disabled={safePage === totalPages} onClick={() => setRptPage(totalPages)} title="Last page">
                    <ChevronsRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      </>}
    </div>
  );
}
