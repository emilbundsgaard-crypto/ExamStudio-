// PivotTable engine (pure, no DOM). Reproduces how Excel 365 lays out and summarises a PivotTable.
//
// data:   array of rows (arrays), header excluded
// fields: [{ name, index, date }]
// cfg: {
//   rows: [f], cols: [f], filters: [f],                       f = field position in `fields`
//   values: [{ field, agg, show }],                            agg in AGGS, show in SHOW
//   keep: { [f]: string[] | null },                            visible items per field (null = all)
//   sort: { [f]: 'asc' | 'desc' | 'value' },                   item order per row/column field
//   group: { [f]: 'years'|'quarters'|'months'|'days'|'yearmonth' },  date grouping
//   layout: 'compact' | 'tabular', grandRows: bool, grandCols: bool, subtotals: bool
// }

export const AGGS = { sum: 'Sum', count: 'Count', average: 'Average', max: 'Max', min: 'Min', product: 'Product', countnum: 'Count Numbers', stdev: 'StdDev', var: 'Var', distinct: 'Distinct Count' };
export const SHOW = { none: 'No Calculation', grand: '% of Grand Total', col: '% of Column Total', row: '% of Row Total', parent: '% of Parent Row Total' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const BLANK = '(blank)';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBlank = (v) => v === null || v === undefined || v === '';
function parts(v) { const d = new Date(Math.round((v - 25569) * 86400000)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; }

/** Item label + sort key of a cell value. */
export function item(v, field, group) {
  if (isBlank(v)) return { label: BLANK, key: [3, 0] };
  if (field?.date && isNum(v)) {
    const p = parts(v);
    switch (group) {
      case 'years': return { label: String(p.y), key: [0, p.y] };
      case 'quarters': return { label: `Qtr${Math.ceil(p.m / 3)}`, key: [0, Math.ceil(p.m / 3)] };
      case 'months': return { label: MONTHS[p.m - 1], key: [0, p.m] };
      case 'yearmonth': return { label: `${MONTHS[p.m - 1]} ${p.y}`, key: [0, p.y * 100 + p.m] };
      case 'days': return { label: `${p.m}/${p.d}/${p.y}`, key: [0, Math.floor(v)] };
      default: {
        const t = v % 1 > 1e-9 ? ` ${p.h}:${String(p.mi).padStart(2, '0')}` : '';
        return { label: `${p.m}/${p.d}/${p.y}${t}`, key: [0, v] };
      }
    }
  }
  if (isNum(v)) return { label: v, key: [0, v] };
  if (typeof v === 'boolean') return { label: v ? 'TRUE' : 'FALSE', key: [2, v ? 1 : 0] };
  const s = String(v);
  return { label: s, key: [1, s.toLowerCase()] };
}
const cmp = (a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

/** Distinct items of a field (for filter lists), sorted like Excel. */
export function itemsOf(data, field, group) {
  const m = new Map();
  for (const r of data) { const it = item(r[field.index], field, group); const k = String(it.label); if (!m.has(k)) m.set(k, it); }
  return [...m.values()].sort((a, b) => cmp(a.key, b.key)).map((x) => String(x.label));
}

function acc() { return { n: 0, nn: 0, sum: 0, sq: 0, prod: 1, max: -Infinity, min: Infinity, set: null }; }
function push(a, v, distinct) {
  if (isBlank(v)) return;
  a.n++;
  if (isNum(v)) { a.nn++; a.sum += v; a.sq += v * v; a.prod *= v; if (v > a.max) a.max = v; if (v < a.min) a.min = v; }
  if (distinct) (a.set ??= new Set()).add(typeof v === 'string' ? v.trim().toLowerCase() : v);
}
function out(a, agg) {
  if (!a || !a.n) return null;
  switch (agg) {
    case 'sum': return a.sum;
    case 'count': return a.n;
    case 'countnum': return a.nn;
    case 'average': return a.nn ? a.sum / a.nn : '#DIV/0!';
    case 'max': return a.nn ? a.max : 0;
    case 'min': return a.nn ? a.min : 0;
    case 'product': return a.nn ? a.prod : 0;
    case 'stdev': return a.nn > 1 ? Math.sqrt((a.sq - (a.sum * a.sum) / a.nn) / (a.nn - 1)) : '#DIV/0!';
    case 'var': return a.nn > 1 ? (a.sq - (a.sum * a.sum) / a.nn) / (a.nn - 1) : '#DIV/0!';
    case 'distinct': return a.set ? a.set.size : 0;
    default: return null;
  }
}
export const valueName = (v, fields) => v.name || `${AGGS[v.agg]} of ${fields[v.field].name}`;
export const defaultAgg = (data, field) => (data.slice(0, 500).some((r) => !isBlank(r[field.index])) && data.slice(0, 500).every((r) => isBlank(r[field.index]) || isNum(r[field.index])) ? 'sum' : 'count');

/**
 * Build the PivotTable. Returns { cells: any[][], styles: [{r, c, nr, nc, kind}], formats: [{r,c,nr,nc,fmt}] }
 * relative to the top-left cell of the report (filters included).
 */
export function build(data, fields, cfg) {
  const group = cfg.group || {};
  const keep = cfg.keep || {};
  const V = cfg.values || [];
  const layout = cfg.layout || 'compact';
  const grandRows = cfg.grandRows !== false, grandCols = cfg.grandCols !== false, subtotals = cfg.subtotals !== false;
  const lab = (r, f) => String(item(r[fields[f].index], fields[f], group[f]).label);
  // 1. filters (report filters + item filters on row/column fields)
  const filt = Object.entries(keep).filter(([, k]) => Array.isArray(k)).map(([f, k]) => [Number(f), new Set(k)]);
  const rows = filt.length ? data.filter((r) => filt.every(([f, s]) => s.has(lab(r, f)))) : data;
  const R = cfg.rows || [], C = cfg.cols || [];
  const distinct = V.map((v) => v.agg === 'distinct');
  // 2. accumulate: every row contributes to all row-prefix × column-prefix combinations
  const cells = new Map();
  const rowTree = new Map(); const colTree = new Map(); // key -> {labels, keys}
  const add = (k, r) => { let a = cells.get(k); if (!a) { a = V.map(() => acc()); cells.set(k, a); } V.forEach((v, i) => push(a[i], r[fields[v.field].index], distinct[i])); };
  for (const r of rows) {
    const rl = R.map((f) => item(r[fields[f].index], fields[f], group[f]));
    const cl = C.map((f) => item(r[fields[f].index], fields[f], group[f]));
    const rks = [], cks = [];
    for (let d = 0; d <= rl.length; d++) { const k = rl.slice(0, d).map((x) => String(x.label)).join('\u0001'); rks.push(d + ':' + k); if (d && !rowTree.has(d + ':' + k)) rowTree.set(d + ':' + k, rl.slice(0, d)); }
    for (let d = 0; d <= cl.length; d++) { const k = cl.slice(0, d).map((x) => String(x.label)).join('\u0001'); cks.push(d + ':' + k); if (d && !colTree.has(d + ':' + k)) colTree.set(d + ':' + k, cl.slice(0, d)); }
    for (const rk of rks) for (const ck of cks) add(rk + '|' + ck, r);
  }
  const val = (rk, ck, i) => out(cells.get(rk + '|' + ck)?.[i], V[i].agg);
  // 3. order items: hierarchical sort with per-field order
  const order = (tree, F) => {
    const byParent = new Map();
    for (const [k, labels] of tree) {
      const d = labels.length; const parent = (d - 1) + ':' + labels.slice(0, d - 1).map((x) => String(x.label)).join('\u0001');
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push([k, labels]);
    }
    const res = [];
    const walk = (parent, depth) => {
      const kids = byParent.get(parent) || [];
      const f = F[depth];
      const how = cfg.sort?.[f] || 'asc';
      kids.sort((a, b) => cmp(a[1][depth].key, b[1][depth].key));
      if (how === 'desc') kids.reverse();
      if (how === 'value' || how === 'valueAsc') {
        const vk = (k) => { const x = tree === rowTree ? val(k, '0:', 0) : val('0:', k, 0); return typeof x === 'number' ? x : -Infinity; };
        kids.sort((a, b) => (how === 'value' ? vk(b[0]) - vk(a[0]) : vk(a[0]) - vk(b[0])));
      }
      for (const [k, labels] of kids) { res.push({ k, labels, depth: depth + 1, leaf: depth + 1 === F.length }); walk(k, depth + 1); }
    };
    walk('0:', 0);
    return res;
  };
  const rowItems = order(rowTree, R);
  const colLeaves = order(colTree, C).filter((x) => x.leaf);
  const cols = C.length ? colLeaves : [{ k: '0:', labels: [], leaf: true }];
  const show = (raw, rk, ck, i, parentRk) => {
    const s = V[i].show || 'none';
    if (s === 'none' || typeof raw !== 'number') return raw;
    const den = s === 'grand' ? val('0:', '0:', i) : s === 'col' ? val('0:', ck, i) : s === 'row' ? val(rk, '0:', i) : val(parentRk ?? '0:', ck, i);
    return typeof den === 'number' && den !== 0 ? raw / den : null;
  };

  // 4. lay out
  const grid = []; const styles = []; const formats = [];
  const put = (r, c, v) => { while (grid.length <= r) grid.push([]); grid[r][c] = v; };
  let r = 0;
  for (const f of cfg.filters || []) {
    const k = keep[f];
    put(r, 0, fields[f].name); put(r, 1, !k ? '(All)' : k.length === 1 ? k[0] : '(Multiple Items)');
    styles.push({ r, c: 0, nr: 1, nc: 2, kind: 'filter' }); r++;
  }
  if (cfg.filters?.length) r++;
  else r = 2; // Excel places a new PivotTable at A3
  const top = r;
  if (!V.length && !R.length && !C.length) {
    put(r, 0, 'PivotTable'); put(r + 1, 0, 'To build a report, choose fields from the PivotTable Field List.');
    styles.push({ r, c: 0, nr: 1, nc: 1, kind: 'placeholder' });
    return { grid, styles, formats, top, rowsUsed: rows.length };
  }
  const nLabelCols = layout === 'tabular' ? Math.max(R.length, 1) : 1;
  const multiV = V.length > 1;
  const vCols = V.length ? cols.length * V.length + (C.length && grandCols ? V.length : 0) : cols.length + (C.length && grandCols ? 1 : 0);
  // header block
  if (C.length) {
    put(r, 0, V.length === 1 ? valueName(V[0], fields) : null);
    put(r, nLabelCols, 'Column Labels');
    styles.push({ r, c: 0, nr: 1, nc: nLabelCols + vCols, kind: 'header' }); r++;
    if (multiV) {
      let c = nLabelCols;
      for (const col of cols) { put(r, c, col.labels.map((x) => x.label).join(' – ')); c += V.length; }
      if (grandCols) put(r, c, null);
      styles.push({ r, c: 0, nr: 1, nc: nLabelCols + vCols, kind: 'header' }); r++;
    }
  }
  // the label header row
  if (layout === 'tabular' && R.length) R.forEach((f, j) => put(r, j, fields[f].name));
  else if (R.length) put(r, 0, 'Row Labels');
  else if (C.length) put(r, 0, null);
  let c = nLabelCols;
  if (!R.length && !C.length) c = 0;
  for (const col of cols) {
    if (V.length) for (const v of V) { put(r, c++, C.length ? (multiV ? valueName(v, fields) : col.labels.map((x) => x.label).join(' – ')) : valueName(v, fields)); }
    else put(r, c++, col.labels.map((x) => x.label).join(' – '));
  }
  if (C.length && grandCols) { if (V.length) for (const v of V) put(r, c++, multiV ? `Total ${valueName(v, fields)}` : 'Grand Total'); }
  styles.push({ r, c: 0, nr: 1, nc: Math.max(c, 1), kind: 'header' }); r++;
  const bodyTop = r;
  const pctFmt = (i) => (V[i].show && V[i].show !== 'none' ? '0.00%' : null);
  const emitValues = (rowKey, parentKey) => {
    let cc = (!R.length && !C.length) ? 0 : nLabelCols;
    for (const col of cols) V.forEach((v, i) => { put(r, cc, show(val(rowKey, col.k, i), rowKey, col.k, i, parentKey)); if (pctFmt(i)) formats.push({ r, c: cc, fmt: '0.00%' }); cc++; });
    if (C.length && grandCols) V.forEach((v, i) => { put(r, cc, show(val(rowKey, '0:', i), rowKey, '0:', i, parentKey)); if (pctFmt(i)) formats.push({ r, c: cc, fmt: '0.00%' }); cc++; });
  };
  const parentOf = (it) => (it.depth - 1) + ':' + it.labels.slice(0, it.depth - 1).map((x) => String(x.label)).join('\u0001');
  if (!R.length) { if (C.length) put(r, 0, V.length ? (multiV ? 'Values' : valueName(V[0], fields)) : null); emitValues('0:', null); r++; }
  else if (layout === 'compact') {
    for (const it of rowItems) {
      put(r, 0, (it.depth > 1 ? ' '.repeat(it.depth - 1) : '') + it.labels[it.depth - 1].label);
      if (it.leaf || subtotals) emitValues(it.k, parentOf(it));
      if (!it.leaf) styles.push({ r, c: 0, nr: 1, nc: nLabelCols + vCols, kind: 'subtotal' });
      r++;
    }
  } else {
    // tabular: one column per row field, subtotals below each group
    const stack = [];
    const closeTo = (depth) => {
      while (stack.length > depth) {
        const g = stack.pop();
        if (subtotals && g.depth < R.length) {
          put(r, g.depth - 1, `${g.labels[g.depth - 1].label} Total`);
          emitValues(g.k, parentOf(g));
          styles.push({ r, c: 0, nr: 1, nc: nLabelCols + vCols, kind: 'subtotal' }); r++;
        }
      }
    };
    for (const it of rowItems) {
      closeTo(it.depth - 1);
      if (it.leaf) {
        const first = !grid[r - 1] || stack.length === 0;
        it.labels.forEach((x, j) => { if (j === it.depth - 1 || stack[j]?.fresh) { put(r, j, x.label); if (stack[j]) stack[j].fresh = false; } });
        void first;
        emitValues(it.k, parentOf(it)); r++;
      } else stack.push({ ...it, fresh: true });
    }
    closeTo(0);
  }
  if (R.length && grandRows) {
    put(r, 0, 'Grand Total'); emitValues('0:', null);
    styles.push({ r, c: 0, nr: 1, nc: nLabelCols + vCols, kind: 'grand' }); r++;
  }
  return { grid, styles, formats, top, bodyTop, rowsUsed: rows.length, width: nLabelCols + vCols };
}
