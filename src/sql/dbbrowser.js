// A small "DB Browser for SQLite" for the SQL cases: Execute SQL (highlighting, autocomplete,
// run all / current statement / selection, history, CSV export), Browse Data (filter per column,
// sort, paging, cell viewer, "Show SQL") and Database Structure (tables, columns, keys, indices,
// CREATE statements, likely join keys). Everything is read from the in-browser SQLite worker.
import { h } from '../ui.js';
import { query } from './engine.js';

const qi = (n) => `"${String(n).replace(/"/g, '""')}"`;
const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const KEYWORDS = ('SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET JOIN LEFT RIGHT INNER OUTER FULL CROSS ON USING AS AND OR NOT IN IS NULL LIKE GLOB BETWEEN EXISTS ' +
  'DISTINCT ALL UNION INTERSECT EXCEPT CASE WHEN THEN ELSE END ASC DESC WITH RECURSIVE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW INDEX DROP ALTER ADD ' +
  'PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE CHECK CAST COLLATE NOCASE OVER PARTITION ROWS RANGE PRECEDING FOLLOWING CURRENT ROW TEMP IF REPLACE').split(' ');
const FUNCS = ('COUNT SUM AVG MIN MAX TOTAL ROUND ABS LENGTH UPPER LOWER TRIM LTRIM RTRIM SUBSTR SUBSTRING REPLACE INSTR COALESCE IFNULL NULLIF IIF ' +
  'DATE TIME DATETIME JULIANDAY STRFTIME UNIXEPOCH PRINTF FORMAT GROUP_CONCAT TYPEOF RANDOM ROW_NUMBER RANK DENSE_RANK NTILE LAG LEAD FIRST_VALUE LAST_VALUE CAST').split(' ');
const KW = new Set(KEYWORDS);

// ------------------------------------------------------------------ syntax highlighting
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function highlight(src, names) {
  const re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?|`[^`]*`?|\[[^\]\n]*\]?)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_][\w$]*)(\s*\()?/g;
  let out = ''; let last = 0; let m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index)); last = re.lastIndex;
    const [all, com, str, id, num, word, paren] = m;
    if (com) out += `<span class="hl-com">${esc(com)}</span>`;
    else if (str) out += `<span class="hl-str">${esc(str)}</span>`;
    else if (id) out += `<span class="hl-id">${esc(id)}</span>`;
    else if (num) out += `<span class="hl-num">${num}</span>`;
    else if (word) {
      const u = word.toUpperCase();
      const cls = paren ? 'hl-fn' : KW.has(u) ? 'hl-kw' : names.tables.has(u) ? 'hl-tbl' : names.cols.has(u) ? 'hl-col' : '';
      out += (cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word)) + (paren ? esc(paren) : '');
    } else out += esc(all);
  }
  return out + esc(src.slice(last)) + '\n';
}

/** Split into statements on ';' outside strings/comments; returns [{start,end,text}]. */
export function statements(src) {
  const out = []; let start = 0; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === "'" || c === '"' || c === '`') { const j = src.indexOf(c, i + 1); i = j < 0 ? src.length : j + 1; continue; }
    if (c === ';') { out.push({ start, end: i + 1, text: src.slice(start, i + 1) }); start = i + 1; }
    i++;
  }
  if (src.slice(start).trim()) out.push({ start, end: src.length, text: src.slice(start) });
  return out;
}
const isOnlyComments = (s) => !s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/;/g, '').trim();

// ------------------------------------------------------------------ editor (highlighting + autocomplete)
export function enhanceEditor(editor, getSchema) {
  const pre = h('pre.hl', { 'aria-hidden': 'true' });
  const wrap = h('div.editorwrap', {}, pre);
  editor.replaceWith?.(wrap);
  wrap.append(editor);
  let names = { tables: new Set(), cols: new Set() };
  const refreshNames = () => {
    const s = getSchema() || [];
    names = { tables: new Set(s.map((t) => t.name.toUpperCase())), cols: new Set(s.flatMap((t) => t.cols.map((c) => c.name.toUpperCase()))) };
  };
  const paint = () => { pre.innerHTML = highlight(editor.value, names); pre.scrollTop = editor.scrollTop; pre.scrollLeft = editor.scrollLeft; };
  editor.addEventListener('input', paint);
  editor.addEventListener('scroll', () => { pre.scrollTop = editor.scrollTop; pre.scrollLeft = editor.scrollLeft; });

  // --- autocomplete popup
  const pop = h('div.ac', { hidden: true });
  wrap.append(pop);
  let items = []; let sel = 0; let range = null;
  const close = () => { pop.hidden = true; items = []; };
  const caretXY = () => {
    const m = h('div.editor-mirror');
    const cs = getComputedStyle(editor);
    for (const k of ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingLeft', 'paddingRight', 'letterSpacing', 'tabSize']) m.style[k] = cs[k];
    m.style.width = `${editor.clientWidth}px`;
    m.textContent = editor.value.slice(0, editor.selectionStart);
    const mark = h('span', {}, '​'); m.append(mark);
    wrap.append(m);
    const x = mark.offsetLeft; const y = mark.offsetTop + mark.offsetHeight;
    m.remove();
    return { x: x - editor.scrollLeft, y: y - editor.scrollTop };
  };
  const suggest = (force = false) => {
    const pos = editor.selectionStart;
    if (pos !== editor.selectionEnd) return close();
    const before = editor.value.slice(0, pos);
    const m = before.match(/(?:([A-Za-z_][\w$]*|"[^"]+")\.)?([A-Za-z_][\w$]*)?$/);
    const word = m?.[2] || ''; const owner = m?.[1]?.replace(/"/g, '');
    if (!force && !owner && word.length < 2) return close();
    const schema = getSchema() || [];
    const w = word.toUpperCase();
    let cand = [];
    if (owner) {
      // table.column, or alias.column (alias resolved from "FROM table alias" / "JOIN table AS alias")
      let t = schema.find((x) => x.name.toUpperCase() === owner.toUpperCase());
      if (!t) {
        const am = new RegExp(`(?:from|join)\\s+("?)([\\w$]+)\\1\\s+(?:as\\s+)?${owner.replace(/[$]/g, '\\$')}\\b`, 'i').exec(editor.value);
        if (am) t = schema.find((x) => x.name.toUpperCase() === am[2].toUpperCase());
      }
      cand = (t ? t.cols : schema.flatMap((x) => x.cols)).map((c) => ({ text: c.name, kind: 'column', hint: c.type?.toLowerCase() || '' }));
    } else {
      cand = [
        ...schema.map((t) => ({ text: t.name, kind: 'table', hint: `${t.rows.toLocaleString('en-US')} rows` })),
        ...schema.flatMap((t) => t.cols.map((c) => ({ text: c.name, kind: 'column', hint: t.name }))),
        ...KEYWORDS.map((k) => ({ text: k, kind: 'keyword', hint: '' })),
        ...FUNCS.map((f) => ({ text: `${f}(`, kind: 'function', hint: '' })),
      ];
    }
    const seen = new Set();
    items = cand.filter((c) => c.text.toUpperCase().startsWith(w) && c.text.toUpperCase() !== w && !seen.has(c.kind + c.text) && seen.add(c.kind + c.text)).slice(0, 9);
    if (!items.length) return close();
    sel = 0; range = [pos - word.length, pos];
    const { x, y } = caretXY();
    pop.style.left = `${Math.max(4, Math.min(x, editor.clientWidth - 260))}px`;
    pop.style.top = `${Math.min(y + 2, editor.clientHeight - 20)}px`;
    drawPop(); pop.hidden = false;
  };
  const drawPop = () => pop.replaceChildren(...items.map((it, i) => h('div.ac-item', { class: i === sel ? 'on' : '', onMousedown: (e) => { e.preventDefault(); sel = i; accept(); } },
    h('span.ac-k', { class: `k-${it.kind}` }, it.kind[0].toUpperCase()), h('span', {}, it.text), h('span.ac-h', {}, it.hint))));
  const accept = () => {
    const it = items[sel]; if (!it) return;
    let text = it.text;
    if (it.kind === 'keyword') { const typed = editor.value.slice(range[0], range[1]); if (typed && typed === typed.toLowerCase()) text = text.toLowerCase(); }
    if ((it.kind === 'table' || it.kind === 'column') && !/^[A-Za-z_][\w$]*$/.test(text)) text = qi(text);
    editor.setRangeText(text, range[0], range[1], 'end');
    close();
    editor.dispatchEvent(new Event('input'));
  };
  editor.addEventListener('keydown', (e) => {
    if (!pop.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; drawPop(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; drawPop(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { if (!(e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopImmediatePropagation(); accept(); return; } }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    }
    if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); suggest(true); }
  }, true);
  editor.addEventListener('input', (e) => { if (e.inputType && e.inputType.startsWith('insert') && e.data !== ' ' && e.data !== null) suggest(); else if (e.inputType?.startsWith('delete')) { if (!pop.hidden) suggest(); } else close(); });
  editor.addEventListener('blur', () => setTimeout(close, 120));
  editor.addEventListener('click', close);
  return { wrap, refresh: () => { refreshNames(); paint(); }, paint };
}

// ------------------------------------------------------------------ result grid (shared)
export function grid(columns, values, { offset = 0, onCell, max = 1000 } = {}) {
  const body = values.slice(0, max).map((row, i) => h('tr', {}, h('td.rn', {}, String(offset + i + 1)),
    row.map((v, j) => {
      const td = v === null ? h('td.null', {}, 'NULL') : typeof v === 'number' ? h('td.num', {}, String(v)) : v instanceof Uint8Array ? h('td.null', {}, 'BLOB') : h('td', {}, String(v));
      if (onCell) td.addEventListener('click', () => { td.closest('table').querySelectorAll('td.cur').forEach((x) => x.classList.remove('cur')); td.classList.add('cur'); onCell(v, columns[j], offset + i + 1); });
      return td;
    })));
  return h('table', {}, h('thead', {}, h('tr', {}, h('th.rn', {}, ''), columns.map((c) => h('th', {}, c)))), h('tbody', {}, body));
}
export function toCsv(columns, values) {
  const f = (v) => (v === null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.map(f).join(','), ...values.map((r) => r.map(f).join(','))].join('\r\n');
}
export function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
const cellInfo = (v) => (v === null ? 'NULL' : typeof v === 'number' ? (Number.isInteger(v) ? 'Integer' : 'Real') : v instanceof Uint8Array ? `BLOB · ${v.length} bytes` : `Text · ${String(v).length} chars`);

// ------------------------------------------------------------------ Browse Data
/** DB Browser filter syntax: text = contains · =x · <>x · >x · <x · >=x · <=x · a~b (between) · NULL / <>NULL */
export function filterSql(col, raw) {
  const t = raw.trim(); if (!t) return null;
  const c = qi(col);
  const num = (s) => (s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s);
  if (/^=?\s*null$/i.test(t)) return { sql: `${c} IS NULL`, params: [] };
  if (/^(<>|!=)\s*null$/i.test(t)) return { sql: `${c} IS NOT NULL`, params: [] };
  let m = t.match(/^(>=|<=|<>|!=|=|>|<)\s*(.*)$/);
  if (m) return { sql: `${c} ${m[1] === '!=' ? '<>' : m[1]} ?`, params: [num(m[2])] };
  m = t.match(/^(-?[\d.]+)\s*~\s*(-?[\d.]+)$/);
  if (m) return { sql: `${c} BETWEEN ? AND ?`, params: [Number(m[1]), Number(m[2])] };
  return { sql: `${c} LIKE ?`, params: [`%${t}%`] };
}

export function createBrowse({ getSchema, onShowSql }) {
  const PAGE = 200;
  const tableSel = h('select.db-in', { 'aria-label': 'Table' });
  const info = h('span.muted.small');
  const gridBox = h('div.results.db-grid');
  const cellBox = h('div.db-cell', {}, h('span.muted', {}, 'Click a cell to see its full value.'));
  const st = { table: null, sort: null, filters: {}, offset: 0, total: 0, cols: [] };
  let seq = 0;
  const pager = h('span.db-pager');
  const clearBtn = h('button.btn.xs', { title: 'Clear all filters', onClick: () => { st.filters = {}; st.offset = 0; load(true); } }, '✕ Clear filters');
  const root = h('div.db-browse', {},
    h('div.db-toolbar', {}, h('label.small', {}, 'Table: ', tableSel), clearBtn,
      h('button.btn.xs', { title: 'Copy the SELECT that gives this view into the SQL editor', onClick: () => onShowSql(currentSql(true)) }, '⇢ Show as SQL'),
      h('button.btn.xs', { title: 'Download the filtered rows as CSV', onClick: exportCsv }, '⤓ CSV'),
      h('span', { style: { flex: 1 } }), info),
    gridBox,
    h('div.db-foot', {}, pager, cellBox));
  tableSel.addEventListener('change', () => open(tableSel.value));

  function where(inline = false) {
    const parts = []; const params = [];
    for (const [c, v] of Object.entries(st.filters)) {
      const f = filterSql(c, v); if (!f) continue;
      if (inline) { let i = 0; parts.push(f.sql.replace(/\?/g, () => lit(f.params[i++]))); } else { parts.push(f.sql); params.push(...f.params); }
    }
    return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
  }
  const order = () => (st.sort ? ` ORDER BY ${qi(st.sort.col)} ${st.sort.dir === 'desc' ? 'DESC' : 'ASC'}` : '');
  const ident = (n) => (/^[A-Za-z_][\w$]*$/.test(n) ? n : qi(n));
  function currentSql(inline) {
    const w = where(inline);
    return `SELECT *\nFROM ${ident(st.table)}${w.sql ? `\n${w.sql.trim()}` : ''}${order() ? `\n${order().trim()}` : ''};`;
  }
  async function exportCsv() {
    const w = where();
    const r = await query(`SELECT * FROM ${qi(st.table)}${w.sql}${order()}`, w.params);
    download(`${st.table}.csv`, toCsv(r.columns, r.values));
  }
  async function load(redrawHead = false) {
    const my = ++seq;
    const w = where();
    info.textContent = 'Loading…';
    try {
      const [cnt, page] = await Promise.all([
        query(`SELECT COUNT(*) FROM ${qi(st.table)}${w.sql}`, w.params),
        query(`SELECT * FROM ${qi(st.table)}${w.sql}${order()} LIMIT ${PAGE} OFFSET ${st.offset}`, w.params),
      ]);
      if (my !== seq) return;
      st.total = cnt.values[0][0];
      st.cols = page.columns.length ? page.columns : st.cols;
      draw(page.values, redrawHead);
      const nf = Object.values(st.filters).filter((v) => v.trim()).length;
      info.textContent = `${st.total.toLocaleString('en-US')} row${st.total === 1 ? '' : 's'}${nf ? ` (filtered by ${nf} column${nf > 1 ? 's' : ''})` : ''}`;
      clearBtn.disabled = !nf;
    } catch (e) { if (my === seq) { info.textContent = ''; gridBox.querySelector('tbody')?.replaceChildren(); gridBox.append(h('div.err', {}, e.message)); } }
  }
  let filterRow = null;
  function draw(values, redrawHead) {
    let table = gridBox.querySelector('table');
    if (!table || redrawHead) {
      filterRow = h('tr.db-filters', {}, h('th.rn', {}, ''), st.cols.map((c) => {
        const inp = h('input', { placeholder: 'Filter', value: st.filters[c] || '', title: 'Text = contains · =x · <>x · >x · <x · >=x · <=x · 10~20 · NULL' });
        let tmr = null;
        inp.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { st.filters[c] = inp.value; st.offset = 0; load(); }, 250); });
        return h('th', {}, inp);
      }));
      const head = h('tr', {}, h('th.rn', {}, ''), st.cols.map((c) => h('th.sortable', {
        title: 'Click to sort', onClick: () => { st.sort = st.sort?.col !== c ? { col: c, dir: 'asc' } : st.sort.dir === 'asc' ? { col: c, dir: 'desc' } : null; st.offset = 0; load(true); },
      }, c, st.sort?.col === c ? (st.sort.dir === 'asc' ? ' ▲' : ' ▼') : '')));
      table = h('table', {}, h('thead', {}, head, filterRow), h('tbody'));
      gridBox.replaceChildren(table);
    }
    gridBox.querySelector('.err')?.remove();
    const g = grid(st.cols, values, { offset: st.offset, onCell: (v, col, n) => showCell(v, col, n), max: PAGE });
    table.querySelector('tbody').replaceWith(g.querySelector('tbody'));
    gridBox.scrollTop = 0;
    const last = Math.max(1, Math.ceil(st.total / PAGE));
    const page = Math.floor(st.offset / PAGE) + 1;
    const go = (p) => { st.offset = (Math.min(last, Math.max(1, p)) - 1) * PAGE; load(); };
    const goto = h('input.db-goto', { type: 'number', min: 1, placeholder: 'row', title: 'Go to row number' });
    goto.addEventListener('keydown', (e) => { if (e.key === 'Enter' && goto.value) go(Math.ceil(Number(goto.value) / PAGE)); });
    pager.replaceChildren(
      h('button.btn.xs', { disabled: page <= 1 || undefined, onClick: () => go(1), title: 'First' }, '⏮'),
      h('button.btn.xs', { disabled: page <= 1 || undefined, onClick: () => go(page - 1), title: 'Previous' }, '◀'),
      h('span.small', {}, st.total ? `${(st.offset + 1).toLocaleString('en-US')} – ${Math.min(st.total, st.offset + PAGE).toLocaleString('en-US')} of ${st.total.toLocaleString('en-US')}` : '0 rows'),
      h('button.btn.xs', { disabled: page >= last || undefined, onClick: () => go(page + 1), title: 'Next' }, '▶'),
      h('button.btn.xs', { disabled: page >= last || undefined, onClick: () => go(last), title: 'Last' }, '⏭'),
      h('span.small.muted', {}, 'Go to'), goto);
    cellBox.replaceChildren(h('span.muted', {}, 'Click a cell to see its full value.'));
  }
  function showCell(v, col, n) {
    const text = v === null ? 'NULL' : String(v);
    cellBox.replaceChildren(h('div.small.muted', {}, `${col} · row ${n.toLocaleString('en-US')} · ${cellInfo(v)}`,
      h('button.btn.xs', { style: { marginLeft: '8px' }, onClick: () => navigator.clipboard?.writeText(text) }, 'Copy')), h('div.db-cellval', {}, text));
  }
  function open(name) {
    if (!name) return;
    if (st.table !== name) { st.table = name; st.sort = null; st.filters = {}; st.offset = 0; }
    tableSel.value = name;
    load(true);
  }
  return {
    root,
    setSchema(schema) {
      tableSel.replaceChildren(...schema.map((t) => h('option', { value: t.name }, `${t.name} (${t.rows.toLocaleString('en-US')})`)));
      if (!schema.some((t) => t.name === st.table)) { st.table = null; gridBox.replaceChildren(); }
    },
    open,
    show() { if (!st.table) open((getSchema() || [])[0]?.name); },
  };
}

// ------------------------------------------------------------------ Database Structure
export function createStructure({ onBrowse, onInsert }) {
  const root = h('div.db-struct.results');
  let loadedFor = null;
  async function render(schema, dbName) {
    if (loadedFor === dbName) return;
    loadedFor = dbName;
    root.replaceChildren(h('div.empty', {}, 'Reading structure…'));
    try {
      const master = (await query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")).values;
      const details = {};
      for (const t of schema) {
        const cols = (await query(`PRAGMA table_info(${qi(t.name)})`)).values; // cid,name,type,notnull,dflt,pk
        const fks = (await query(`PRAGMA foreign_key_list(${qi(t.name)})`)).values; // id,seq,table,from,to,...
        details[t.name] = { cols, fks };
      }
      const sqlOf = (type, name) => master.find((m) => m[0] === type && m[1] === name)?.[3] || '';
      const oneLine = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const row = (cls, name, type, schemaSql, extra = null) => h('tr', { class: cls }, h('td', {}, name), h('td', {}, type), h('td.db-sql', { title: schemaSql }, oneLine(schemaSql)), extra ? h('td', {}, extra) : h('td'));
      const body = [];
      body.push(h('tr.db-group', {}, h('td', { colspan: 4 }, `Tables (${schema.length})`)));
      for (const t of schema) {
        const d = details[t.name];
        const tr = row('db-table', h('span', {}, h('button.db-twisty', { 'aria-label': 'Show columns' }, '▸'), ' ', h('b', {}, t.name), h('span.muted', {}, ` ${t.rows.toLocaleString('en-US')} rows`)), '', sqlOf('table', t.name),
          h('button.btn.xs', { onClick: () => onBrowse(t.name) }, 'Browse'));
        const colRows = d.cols.map((c) => {
          const fk = d.fks.find((f) => f[3] === c[1]);
          const flags = [c[5] ? 'PRIMARY KEY' : '', c[3] ? 'NOT NULL' : '', c[4] !== null ? `DEFAULT ${c[4]}` : '', fk ? `→ ${fk[2]}(${fk[4] ?? 'rowid'})` : ''].filter(Boolean).join(' · ');
          return h('tr.db-colrow', { hidden: true }, h('td', {}, h('span.db-colname', { title: 'Insert into the SQL editor', onClick: () => onInsert(c[1]) }, c[5] ? '🔑 ' : '', c[1])), h('td', {}, (c[2] || '').toLowerCase()), h('td.db-sql', {}, flags), h('td'));
        });
        const tw = tr.querySelector('.db-twisty');
        const toggle = () => { const open = tw.textContent === '▸'; tw.textContent = open ? '▾' : '▸'; colRows.forEach((r) => { r.hidden = !open; }); };
        tw.addEventListener('click', toggle);
        tr.firstChild.addEventListener('dblclick', toggle);
        body.push(tr, ...colRows);
      }
      for (const [type, title] of [['index', 'Indices'], ['view', 'Views'], ['trigger', 'Triggers']]) {
        const list = master.filter((m) => m[0] === type);
        body.push(h('tr.db-group', {}, h('td', { colspan: 4 }, `${title} (${list.length})`)));
        list.forEach((m) => body.push(row('', m[1], type === 'index' ? `on ${m[2]}` : type, m[3])));
      }
      // relationships: declared foreign keys, else columns that share a name across tables
      const rel = schema.flatMap((t) => details[t.name].fks.map((f) => `${t.name}.${f[3]} → ${f[2]}.${f[4] ?? 'rowid'}`));
      const byName = new Map();
      for (const t of schema) for (const c of details[t.name].cols) { const k = c[1].toLowerCase(); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(t.name); }
      const shared = [...byName.entries()].filter(([, ts]) => ts.length > 1);
      const relBox = h('div.db-rel', {},
        h('b', {}, 'Relationships'),
        rel.length ? h('ul', {}, rel.map((r) => h('li.mono', {}, r))) : h('p.small.muted', {}, 'No foreign keys are declared in this database.'),
        shared.length ? h('div', {}, h('div.small', {}, 'Columns found in more than one table (likely join keys):'),
          h('ul', {}, shared.map(([c, ts]) => h('li.mono.small', {}, `${c}: ${ts.join(', ')}`)))) : null);
      root.replaceChildren(h('table.db-structtable', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Type'), h('th', {}, 'Schema'), h('th', {}, ''))), h('tbody', {}, body)), relBox);
    } catch (e) { loadedFor = null; root.replaceChildren(h('div.err', {}, e.message)); }
  }
  return { root, render, reset() { loadedFor = null; } };
}
