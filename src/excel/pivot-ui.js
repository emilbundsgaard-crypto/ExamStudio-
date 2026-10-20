// Excel-style PivotTables for the built-in spreadsheet: Insert PivotTable dialog, the
// "PivotTable Fields" pane (field list + Filters / Columns / Rows / Σ Values), field menus,
// Value Field Settings, report layout options. The report is written into a sheet as values.
import { build, itemsOf, AGGS, SHOW, valueName, defaultAgg } from './pivot-core.js';

const el = (tag, attrs = {}, ...kids) => {
  const [name, ...cls] = tag.split('.');
  const e = document.createElement(name);
  if (cls.length) e.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};
const colName = (j) => { let s = ''; j += 1; while (j > 0) { const m = (j - 1) % 26; s = String.fromCharCode(65 + m) + s; j = Math.floor((j - 1) / 26); } return s; };
const quote = (n) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
const AREAS = [['filters', 'Filters', '⏷'], ['cols', 'Columns', '⫼'], ['rows', 'Rows', '≡'], ['values', 'Values', 'Σ']];

/**
 * ctx: { api (univerAPI), host (element that holds the grid), dateCols: { sheetName: {colIdx: fmt} } }
 */
export function createPivotTool(ctx) {
  const pivots = []; // { name, sheet, src: {sheet, r0, c0, r1, c1}, data, fields, cfg, extent }
  let pane = null; let current = null;

  // ---------------------------------------------------------- source & output
  function readSource(src) {
    const ws = ctx.api.getActiveWorkbook().getSheetByName(src.sheet);
    // raw values: the facade's getValues() returns dates/percentages as formatted text
    const m = ws.getSheet().getCellMatrix();
    const vals = [];
    for (let r = src.r0; r <= src.r1; r++) {
      const row = new Array(src.c1 - src.c0 + 1);
      for (let c = src.c0; c <= src.c1; c++) { const cell = m.getValue(r, c); row[c - src.c0] = cell ? (cell.v ?? (cell.p ? cell.p.body?.dataStream?.replace(/\r?\n$/, '') : null)) : null; }
      vals.push(row);
    }
    const header = vals[0];
    const dc = ctx.dateCols[src.sheet] || {};
    const seen = new Map();
    const fields = header.map((h, j) => {
      let name = h === null || h === undefined || h === '' ? `Column${j + 1}` : String(h);
      const n = (seen.get(name) || 0) + 1; seen.set(name, n); if (n > 1) name = `${name}${n}`;
      return { name, index: j, date: String(src.c0 + j) in dc };
    });
    const data = vals.slice(1).filter((r) => r.some((v) => v !== null && v !== undefined && v !== ''));
    return { fields, data };
  }

  function render(p) {
    const wb = ctx.api.getActiveWorkbook();
    const ws = wb.getSheetByName(p.sheet);
    if (!ws) return;
    const res = build(p.data, p.fields, p.cfg);
    const { grid } = res;
    const width = Math.max(1, ...grid.map((r) => r.length));
    const height = grid.length;
    // grow the sheet when the report is bigger than it (new sheets have 1000 rows × 20 columns)
    try {
      if (ws.getMaxRows() < p.at.r + height + 50) ws.setRowCount(p.at.r + height + 200);
      if (ws.getMaxColumns() < p.at.c + width + 5) ws.setColumnCount(p.at.c + width + 10);
    } catch { /* ignore */ }
    // clear what the previous version of this report wrote
    if (p.extent) ws.getRange(p.at.r, p.at.c, p.extent.h, p.extent.w).clear();
    // one write: values + Excel-like styling (bold header/subtotal/grand rows, blue fill, % format)
    const block = grid.map((r) => Array.from({ length: width }, (_, j) => {
      const v = r[j] === undefined ? null : r[j];
      return v === null ? { v: null } : typeof v === 'number' ? { v, t: 2 } : { v: String(v), t: 1 };
    }));
    const st = (r, c) => (block[r][c].s ??= {});
    for (const s of res.styles) {
      const nr = s.nr || 1, nc = s.kind === 'filter' ? 1 : s.nc || 1;
      for (let r = s.r; r < s.r + nr && r < height; r++) for (let c = s.c; c < s.c + nc && c < width; c++) {
        const o = st(r, c); o.bl = 1;
        if (s.kind === 'header' || s.kind === 'grand') o.bg = { rgb: '#DDEBF7' };
        if (s.kind === 'grand') o.bd = { t: { s: 1, cl: { rgb: '#8EA9DB' } } };
      }
    }
    for (const f of res.formats) if (block[f.r]?.[f.c]) st(f.r, f.c).n = { pattern: f.fmt };
    ws.getRange(p.at.r, p.at.c, height, width).setValues(block);
    p.extent = { h: height, w: width };
    p.lastRows = res.rowsUsed;
    try { // fit column widths like Excel's "Autofit column widths on update"
      for (let j = 0; j < width; j++) {
        let len = 0;
        for (let r = 0; r < Math.min(height, 300); r++) { const v = grid[r]?.[j]; if (v !== null && v !== undefined) len = Math.max(len, typeof v === 'number' ? String(Math.round(v * 100) / 100).length + 2 : String(v).length); }
        ws.setColumnWidth(p.at.c + j, Math.min(320, Math.max(64, Math.round(len * 7.6 + 18))));
      }
    } catch { /* ignore */ }
    if (pane && current === p) pane.querySelector('.pv-status').textContent = `${p.lastRows.toLocaleString('en-US')} source rows · ${height} × ${width} cells`;
  }

  // ---------------------------------------------------------- Create PivotTable dialog
  function dataSheets() { return ctx.api.getActiveWorkbook().getSheets().map((s) => s.getSheetName()).filter((n) => n !== 'Work' && !pivots.some((p) => p.sheet === n)); }
  function defaultRange(name) {
    const ws = ctx.api.getActiveWorkbook().getSheetByName(name);
    const lr = ws.getLastRow(), lc = ws.getLastColumn();
    return `${quote(name)}!$A$1:$${colName(Math.max(0, lc))}$${Math.max(1, lr + 1)}`;
  }
  function parseRange(text) {
    const m = String(text).trim().match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i);
    if (!m) return null;
    const sheet = (m[1] ?? m[2]).replace(/''/g, "'");
    const ci = (s) => s.toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    return { sheet, r0: Number(m[4]) - 1, c0: ci(m[3]), r1: Number(m[6]) - 1, c1: ci(m[5]) };
  }
  function openCreate() {
    const wb = ctx.api.getActiveWorkbook();
    const active = wb.getActiveSheet().getSheetName();
    const sheets = dataSheets();
    const srcName = sheets.includes(active) ? active : sheets[0];
    const rangeIn = el('input.pv-in', { value: defaultRange(srcName) });
    const sheetSel = el('select.pv-in', { onChange: () => { rangeIn.value = defaultRange(sheetSel.value); } }, sheets.map((s) => el('option', { value: s, selected: s === srcName || undefined }, s)));
    const where = el('input.pv-in', { value: 'Work!$A$1', disabled: true });
    const rNew = el('input', { type: 'radio', name: 'pvwhere', checked: true, onChange: () => { where.disabled = true; } });
    const rOld = el('input', { type: 'radio', name: 'pvwhere', onChange: () => { where.disabled = false; where.focus(); } });
    const err = el('div.pv-err');
    const close = () => back.remove();
    const ok = () => {
      const src = parseRange(rangeIn.value);
      if (!src || !wb.getSheetByName(src.sheet) || src.r1 <= src.r0) { err.textContent = 'Reference is not valid. Use e.g. NYC_Film_Permits!$A$1:$N$33503'; return; }
      let sheet, at = { r: 0, c: 0 };
      if (rNew.checked) {
        let n = 1; while (wb.getSheetByName(`PivotTable${n}`)) n++;
        sheet = `PivotTable${n}`;
        wb.insertSheet(sheet);
      } else {
        const m = where.value.trim().match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)$/i);
        if (!m || !wb.getSheetByName((m[1] ?? m[2]).replace(/''/g, "'"))) { err.textContent = 'Destination reference is not valid, e.g. Work!$A$1'; return; }
        sheet = (m[1] ?? m[2]).replace(/''/g, "'");
        at = { r: Number(m[4]) - 1, c: m[3].toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 };
      }
      const { fields, data } = readSource(src);
      const p = { name: `PivotTable${pivots.length + 1}`, sheet, at, src, fields, data, cfg: { rows: [], cols: [], filters: [], values: [], keep: {}, sort: {}, group: {}, layout: 'compact', grandRows: true, grandCols: true, subtotals: true } };
      pivots.push(p);
      close();
      wb.setActiveSheet(wb.getSheetByName(sheet));
      render(p);
      showPane(p);
    };
    const back = el('div.pv-modal-back', { onClick: (e) => { if (e.target === back) close(); } },
      el('div.pv-modal', {},
        el('div.pv-modal-title', {}, 'Create PivotTable'),
        el('div.pv-label', {}, 'Choose the data that you want to analyze'),
        el('div.pv-row', {}, el('span', {}, 'Table/Range:'), rangeIn),
        el('div.pv-row', {}, el('span', {}, 'Sheet:'), sheetSel),
        el('div.pv-label', {}, 'Choose where you want the PivotTable report to be placed'),
        el('label.pv-radio', {}, rNew, ' New Worksheet'),
        el('label.pv-radio', {}, rOld, ' Existing Worksheet'),
        el('div.pv-row', {}, el('span', {}, 'Location:'), where),
        err,
        el('div.pv-actions', {}, el('button.pv-btn.primary', { onClick: ok }, 'OK'), el('button.pv-btn', { onClick: close }, 'Cancel'))));
    document.body.append(back);
    rangeIn.focus(); rangeIn.select();
  }

  // ---------------------------------------------------------- PivotTable Fields pane
  function hidePane() { pane?.remove(); pane = null; current = null; ctx.host.classList.remove('with-pivot'); window.dispatchEvent(new Event('resize')); }
  function showPane(p) {
    current = p;
    pane?.remove();
    pane = el('div.pv-pane');
    ctx.host.classList.add('with-pivot');
    ctx.host.append(pane);
    drawPane();
    window.dispatchEvent(new Event('resize'));
  }
  const areaOf = (cfg, f) => (cfg.rows.includes(f) ? 'rows' : cfg.cols.includes(f) ? 'cols' : cfg.filters.includes(f) ? 'filters' : cfg.values.some((v) => v.field === f) ? 'values' : null);
  function changed() { render(current); drawPane(); }
  function addTo(area, f, at) {
    const cfg = current.cfg;
    if (area === 'values') {
      const v = { field: f, agg: defaultAgg(current.data, current.fields[f]) };
      at === undefined ? cfg.values.push(v) : cfg.values.splice(at, 0, v);
    } else {
      for (const a of ['rows', 'cols', 'filters']) cfg[a] = cfg[a].filter((x) => x !== f);
      at === undefined ? cfg[area].push(f) : cfg[area].splice(at, 0, f);
      // Excel 365 groups dates automatically when they go to Rows/Columns
      if ((area === 'rows' || area === 'cols') && current.fields[f].date && !(f in cfg.group)) cfg.group[f] = 'years';
    }
  }
  function removeFrom(area, idx) {
    const cfg = current.cfg;
    if (area === 'values') cfg.values.splice(idx, 1); else { const f = cfg[area][idx]; cfg[area].splice(idx, 1); delete cfg.keep[f]; }
  }
  function drawPane() {
    if (!pane || !current) return;
    const p = current; const cfg = p.cfg;
    const search = el('input.pv-search', { type: 'search', placeholder: 'Search' });
    const list = el('div.pv-fields');
    const drawList = () => {
      const t = search.value.trim().toLowerCase();
      list.replaceChildren(...p.fields.map((f, i) => (t && !f.name.toLowerCase().includes(t) ? null : el('label.pv-field', {
        draggable: 'true', onDragstart: (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ f: i })),
      }, el('input', { type: 'checkbox', checked: !!areaOf(cfg, i) || undefined, onChange: (e) => {
        if (e.target.checked) addTo(defaultAgg(p.data, f) === 'sum' && !f.date ? 'values' : 'rows', i);
        else { for (const a of ['rows', 'cols', 'filters']) cfg[a] = cfg[a].filter((x) => x !== i); cfg.values = cfg.values.filter((v) => v.field !== i); delete cfg.keep[i]; }
        changed();
      } }), ' ', f.name, f.date ? el('span.pv-date', {}, ' (date)') : null))).filter(Boolean));
    };
    search.addEventListener('input', drawList);
    drawList();
    const box = (area, title, icon) => {
      const items = area === 'values' ? cfg.values.map((v, i) => ({ label: valueName(v, p.fields), idx: i, f: v.field })) : cfg[area].map((f, i) => ({ label: p.fields[f].name + (cfg.group[f] && p.fields[f].date ? ` (${cfg.group[f]})` : '') + (Array.isArray(cfg.keep[f]) ? ' ⧩' : ''), idx: i, f }));
      const b = el('div.pv-area', {
        onDragover: (e) => { e.preventDefault(); b.classList.add('over'); },
        onDragleave: () => b.classList.remove('over'),
        onDrop: (e) => {
          e.preventDefault(); b.classList.remove('over');
          let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
          if (d.from) removeFrom(d.from, d.idx);
          addTo(area, d.f);
          changed();
        },
      }, el('div.pv-area-title', {}, el('span.pv-ico', {}, icon), title),
      items.map((it) => el('div.pv-chip', { draggable: 'true', onDragstart: (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ f: it.f, from: area, idx: it.idx })) },
        el('span', {}, it.label), el('button.pv-caret', { title: 'Field options', onClick: (e) => { e.stopPropagation(); fieldMenu(e.currentTarget, area, it.idx, it.f); } }, '▾'))));
      return b;
    };
    pane.replaceChildren(
      el('div.pv-head', {}, el('b', {}, 'PivotTable Fields'), el('button.pv-x', { title: 'Close', onClick: hidePane }, '✕')),
      el('div.pv-sub', {}, `${p.name} · source ${quote(p.src.sheet)}!${colName(p.src.c0)}${p.src.r0 + 1}:${colName(p.src.c1)}${p.src.r1 + 1}`),
      el('div.pv-small', {}, 'Choose fields to add to report:'), search, list,
      el('div.pv-small', {}, 'Drag fields between areas below:'),
      el('div.pv-areas', {}, AREAS.map(([a, t, i]) => box(a, t, i))),
      el('div.pv-opts', {},
        el('label', {}, 'Report Layout ', el('select', { onChange: (e) => { cfg.layout = e.target.value; changed(); } }, el('option', { value: 'compact', selected: cfg.layout === 'compact' || undefined }, 'Compact Form'), el('option', { value: 'tabular', selected: cfg.layout === 'tabular' || undefined }, 'Tabular Form'))),
        el('label', {}, el('input', { type: 'checkbox', checked: cfg.grandRows || undefined, onChange: (e) => { cfg.grandRows = e.target.checked; changed(); } }), ' Grand Totals for Columns'),
        el('label', {}, el('input', { type: 'checkbox', checked: cfg.grandCols || undefined, onChange: (e) => { cfg.grandCols = e.target.checked; changed(); } }), ' Grand Totals for Rows'),
        el('label', {}, el('input', { type: 'checkbox', checked: cfg.subtotals || undefined, onChange: (e) => { cfg.subtotals = e.target.checked; changed(); } }), ' Subtotals')),
      el('div.pv-foot', {}, el('button.pv-btn', { onClick: () => { const s = readSource(p.src); p.fields = s.fields; p.data = s.data; changed(); }, title: 'Re-read the source data (e.g. after adding a helper column)' }, '⟳ Refresh'),
        el('button.pv-btn', { onClick: () => openCreate() }, '+ New PivotTable'),
        el('span.pv-status.pv-small', {}, '')));
    pane.querySelector('.pv-status').textContent = p.lastRows !== undefined ? `${p.lastRows.toLocaleString('en-US')} source rows · ${p.extent?.h || 0} × ${p.extent?.w || 0} cells` : '';
  }

  // ---------------------------------------------------------- menus
  let menuEl = null;
  const closeMenu = () => { menuEl?.remove(); menuEl = null; };
  document.addEventListener('mousedown', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
  function menuAt(anchor, items) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    menuEl = el('div.pv-menu', { style: { top: `${Math.min(r.bottom + 2, window.innerHeight - 20)}px`, left: `${Math.max(8, r.right - 230)}px` } },
      items.map((it) => (it === '-' ? el('div.pv-sep') : el('button.pv-mi', { disabled: it.disabled || undefined, onClick: () => { closeMenu(); it.run(); } }, it.label))));
    document.body.append(menuEl);
    const mr = menuEl.getBoundingClientRect();
    if (mr.bottom > window.innerHeight) menuEl.style.top = `${Math.max(8, r.top - mr.height - 2)}px`;
  }
  function fieldMenu(anchor, area, idx, f) {
    const cfg = current.cfg;
    const arr = area === 'values' ? cfg.values : cfg[area];
    const move = (to) => { const v = arr[idx]; removeFrom(area, idx); addTo(to, area === 'values' ? v.field : f); changed(); };
    const items = [
      { label: 'Move Up', disabled: idx === 0, run: () => { [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; changed(); } },
      { label: 'Move Down', disabled: idx === arr.length - 1, run: () => { [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]]; changed(); } },
      '-',
      { label: 'Move to Report Filter', disabled: area === 'filters', run: () => move('filters') },
      { label: 'Move to Row Labels', disabled: area === 'rows', run: () => move('rows') },
      { label: 'Move to Column Labels', disabled: area === 'cols', run: () => move('cols') },
      { label: 'Move to Values', disabled: area === 'values', run: () => move('values') },
      '-',
      { label: 'Remove Field', run: () => { removeFrom(area, idx); changed(); } },
    ];
    if (area === 'values') items.push('-', { label: 'Value Field Settings…', run: () => valueSettings(idx) });
    else {
      items.push('-', { label: 'Filter…', run: () => filterDialog(f) });
      if (area !== 'filters') items.push(
        { label: 'Sort A to Z', run: () => { cfg.sort[f] = 'asc'; changed(); } },
        { label: 'Sort Z to A', run: () => { cfg.sort[f] = 'desc'; changed(); } },
        { label: 'Sort by Value (largest first)', disabled: !cfg.values.length, run: () => { cfg.sort[f] = 'value'; changed(); } },
        { label: 'Sort by Value (smallest first)', disabled: !cfg.values.length, run: () => { cfg.sort[f] = 'valueAsc'; changed(); } });
      if (current.fields[f].date) items.push('-', ...[['years', 'Group: Years'], ['quarters', 'Group: Quarters'], ['months', 'Group: Months'], ['yearmonth', 'Group: Months & Years'], ['days', 'Group: Days'], [null, 'Ungroup (each date/time)']].map(([g, l]) => ({ label: (cfg.group[f] === g || (!g && !cfg.group[f]) ? '✓ ' : ' ') + l, run: () => { if (g) cfg.group[f] = g; else delete cfg.group[f]; delete cfg.keep[f]; changed(); } })));
    }
    menuAt(anchor, items);
  }
  function modal(title, body, onOk) {
    const back = el('div.pv-modal-back', { onClick: (e) => { if (e.target === back) back.remove(); } },
      el('div.pv-modal', {}, el('div.pv-modal-title', {}, title), body,
        el('div.pv-actions', {}, el('button.pv-btn.primary', { onClick: () => { if (onOk() !== false) back.remove(); } }, 'OK'), el('button.pv-btn', { onClick: () => back.remove() }, 'Cancel'))));
    document.body.append(back);
  }
  function valueSettings(idx) {
    const v = current.cfg.values[idx];
    const name = el('input.pv-in', { value: valueName(v, current.fields) });
    const agg = el('select.pv-list', { size: 10 }, Object.entries(AGGS).map(([k, l]) => el('option', { value: k, selected: k === v.agg || undefined }, l)));
    const show = el('select.pv-in', {}, Object.entries(SHOW).map(([k, l]) => el('option', { value: k, selected: k === (v.show || 'none') || undefined }, l)));
    agg.addEventListener('change', () => { if (!v.name) name.value = `${AGGS[agg.value]} of ${current.fields[v.field].name}`; });
    modal('Value Field Settings', el('div', {},
      el('div.pv-small', {}, `Source Name: ${current.fields[v.field].name}`),
      el('div.pv-row', {}, el('span', {}, 'Custom Name:'), name),
      el('div.pv-label', {}, 'Summarize value field by'), el('div.pv-small', {}, 'Choose the type of calculation that you want to use to summarize data from the selected field'), agg,
      el('div.pv-label', {}, 'Show Values As'), show), () => {
      v.agg = agg.value; v.show = show.value === 'none' ? undefined : show.value;
      const auto = `${AGGS[v.agg]} of ${current.fields[v.field].name}`;
      v.name = name.value.trim() && name.value.trim() !== auto && !Object.values(AGGS).some((a) => name.value.trim() === `${a} of ${current.fields[v.field].name}`) ? name.value.trim() : undefined;
      changed();
    });
  }
  function filterDialog(f) {
    const cfg = current.cfg;
    const all = itemsOf(current.data, current.fields[f], cfg.group[f]);
    const kept = new Set(Array.isArray(cfg.keep[f]) ? cfg.keep[f] : all);
    const q = el('input.pv-in', { type: 'search', placeholder: 'Search' });
    const listEl = el('div.pv-checks');
    const selAll = el('input', { type: 'checkbox' });
    const sync = () => { selAll.checked = kept.size === all.length; selAll.indeterminate = kept.size > 0 && kept.size < all.length; };
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const shown = all.filter((x) => !t || x.toLowerCase().includes(t)).slice(0, 1000);
      listEl.replaceChildren(...shown.map((x) => el('label', {}, el('input', { type: 'checkbox', checked: kept.has(x) || undefined, onChange: (e) => { if (e.target.checked) kept.add(x); else kept.delete(x); sync(); } }), ' ', x)),
        all.length > 1000 && !t ? el('div.pv-small', {}, `Showing 1,000 of ${all.length.toLocaleString('en-US')} items – search to find more.`) : null);
      sync();
    };
    selAll.addEventListener('change', () => { if (selAll.checked) all.forEach((x) => kept.add(x)); else kept.clear(); draw(); });
    q.addEventListener('input', draw);
    draw();
    modal(`Filter: ${current.fields[f].name}`, el('div', {}, q, el('label.pv-all', {}, selAll, ' (Select All)'), listEl), () => {
      if (!kept.size) { alert('Select at least one item.'); return false; }
      cfg.keep[f] = kept.size === all.length ? null : [...kept];
      changed();
    });
  }

  // ---------------------------------------------------------- follow the active sheet like Excel
  try {
    ctx.api.addEvent(ctx.api.Event.ActiveSheetChanged, () => {
      const name = ctx.api.getActiveWorkbook().getActiveSheet().getSheetName();
      const p = pivots.find((x) => x.sheet === name);
      if (p) showPane(p); else if (pane) hidePane();
    });
  } catch { /* events unavailable */ }

  return {
    insert: () => { const name = ctx.api.getActiveWorkbook().getActiveSheet().getSheetName(); const p = pivots.find((x) => x.sheet === name); if (p) showPane(p); else openCreate(); },
    toggle: () => { if (pane) hidePane(); else { const name = ctx.api.getActiveWorkbook().getActiveSheet().getSheetName(); const p = pivots.find((x) => x.sheet === name) || pivots[pivots.length - 1]; if (p) { ctx.api.getActiveWorkbook().setActiveSheet(ctx.api.getActiveWorkbook().getSheetByName(p.sheet)); showPane(p); } else openCreate(); } },
    dispose: () => { hidePane(); closeMenu(); },
    count: () => pivots.length,
  };
}
