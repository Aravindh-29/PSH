import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, LabelList,
} from 'recharts';
import {
  BarChart2, Download, RefreshCw, ShieldAlert, CheckCircle, XCircle,
  Clock, AlertTriangle, X, ExternalLink, ChevronUp, ChevronDown, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './QAAnalysis.css';

const PIE_COLORS = ['#22C55E', '#EF4444', '#3B82F6', '#F59E0B'];

function fmtMin(min) {
  if (!min || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function stageBadge(stage) {
  const map = {
    active:    { cls: 'qa-badge-active',    label: 'Active'    },
    paused:    { cls: 'qa-badge-paused',    label: 'Paused'    },
    completed: { cls: 'qa-badge-completed', label: 'Completed' },
    breached:  { cls: 'qa-badge-breached',  label: 'Breached'  },
  };
  const x = map[stage] || { cls: 'qa-badge-active', label: stage };
  return <span className={`qa-badge ${x.cls}`}>{x.label}</span>;
}

function priorityBadge(p) {
  if (!p) return <span className="qa-text-muted">—</span>;
  const map = { CRITICAL: 'qa-pri-critical', HIGH: 'qa-pri-high', MEDIUM: 'qa-pri-medium', LOW: 'qa-pri-low' };
  return <span className={`qa-pri ${map[p] || 'qa-pri-low'}`}>{p}</span>;
}

// Capture a recharts SVG container as PNG base64 for Excel embedding
async function captureChart(containerRef, w = 720, h = 320) {
  try {
    if (!containerRef?.current) return null;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return null;

    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width',  String(w));
    clone.setAttribute('height', String(h));

    // Inline font for text nodes so headless renders correctly
    clone.querySelectorAll('text, tspan').forEach(el => {
      el.style.fontFamily = 'Arial, Helvetica, sans-serif';
    });

    // White background rect inserted at the start
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const svgStr  = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url     = URL.createObjectURL(svgBlob);

    return await new Promise(resolve => {
      const canvas  = document.createElement('canvas');
      canvas.width  = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      const img = new Image();
      img.onload  = () => {
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png').replace('data:image/png;base64,', ''));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  } catch { return null; }
}

// ── Excel helpers ────────────────────────────────────────────────────────────
function xlFill(hex)  { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex.replace('#','') } }; }
function xlFont(hex, { bold=false, size=11, italic=false } = {}) {
  return { color: { argb: 'FF' + hex.replace('#','') }, bold, size, italic, name: 'Calibri' };
}
function xlBorder(style = 'thin', hex = '#E2E8F0') {
  const s = { style, color: { argb: 'FF' + hex.replace('#','') } };
  return { top: s, bottom: s, left: s, right: s };
}

function applySheetHeader(ws, title, subtitle, headerBg, cols) {
  // Title row
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell('A1');
  t.value = title;
  t.font  = xlFont('#FFFFFF', { bold: true, size: 14 });
  t.fill  = xlFill(headerBg);
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;

  // Subtitle row
  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell('A2');
  s.value = subtitle;
  s.font  = xlFont('#CBD5E1', { size: 10, italic: true });
  s.fill  = xlFill(darken(headerBg));
  s.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 18;

  // Empty spacer
  ws.getRow(3).height = 6;
}

function darken(hex) {
  // Simple darkening by mixing with black ~20%
  const c = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, ((c >> 16) & 0xff) - 30);
  const g = Math.max(0, ((c >> 8)  & 0xff) - 30);
  const b = Math.max(0, ((c)       & 0xff) - 30);
  return (r*65536 + g*256 + b).toString(16).padStart(6,'0');
}

function styleColHeaders(ws, row, headers, bgHex, fgHex = '#FFFFFF') {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h.label;
    cell.font  = xlFont(fgHex, { bold: true, size: 11 });
    cell.fill  = xlFill(bgHex);
    cell.alignment = { vertical: 'middle', horizontal: h.align || 'left', wrapText: false };
    cell.border = xlBorder('medium', bgHex);
  });
  ws.getRow(row).height = 22;
}

function styleDataRow(ws, rowNum, values, altBg = '#F8FAFC') {
  const bg = rowNum % 2 === 0 ? altBg : '#FFFFFF';
  values.forEach((v, i) => {
    const cell = ws.getCell(rowNum, i + 1);
    if (v && typeof v === 'object' && 'value' in v) {
      cell.value  = v.value;
      cell.font   = v.font  || xlFont('#1E293B');
      cell.fill   = v.fill  || xlFill(bg);
      cell.alignment = v.alignment || { vertical: 'middle', horizontal: 'left' };
    } else {
      cell.value = v;
      cell.font  = xlFont('#374151');
      cell.fill  = xlFill(bg);
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
    cell.border = xlBorder('hair', '#E2E8F0');
  });
  ws.getRow(rowNum).height = 18;
}

function complianceStyle(pct, altBg) {
  if (pct >= 80) return { value: `${pct}%`, font: xlFont('#065F46', { bold: true }), fill: xlFill('#D1FAE5'), alignment: { horizontal: 'center', vertical: 'middle' } };
  if (pct >= 50) return { value: `${pct}%`, font: xlFont('#92400E', { bold: true }), fill: xlFill('#FEF3C7'), alignment: { horizontal: 'center', vertical: 'middle' } };
  return             { value: `${pct}%`, font: xlFont('#991B1B', { bold: true }), fill: xlFill('#FEE2E2'), alignment: { horizontal: 'center', vertical: 'middle' } };
}

function stageStyle(stage, altBg) {
  const map = {
    active:    { bg: '#DBEAFE', fg: '#1D4ED8' },
    paused:    { bg: '#FEF3C7', fg: '#92400E' },
    completed: { bg: '#D1FAE5', fg: '#065F46' },
    breached:  { bg: '#FEE2E2', fg: '#991B1B' },
  };
  const s = map[stage] || { bg: altBg, fg: '#374151' };
  return { value: stage.toUpperCase(), font: xlFont(s.fg, { bold: true, size: 10 }), fill: xlFill(s.bg), alignment: { horizontal: 'center', vertical: 'middle' } };
}

function priorityStyle(p, altBg) {
  if (!p) return { value: '—', font: xlFont('#94A3B8'), fill: xlFill(altBg), alignment: { horizontal: 'center', vertical: 'middle' } };
  const map = { CRITICAL: { bg: '#FEE2E2', fg: '#7F1D1D' }, HIGH: { bg: '#FEE2E2', fg: '#DC2626' }, MEDIUM: { bg: '#FEF3C7', fg: '#B45309' }, LOW: { bg: '#F0FDF4', fg: '#15803D' } };
  const s = map[p] || { bg: altBg, fg: '#374151' };
  return { value: p, font: xlFont(s.fg, { bold: true, size: 10 }), fill: xlFill(s.bg), alignment: { horizontal: 'center', vertical: 'middle' } };
}

async function embedChart(wb, ws, base64, startRow, startCol, w, h) {
  if (!base64) return;
  try {
    const id = wb.addImage({ base64, extension: 'png' });
    ws.addImage(id, {
      tl: { col: startCol - 1, row: startRow - 1 },
      ext: { width: w, height: h },
    });
  } catch { /* chart embed failed gracefully */ }
}

const CustomTooltipBar = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="qa-tooltip">
      <p className="qa-tt-label">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0', fontSize: 12 }}>
          {p.name}: <strong>{p.value}{p.dataKey === 'complianceRate' ? '%' : ''}</strong>
        </p>
      ))}
    </div>
  );
};

const CustomTooltipLine = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="qa-tooltip">
      <p className="qa-tt-label">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0', fontSize: 12 }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Drill-Down Modal ─────────────────────────────────────────────────────────
function DrillModal({ drill, onClose }) {
  const navigate = useNavigate();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState({ col: 'started_at', dir: 'desc' });
  const searchRef = useRef(null);

  useEffect(() => {
    if (!drill) return;
    setLoading(true); setSearch('');
    const p = new URLSearchParams();
    if (drill.definitionId) p.set('definitionId', drill.definitionId);
    if (drill.stage && drill.stage !== 'all') p.set('stage', drill.stage);
    fetch(`/api/sla/drill?${p}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setRows(j.instances); else toast.error(j.message); })
      .catch(() => toast.error('Network error'))
      .finally(() => setLoading(false));
  }, [drill]);

  useEffect(() => { if (!loading) searchRef.current?.focus(); }, [loading]);
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const toggleSort = col => setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const SortIcon = ({ col }) => {
    if (sort.col !== col) return <span className="qa-sort-idle"><ChevronUp size={12}/><ChevronDown size={12}/></span>;
    return sort.dir === 'asc' ? <ChevronUp size={13} className="qa-sort-active"/> : <ChevronDown size={13} className="qa-sort-active"/>;
  };

  const filtered = rows
    .filter(r => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [r.ticket_number, r.short_description, r.sla_name, r.assigned_to_name, r.priority, r.ticket_status].some(f => f?.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      let va = a[sort.col], vb = b[sort.col];
      if (sort.col === 'ticket_number') { va = parseInt((va||'').replace(/\D/g,''))||0; vb = parseInt((vb||'').replace(/\D/g,''))||0; }
      else if (['started_at','target_at','breached_at','completed_at'].includes(sort.col)) { va = va ? new Date(va).getTime():0; vb = vb ? new Date(vb).getTime():0; }
      else { va = (va||'').toString().toLowerCase(); vb = (vb||'').toString().toLowerCase(); }
      return sort.dir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });

  const stageLabel = { all:'All', met:'Met On Time', breached:'Breached', active:'Active', paused:'Paused' };
  const COLS = [
    { key:'ticket_number',    label:'Ticket #'     },
    { key:'short_description',label:'Description'  },
    { key:'stage',            label:'Stage'        },
    { key:'priority',         label:'Priority'     },
    { key:'ticket_status',    label:'Status'       },
    { key:'assigned_to_name', label:'Assigned To'  },
    { key:'started_at',       label:'Started'      },
    { key:'target_at',        label:'Target'       },
    { key:'completed_at',     label:'Resolved'     },
  ];

  return (
    <div className="drill-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="drill-modal">
        <div className="drill-header">
          <div className="drill-header-left">
            <ShieldAlert size={17} style={{ color:'#E85D04', flexShrink:0 }}/>
            <div>
              <h2 className="drill-title">{drill.slaName}</h2>
              <p className="drill-sub">Showing: <strong>{stageLabel[drill.stage]||drill.stage}</strong>{!loading && <> · <strong>{filtered.length}</strong> of <strong>{rows.length}</strong> records</>}</p>
            </div>
          </div>
          <button className="drill-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="drill-toolbar">
          <div className="drill-search-wrap">
            <Search size={14} className="drill-search-icon"/>
            <input ref={searchRef} className="drill-search" placeholder="Search ticket#, description, assignee, priority…" value={search} onChange={e => setSearch(e.target.value)}/>
            {search && <button className="drill-search-clear" onClick={() => setSearch('')}><X size={12}/></button>}
          </div>
          <span className="drill-result-count">{filtered.length} result{filtered.length!==1?'s':''}</span>
        </div>
        <div className="drill-table-wrap">
          {loading ? (
            <div className="drill-loading"><RefreshCw size={20} className="qa-spin"/><span>Loading…</span></div>
          ) : (
            <table className="drill-table">
              <thead>
                <tr>
                  {COLS.map(c => (
                    <th key={c.key} onClick={() => toggleSort(c.key)} className="drill-th">
                      <span className="drill-th-inner">{c.label} <SortIcon col={c.key}/></span>
                    </th>
                  ))}
                  <th className="drill-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={COLS.length+1} className="drill-td-empty">No records found.</td></tr>
                ) : filtered.map(inst => (
                  <tr key={inst.id} className={`drill-row ${inst.stage==='breached'?'drill-row-breach':''}`}>
                    <td><button className="drill-ticket-link" onClick={() => { navigate(`/tickets/${inst.ticket_id}`); onClose(); }}>{inst.ticket_number}</button></td>
                    <td className="drill-td-desc" title={inst.short_description}>{inst.short_description}</td>
                    <td>{stageBadge(inst.stage)}</td>
                    <td>{priorityBadge(inst.priority)}</td>
                    <td><span className="qa-status-pill">{inst.ticket_status}</span></td>
                    <td className="drill-td-assignee">{inst.assigned_to_name||'—'}</td>
                    <td className="drill-td-date">{fmtDate(inst.started_at)}</td>
                    <td className="drill-td-date">{inst.stage==='breached' ? <span className="qa-val-red">{fmtDate(inst.target_at)}</span> : fmtDate(inst.target_at)}</td>
                    <td className="drill-td-date">
                      {inst.stage==='breached' ? <span className="qa-val-red">{fmtDate(inst.breached_at)}</span>
                       : inst.stage==='completed' ? <span className="qa-val-green">{fmtDate(inst.completed_at)}</span>
                       : <span className="qa-text-muted">In progress</span>}
                    </td>
                    <td><button className="drill-view-btn" onClick={() => { navigate(`/tickets/${inst.ticket_id}`); onClose(); }}><ExternalLink size={13}/> View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function QAAnalysis() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch]       = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [drill, setDrill]         = useState(null);

  // Chart refs for Excel capture
  const complianceChartRef = useRef(null);
  const trendChartRef      = useRef(null);
  const pieChartRef        = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sla/qa', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load QA data');
      setData(json);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDrill = (definitionId, slaName, stage) => setDrill({ definitionId, slaName, stage });

  const CountCell = ({ value, definitionId, slaName, stage, className }) => {
    if (!value) return <td className={className} style={{ color:'#94a3b8', textAlign:'center' }}>0</td>;
    return (
      <td className={className}>
        <button
          className={`qa-drill-btn ${stage==='breached'?'qa-drill-btn-red':stage==='met'?'qa-drill-btn-green':'qa-drill-btn-default'}`}
          onClick={() => openDrill(definitionId, slaName, stage)}
          title={`View ${value} ${stage} instance${value!==1?'s':''}`}
        >{value}</button>
      </td>
    );
  };

  // ── Excel Export ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;

      // Capture charts in parallel
      const [imgCompliance, imgTrend, imgPie] = await Promise.all([
        captureChart(complianceChartRef, 720, 300),
        captureChart(trendChartRef,      720, 240),
        captureChart(pieChartRef,        320, 280),
      ]);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'PSH — QA Analysis';
      wb.created = new Date();
      wb.properties.date1904 = false;

      const { summary, byDefinition, trend, instances } = data;
      const exportedAt = new Date().toLocaleString('en-IN', { dateStyle:'long', timeStyle:'short' });

      // ── Sheet 1: Dashboard Summary ──────────────────────────────────────────
      const ws1 = wb.addWorksheet('📊 Dashboard Summary', { views:[{showGridLines:false}] });
      ws1.columns = [
        { key:'a', width:28 },
        { key:'b', width:22 },
        { key:'c', width:22 },
        { key:'d', width:22 },
        { key:'e', width:22 },
        { key:'f', width:22 },
      ];
      applySheetHeader(ws1, '📊 PSH — SLA Quality Analysis Report', `Generated: ${exportedAt}`, '#0D1B2A', 6);

      // KPI grid header
      styleColHeaders(ws1, 4, [
        { label:'KPI Metric' }, { label:'Value', align:'center' },
        { label:'KPI Metric' }, { label:'Value', align:'center' },
        { label:'KPI Metric' }, { label:'Value', align:'center' },
      ], '#E85D04');

      const kpis = [
        ['Total SLA Instances',  { value: summary.total,    font: xlFont('#1E3A5F',{bold:true,size:13}), fill:xlFill('#EFF6FF'), alignment:{horizontal:'center',vertical:'middle'} }],
        ['Overall Compliance',   complianceStyle(summary.complianceRate, '#F0FDF4')],
        ['Breached',             { value: summary.breached, font: xlFont('#991B1B',{bold:true,size:13}), fill:xlFill('#FEE2E2'), alignment:{horizontal:'center',vertical:'middle'} }],
        ['Met On Time',          { value: summary.met,      font: xlFont('#065F46',{bold:true,size:13}), fill:xlFill('#D1FAE5'), alignment:{horizontal:'center',vertical:'middle'} }],
        ['Active / In Progress', { value: summary.active + summary.paused, font: xlFont('#1D4ED8',{bold:true,size:13}), fill:xlFill('#DBEAFE'), alignment:{horizontal:'center',vertical:'middle'} }],
        ['Avg Elapsed Time',     { value: fmtMin(summary.avgElapsedMin), font: xlFont('#6D28D9',{bold:true,size:13}), fill:xlFill('#EDE9FE'), alignment:{horizontal:'center',vertical:'middle'} }],
      ];

      // Two KPIs per row, 3 rows
      for (let i = 0; i < kpis.length; i += 2) {
        const rowNum = 5 + Math.floor(i / 2);
        const left  = kpis[i];
        const right = kpis[i+1];
        const altBg = rowNum % 2 === 0 ? '#F8FAFC' : '#FFFFFF';

        const labelStyle = { font: xlFont('#334155',{bold:true}), fill: xlFill(altBg), alignment:{vertical:'middle',horizontal:'left'}, border: xlBorder('hair','#E2E8F0') };

        const r = ws1.getRow(rowNum);
        r.height = 26;

        const ca = ws1.getCell(rowNum, 1); ca.value = left[0]; Object.assign(ca, labelStyle);
        const cb = ws1.getCell(rowNum, 2); cb.value = left[1].value; cb.font = left[1].font; cb.fill = left[1].fill; cb.alignment = left[1].alignment; cb.border = xlBorder('hair','#E2E8F0');

        if (right) {
          const cc = ws1.getCell(rowNum, 3); cc.value = right[0]; Object.assign(cc, labelStyle);
          const cd = ws1.getCell(rowNum, 4); cd.value = right[1].value; cd.font = right[1].font; cd.fill = right[1].fill; cd.alignment = right[1].alignment; cd.border = xlBorder('hair','#E2E8F0');
        }
      }

      // Pie chart below KPIs
      const pieRow = 9;
      ws1.getRow(pieRow).height = 8;
      ws1.mergeCells(pieRow+1, 1, pieRow+1, 6);
      const chartLabel1 = ws1.getCell(pieRow+1, 1);
      chartLabel1.value = '📈 SLA Health Distribution';
      chartLabel1.font  = xlFont('#0D1B2A', { bold:true, size:12 });
      chartLabel1.fill  = xlFill('#F1F5F9');
      chartLabel1.alignment = { horizontal:'center', vertical:'middle' };
      ws1.getRow(pieRow+1).height = 22;

      await embedChart(wb, ws1, imgPie, pieRow+2, 1, 340, 280);

      // ── Sheet 2: SLA Performance ────────────────────────────────────────────
      const ws2 = wb.addWorksheet('📈 SLA Performance', { views:[{showGridLines:false}] });
      const defCols = [
        { key:'sla_name',        width:36 },
        { key:'start_status',    width:20 },
        { key:'target',          width:14 },
        { key:'total',           width:10 },
        { key:'met',             width:10 },
        { key:'breached',        width:12 },
        { key:'active',          width:10 },
        { key:'compliance',      width:16 },
        { key:'avg_elapsed',     width:18 },
      ];
      ws2.columns = defCols;
      applySheetHeader(ws2, '📈 SLA Performance Breakdown', `Generated: ${exportedAt}`, '#6D28D9', defCols.length);

      styleColHeaders(ws2, 4, [
        { label:'SLA Name' }, { label:'Trigger Status', align:'center' },
        { label:'Target Duration', align:'center' }, { label:'Total', align:'center' },
        { label:'Met ✓', align:'center' }, { label:'Breached ✗', align:'center' },
        { label:'Active', align:'center' }, { label:'Compliance %', align:'center' },
        { label:'Avg Elapsed', align:'center' },
      ], '#7C3AED');

      byDefinition.forEach((r, i) => {
        const rowNum = 5 + i;
        const altBg  = i % 2 === 0 ? '#F5F3FF' : '#FFFFFF';

        styleDataRow(ws2, rowNum, [
          { value: r.sla_name,                font: xlFont('#1E293B',{bold:true}), fill: xlFill(altBg), alignment:{vertical:'middle',horizontal:'left'} },
          { value: r.start_status,            font: xlFont('#6D28D9',{bold:true,size:10}), fill: xlFill('#EDE9FE'), alignment:{horizontal:'center',vertical:'middle'} },
          { value: fmtMin(r.duration_minutes),font: xlFont('#374151',{bold:true}), fill: xlFill(altBg), alignment:{horizontal:'center',vertical:'middle'} },
          { value: r.total,                   font: xlFont('#334155',{bold:true,size:12}), fill: xlFill('#EFF6FF'), alignment:{horizontal:'center',vertical:'middle'} },
          { value: r.met,                     font: xlFont('#065F46',{bold:true,size:12}), fill: xlFill('#D1FAE5'), alignment:{horizontal:'center',vertical:'middle'} },
          r.breached > 0
            ? { value: r.breached, font: xlFont('#991B1B',{bold:true,size:12}), fill: xlFill('#FEE2E2'), alignment:{horizontal:'center',vertical:'middle'} }
            : { value: 0,          font: xlFont('#6B7280'), fill: xlFill(altBg), alignment:{horizontal:'center',vertical:'middle'} },
          { value: r.active,                  font: xlFont('#1D4ED8',{bold:true,size:12}), fill: xlFill('#DBEAFE'), alignment:{horizontal:'center',vertical:'middle'} },
          complianceStyle(r.complianceRate, altBg),
          { value: fmtMin(r.avgElapsedMin),   font: xlFont('#475569'), fill: xlFill(altBg), alignment:{horizontal:'center',vertical:'middle'} },
        ]);
      });

      // Compliance bar chart below table
      const chartStartRow2 = 5 + byDefinition.length + 2;
      ws2.mergeCells(chartStartRow2, 1, chartStartRow2, defCols.length);
      const cl2 = ws2.getCell(chartStartRow2, 1);
      cl2.value = '📊 Compliance % by SLA Definition';
      cl2.font  = xlFont('#6D28D9',{bold:true,size:12});
      cl2.fill  = xlFill('#EDE9FE');
      cl2.alignment = { horizontal:'center', vertical:'middle' };
      ws2.getRow(chartStartRow2).height = 22;
      await embedChart(wb, ws2, imgCompliance, chartStartRow2+1, 1, 720, 300);

      // ── Sheet 3: 30-Day Trend ───────────────────────────────────────────────
      const ws3 = wb.addWorksheet('📉 30-Day Trend', { views:[{showGridLines:false}] });
      ws3.columns = [
        { key:'date',    width:16 },
        { key:'met',     width:14 },
        { key:'breached',width:16 },
        { key:'net',     width:16 },
      ];
      applySheetHeader(ws3, '📉 30-Day SLA Breach vs Met Trend', `Generated: ${exportedAt}`, '#065F46', 4);

      styleColHeaders(ws3, 4, [
        { label:'Date' }, { label:'Met ✓', align:'center' },
        { label:'Breached ✗', align:'center' }, { label:'Net (Met−Breached)', align:'center' },
      ], '#059669');

      trend.forEach((r, i) => {
        const rowNum = 5 + i;
        const altBg  = i % 2 === 0 ? '#ECFDF5' : '#FFFFFF';
        const net    = (parseInt(r.met)||0) - (parseInt(r.breached)||0);
        styleDataRow(ws3, rowNum, [
          { value: r.date,           font: xlFont('#334155',{bold:true}), fill: xlFill(altBg), alignment:{vertical:'middle'} },
          { value: parseInt(r.met)||0,
            font: xlFont('#065F46',{bold:parseInt(r.met)>0}),
            fill: xlFill(parseInt(r.met)>0 ? '#D1FAE5' : altBg),
            alignment:{horizontal:'center',vertical:'middle'} },
          { value: parseInt(r.breached)||0,
            font: xlFont(parseInt(r.breached)>0 ? '#991B1B' : '#6B7280', {bold:parseInt(r.breached)>0}),
            fill: xlFill(parseInt(r.breached)>0 ? '#FEE2E2' : altBg),
            alignment:{horizontal:'center',vertical:'middle'} },
          { value: net,
            font: xlFont(net>0?'#065F46':net<0?'#991B1B':'#6B7280',{bold:net!==0}),
            fill: xlFill(net>0?'#D1FAE5':net<0?'#FEE2E2':altBg),
            alignment:{horizontal:'center',vertical:'middle'} },
        ]);
      });

      const chartStartRow3 = 5 + trend.length + 2;
      ws3.mergeCells(chartStartRow3, 1, chartStartRow3, 4);
      const cl3 = ws3.getCell(chartStartRow3, 1);
      cl3.value = '📉 30-Day Trend Chart';
      cl3.font  = xlFont('#065F46',{bold:true,size:12});
      cl3.fill  = xlFill('#ECFDF5');
      cl3.alignment = { horizontal:'center', vertical:'middle' };
      ws3.getRow(chartStartRow3).height = 22;
      await embedChart(wb, ws3, imgTrend, chartStartRow3+1, 1, 720, 240);

      // ── Sheet 4: All Instances ──────────────────────────────────────────────
      const ws4 = wb.addWorksheet('🔍 All Instances', { views:[{showGridLines:false}] });
      ws4.columns = [
        { key:'ticket_number',      width:14 },
        { key:'short_description',  width:40 },
        { key:'sla_name',           width:30 },
        { key:'start_status',       width:18 },
        { key:'stage',              width:14 },
        { key:'priority',           width:12 },
        { key:'assigned_to_name',   width:22 },
        { key:'ticket_status',      width:18 },
        { key:'started_at',         width:22 },
        { key:'target_at',          width:22 },
        { key:'breached_completed', width:22 },
        { key:'duration_minutes',   width:16 },
      ];
      applySheetHeader(ws4, '🔍 All SLA Instances (Latest 200)', `Generated: ${exportedAt}`, '#7F1D1D', 12);

      styleColHeaders(ws4, 4, [
        { label:'Ticket #', align:'center' },
        { label:'Short Description' },
        { label:'SLA Name' },
        { label:'Trigger Status', align:'center' },
        { label:'Stage', align:'center' },
        { label:'Priority', align:'center' },
        { label:'Assigned To' },
        { label:'Ticket Status', align:'center' },
        { label:'Started' },
        { label:'Target' },
        { label:'Resolved / Breached' },
        { label:'Duration (min)', align:'center' },
      ], '#991B1B');

      instances.forEach((r, i) => {
        const rowNum = 5 + i;
        const altBg  = r.stage === 'breached' ? '#FFF5F5' : i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
        const resolved = r.stage === 'breached'
          ? (r.breached_at ? new Date(r.breached_at).toLocaleString() : '—')
          : r.stage === 'completed'
          ? (r.completed_at ? new Date(r.completed_at).toLocaleString() : '—')
          : 'In progress';

        styleDataRow(ws4, rowNum, [
          { value: r.ticket_number,   font: xlFont('#E85D04',{bold:true}), fill: xlFill(altBg), alignment:{horizontal:'center',vertical:'middle'} },
          { value: r.short_description || '—', font: xlFont('#1E293B'), fill: xlFill(altBg), alignment:{vertical:'middle',wrapText:false} },
          { value: r.sla_name,        font: xlFont('#334155',{bold:true}), fill: xlFill(altBg), alignment:{vertical:'middle'} },
          { value: r.start_status,    font: xlFont('#6D28D9',{bold:true,size:10}), fill: xlFill('#EDE9FE'), alignment:{horizontal:'center',vertical:'middle'} },
          stageStyle(r.stage, altBg),
          priorityStyle(r.priority, altBg),
          { value: r.assigned_to_name||'—', font: xlFont('#374151'), fill: xlFill(altBg), alignment:{vertical:'middle'} },
          { value: r.ticket_status,   font: xlFont('#475569',{size:10}), fill: xlFill('#F8FAFC'), alignment:{horizontal:'center',vertical:'middle'} },
          { value: r.started_at  ? new Date(r.started_at).toLocaleString()  : '—', font: xlFont('#64748B',{size:10}), fill: xlFill(altBg), alignment:{vertical:'middle'} },
          { value: r.target_at   ? new Date(r.target_at).toLocaleString()   : '—',
            font: r.stage==='breached' ? xlFont('#991B1B',{bold:true,size:10}) : xlFont('#64748B',{size:10}),
            fill: r.stage==='breached' ? xlFill('#FEE2E2') : xlFill(altBg),
            alignment:{vertical:'middle'} },
          { value: resolved,
            font: r.stage==='breached' ? xlFont('#991B1B',{bold:true,size:10}) : r.stage==='completed' ? xlFont('#065F46',{bold:true,size:10}) : xlFont('#94A3B8',{size:10,italic:true}),
            fill: r.stage==='breached' ? xlFill('#FEE2E2') : r.stage==='completed' ? xlFill('#D1FAE5') : xlFill(altBg),
            alignment:{vertical:'middle'} },
          { value: parseInt(r.duration_minutes)||0, font: xlFont('#E85D04',{bold:true}), fill: xlFill(altBg), alignment:{horizontal:'center',vertical:'middle'} },
        ]);
      });

      // ── Write & Download ────────────────────────────────────────────────────
      const buf  = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `PSH_QA_Analysis_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Colourful Excel report exported with charts!');
    } catch (err) {
      console.error(err);
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="qa-loading">
        <RefreshCw size={24} className="qa-spin"/>
        <span>Loading QA Analysis…</span>
      </div>
    );
  }
  if (!data) return null;

  const { summary, byDefinition, trend, instances } = data;

  const filteredInstances = instances.filter(inst => {
    const matchStage  = stageFilter === 'all' || inst.stage === stageFilter;
    const matchSearch = !search.trim() || [inst.ticket_number, inst.short_description, inst.sla_name, inst.assigned_to_name, inst.priority].some(f => f?.toLowerCase().includes(search.toLowerCase()));
    return matchStage && matchSearch;
  });

  const pieData = [
    { name:'Met',     value: summary.met      },
    { name:'Breached',value: summary.breached  },
    { name:'Active',  value: summary.active    },
    { name:'Paused',  value: summary.paused    },
  ].filter(d => d.value > 0);

  return (
    <div className="qa-page">
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)}/>}

      {/* Header */}
      <div className="qa-header">
        <div className="qa-header-left">
          <div className="qa-header-icon"><BarChart2 size={20}/></div>
          <div>
            <h1 className="qa-title">QA Analysis</h1>
            <p className="qa-sub">SLA quality metrics across all tickets · Click any count to drill in</p>
          </div>
        </div>
        <div className="qa-header-right">
          <button className="qa-refresh-btn" onClick={load}><RefreshCw size={15}/> Refresh</button>
          <button className="qa-export-btn" onClick={handleExport} disabled={exporting}>
            <Download size={15}/>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="qa-stat-grid">
        {[
          { icon:<ShieldAlert size={18}/>, cls:'blue', val: summary.total,                 lbl:'Total SLA Instances', stage:'all',      clickable:true  },
          { icon:<CheckCircle size={18}/>, cls:'green',val: `${summary.complianceRate}%`,   lbl:'Overall Compliance',  stage:null,       clickable:false },
          { icon:<XCircle     size={18}/>, cls:'red',  val: summary.breached,               lbl:'Breached',            stage:'breached', clickable:true  },
          { icon:<CheckCircle size={18}/>, cls:'green',val: summary.met,                    lbl:'Met On Time',         stage:'met',      clickable:true  },
          { icon:<AlertTriangle size={18}/>,cls:'yellow',val:summary.active+summary.paused, lbl:'In Progress',         stage:'active',   clickable:true  },
          { icon:<Clock       size={18}/>, cls:'purple',val:fmtMin(summary.avgElapsedMin),  lbl:'Avg Elapsed Time',    stage:null,       clickable:false },
        ].map((card, i) => (
          <div key={i} className="qa-stat-card">
            <div className={`qa-stat-icon qa-stat-icon-${card.cls}`}>{card.icon}</div>
            <div className="qa-stat-body">
              {card.clickable
                ? <button className={`qa-stat-val qa-stat-clickable ${card.cls==='red'?'qa-val-red':card.cls==='yellow'?'qa-val-yellow':''}`} onClick={() => openDrill(null, `All SLAs — ${card.lbl}`, card.stage)}>{card.val}</button>
                : <div className={`qa-stat-val ${card.cls==='green'&&i===1?'qa-val-green':''}`}>{card.val}</div>
              }
              <div className="qa-stat-lbl">{card.lbl}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="qa-charts-row">
        <div className="qa-chart-card qa-chart-wide">
          <h3 className="qa-chart-title">Compliance % by SLA Definition</h3>
          {byDefinition.length === 0 ? (
            <div className="qa-no-data">No SLA definitions configured yet.</div>
          ) : (
            <div ref={complianceChartRef}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDefinition} margin={{ top:10, right:20, left:0, bottom:60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="sla_name" tick={{ fontSize:11, fill:'#64748b' }} angle={-30} textAnchor="end" interval={0}/>
                  <YAxis domain={[0,100]} tick={{ fontSize:11, fill:'#64748b' }} unit="%"/>
                  <Tooltip content={<CustomTooltipBar/>}/>
                  <Bar dataKey="complianceRate" name="Compliance %" radius={[4,4,0,0]}>
                    <LabelList dataKey="complianceRate" position="top" fontSize={11} formatter={v=>`${v}%`}/>
                    {byDefinition.map((e,i) => <Cell key={i} fill={e.complianceRate>=80?'#22C55E':e.complianceRate>=50?'#F59E0B':'#EF4444'}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="qa-chart-card qa-chart-narrow">
          <h3 className="qa-chart-title">SLA Health Distribution</h3>
          {pieData.length === 0 ? (
            <div className="qa-no-data">No data yet.</div>
          ) : (
            <>
              <div ref={pieChartRef}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={56} outerRadius={85} paddingAngle={3} dataKey="value">
                      {pieData.map((e,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v,n]}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="qa-pie-legend">
                {pieData.map((d,i) => (
                  <div key={d.name} className="qa-pie-leg-item">
                    <span className="qa-pie-dot" style={{ background:PIE_COLORS[i%PIE_COLORS.length] }}/>
                    <span className="qa-pie-leg-name">{d.name}</span>
                    <span className="qa-pie-leg-val">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 30-Day Trend */}
      <div className="qa-chart-card qa-chart-full">
        <h3 className="qa-chart-title">30-Day Breach vs Met Trend</h3>
        <div ref={trendChartRef}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top:10, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8' }} interval={4}/>
              <YAxis allowDecimals={false} tick={{ fontSize:11, fill:'#64748b' }}/>
              <Tooltip content={<CustomTooltipLine/>}/>
              <Legend wrapperStyle={{ fontSize:12 }}/>
              <Line type="monotone" dataKey="met"      name="Met"      stroke="#22C55E" strokeWidth={2} dot={false} activeDot={{ r:5 }}/>
              <Line type="monotone" dataKey="breached" name="Breached" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r:5 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Definition Breakdown Table */}
      <div className="qa-section">
        <h3 className="qa-section-title">SLA Definition Breakdown <span className="qa-drill-hint">Click numbers to drill into tickets</span></h3>
        <div className="qa-table-wrap">
          <table className="qa-table">
            <thead>
              <tr><th>SLA Name</th><th>Trigger</th><th>Target</th><th>Total</th><th>Met</th><th>Breached</th><th>Active</th><th>Compliance</th><th>Avg Elapsed</th></tr>
            </thead>
            <tbody>
              {byDefinition.length === 0 ? (
                <tr><td colSpan={9} className="qa-td-empty">No SLA definitions found.</td></tr>
              ) : byDefinition.map((r,i) => (
                <tr key={i}>
                  <td className="qa-td-name">{r.sla_name}</td>
                  <td><span className="qa-status-pill">{r.start_status}</span></td>
                  <td>{fmtMin(r.duration_minutes)}</td>
                  <CountCell value={r.total}    definitionId={r.id} slaName={r.sla_name} stage="all"      className=""/>
                  <CountCell value={r.met}      definitionId={r.id} slaName={r.sla_name} stage="met"      className="qa-td-green"/>
                  <CountCell value={r.breached} definitionId={r.id} slaName={r.sla_name} stage="breached" className={r.breached>0?'qa-td-red':''}/>
                  <CountCell value={r.active}   definitionId={r.id} slaName={r.sla_name} stage="active"   className=""/>
                  <td>
                    <div className="qa-compliance-cell">
                      <div className="qa-compliance-bar-bg">
                        <div className="qa-compliance-bar-fill" style={{ width:`${r.complianceRate}%`, background:r.complianceRate>=80?'#22C55E':r.complianceRate>=50?'#F59E0B':'#EF4444' }}/>
                      </div>
                      <span className="qa-compliance-pct" style={{ color:r.complianceRate>=80?'#15803d':r.complianceRate>=50?'#b45309':'#dc2626' }}>{r.complianceRate}%</span>
                    </div>
                  </td>
                  <td>{fmtMin(r.avgElapsedMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Instances Table */}
      <div className="qa-section">
        <div className="qa-section-header">
          <h3 className="qa-section-title" style={{ margin:0, padding:0 }}>
            All SLA Instances <span className="qa-count-badge">{filteredInstances.length}</span>
          </h3>
          <div className="qa-table-filters">
            <select className="qa-filter-sel" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
              <option value="all">All Stages</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="breached">Breached</option>
            </select>
            <input className="qa-search" placeholder="Search ticket, SLA, assignee…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
        <div className="qa-table-wrap">
          <table className="qa-table">
            <thead>
              <tr><th>Ticket #</th><th>Short Description</th><th>SLA Name</th><th>Stage</th><th>Priority</th><th>Assigned To</th><th>Started</th><th>Target</th><th>Completed / Breached</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filteredInstances.length === 0 ? (
                <tr><td colSpan={10} className="qa-td-empty">No instances found.</td></tr>
              ) : filteredInstances.map(inst => (
                <tr key={inst.id} className={inst.stage==='breached'?'qa-row-breached':''}>
                  <td className="qa-td-ticket">{inst.ticket_number}</td>
                  <td className="qa-td-desc">{inst.short_description}</td>
                  <td className="qa-td-name">{inst.sla_name}</td>
                  <td>{stageBadge(inst.stage)}</td>
                  <td>{priorityBadge(inst.priority)}</td>
                  <td>{inst.assigned_to_name||'—'}</td>
                  <td className="qa-td-date">{fmtDate(inst.started_at)}</td>
                  <td className="qa-td-date">{fmtDate(inst.target_at)}</td>
                  <td className="qa-td-date">
                    {inst.stage==='breached' ? <span className="qa-val-red">{fmtDate(inst.breached_at)}</span>
                     : inst.stage==='completed' ? <span className="qa-val-green">{fmtDate(inst.completed_at)}</span>
                     : '—'}
                  </td>
                  <td>
                    <button className="drill-view-btn" onClick={() => window.location.href=`/tickets/${inst.ticket_id}`}>
                      <ExternalLink size={13}/> View
                    </button>
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
