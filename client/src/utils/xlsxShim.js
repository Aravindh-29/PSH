import ExcelJS from 'exceljs';

// Convert 6-char rgb hex → 8-char argb (exceljs requires ARGB with alpha prefix)
const toArgb = (rgb) => (rgb ? `FF${rgb.toUpperCase()}` : null);

// Translate xlsx-js-style cell style object → exceljs style
function toEjsStyle(s) {
  if (!s) return {};
  const out = {};

  if (s.fill?.fgColor?.rgb) {
    out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(s.fill.fgColor.rgb) } };
  }
  if (s.font) {
    out.font = {
      name:   s.font.name  || 'Calibri',
      size:   s.font.sz    || 10,
      bold:   s.font.bold  || false,
      italic: s.font.italic || false,
    };
    if (s.font.color?.rgb) out.font.color = { argb: toArgb(s.font.color.rgb) };
  }
  if (s.alignment) {
    out.alignment = {
      horizontal:    s.alignment.horizontal || 'left',
      vertical:      s.alignment.vertical === 'center' ? 'middle' : (s.alignment.vertical || 'middle'),
      wrapText:      s.alignment.wrapText || false,
    };
    if (s.alignment.textRotation != null) out.alignment.textRotation = s.alignment.textRotation;
  }
  if (s.border) {
    const side = (b) => b ? { style: b.style || 'thin', color: { argb: toArgb(b.color?.rgb || 'D1D5DB') } } : undefined;
    out.border = { top: side(s.border.top), bottom: side(s.border.bottom), left: side(s.border.left), right: side(s.border.right) };
  }
  return out;
}

// Apply an aoa sheet definition to an exceljs worksheet
function applySheet(wb, sheetDef, name) {
  const views = sheetDef['!freeze']
    ? [{ state: 'frozen', xSplit: sheetDef['!freeze'].xSplit, ySplit: sheetDef['!freeze'].ySplit }]
    : [];
  const ws = wb.addWorksheet(name, { views });

  (sheetDef._data || []).forEach((row) => {
    const vals = row.map((cell) => (cell && typeof cell === 'object' ? (cell.v ?? '') : (cell ?? '')));
    const exRow = ws.addRow(vals);
    row.forEach((cell, ci) => {
      if (!cell || typeof cell !== 'object' || !cell.s) return;
      const ec = exRow.getCell(ci + 1);
      const style = toEjsStyle(cell.s);
      if (style.fill)      ec.fill      = style.fill;
      if (style.font)      ec.font      = style.font;
      if (style.alignment) ec.alignment = style.alignment;
      if (style.border)    ec.border    = style.border;
    });
  });

  (sheetDef['!merges'] || []).forEach((m) =>
    ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1)
  );
  (sheetDef['!cols'] || []).forEach((col, i) => {
    if (col?.wch) ws.getColumn(i + 1).width = col.wch;
  });
  (sheetDef['!rows'] || []).forEach((row, i) => {
    if (row?.hpt) ws.getRow(i + 1).height = row.hpt;
  });
}

// Drop-in replacement for xlsx-js-style used in Reports/GlobalReports
const XLSX = {
  utils: {
    book_new: () => {
      const wb = new ExcelJS.Workbook();
      wb._pendingSheets = [];
      return wb;
    },
    aoa_to_sheet: (data) => ({ _data: data }),
    book_append_sheet: (wb, ws, name) => { wb._pendingSheets.push({ ws, name }); },
  },
  writeFile: async (wb, filename) => {
    wb._pendingSheets.forEach(({ ws, name }) => applySheet(wb, ws, name));
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export default XLSX;
