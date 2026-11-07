import { h, toast, fmtNum, levelDots, statusDot } from '../ui.js';
import { byId, neighbours } from '../data/index.js';
import { caseById, WORKBOOK_TITLES, DB_TITLES } from '../data/cases.js';
import { checkExcel, compareSql, serialToText } from '../check.js';
import { qState, recordAttempt, markRevealed } from '../store.js';
import { openDb, exec, currentDb } from '../sql/engine.js';
import { enhanceEditor, createBrowse, createStructure, statements, grid, toCsv, download } from '../sql/dbbrowser.js';
import { tutorBox } from '../tutor.js';

const drafts = (() => { try { return JSON.parse(localStorage.getItem('examstudio.drafts') || '{}'); } catch { return {}; } })();
const saveDrafts = () => { try { localStorage.setItem('examstudio.drafts', JSON.stringify(drafts)); } catch { /* ignore */ } };
const lastResult = new Map(); // qid -> {columns, values}

let excelMod = null; // lazily loaded (Univer is large)
let excelSync = null; // resolved module
const loadExcel = () => (excelMod ??= import('../excel/sheet.js').then((m) => (excelSync = m)));

// ------------------------------------------------------------------ workbench (right side)
// SQL: a small "DB Browser for SQLite" – Execute SQL / Browse Data / Database Structure.
const HIST_KEY = 'examstudio.sqlHistory';
const history = (() => { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } })();
const saveHistory = () => { try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(0, 30))); } catch { /* ignore */ } };

let sqlUI = null;
function sqlBench() {
  if (sqlUI) return sqlUI;
  const schema = h('div.schema');
  const editor = h('textarea.editor', { spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'SQL editor', placeholder: 'SELECT … FROM …' });
  const status = h('span.muted.db-status');
  const runBtn = h('button.btn.primary.sm', { title: 'Execute all (Ctrl/⌘ + Enter or F5). If text is selected, only the selection runs.' }, '▶ Execute');
  const curBtn = h('button.btn.sm', { title: 'Execute the statement at the cursor (Shift + F5 or Ctrl/⌘ + Shift + Enter)' }, '▶| Current');
  const histSel = h('select.db-in.hist', { title: 'Query history (this browser)' });
  const csvBtn = h('button.btn.sm', { title: 'Download the result as CSV', disabled: true }, '⤓ CSV');
  const results = h('div.results', {}, h('div.empty', {}, 'Run a query to see the result here.'));
  const getSchema = () => currentDb()?.schema || [];
  const ed = enhanceEditor(editor, getSchema);
  const execPane = h('div.db-pane.db-exec', {}, ed.wrap,
    h('div.runbar', {}, runBtn, curBtn, h('span.muted.small.kbd', {}, 'Ctrl/⌘ + Enter · Ctrl + Space = suggestions'), h('span', { style: { flex: 1 } }), status, histSel, csvBtn), results);
  const tabs = h('div.db-tabs', { role: 'tablist' });
  const panes = h('div.db-panes', {}, execPane);
  const root = h('div.sqlwrap', {}, schema, h('div.sqlmain', {}, tabs, panes));
  sqlUI = { root, schema, editor, status, runBtn, results, qid: null, onResult: null, ed };

  const insertSql = (text) => {
    const pre = editor.value.replace(/\s*$/, '');
    editor.value = `${pre}${pre ? '\n\n' : ''}${text}`;
    editor.dispatchEvent(new Event('input'));
    showTab('exec');
    editor.focus();
    editor.setSelectionRange(editor.value.length - text.length, editor.value.length);
    editor.scrollTop = editor.scrollHeight;
  };
  const browse = createBrowse({ getSchema, onShowSql: (sql) => insertSql(`-- from Browse Data\n${sql}`) });
  const structure = createStructure({
    onBrowse: (t) => { showTab('browse'); browse.open(t); },
    onInsert: (c) => { showTab('exec'); editor.focus(); editor.setRangeText(c, editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); },
  });
  panes.append(browse.root, structure.root);
  const TABS = [['exec', 'Execute SQL', execPane], ['browse', 'Browse Data', browse.root], ['struct', 'Database Structure', structure.root]];
  function showTab(id) {
    sqlUI.tab = id;
    for (const [k, , el] of TABS) el.hidden = k !== id;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    if (id === 'browse') browse.show();
    if (id === 'struct') structure.render(getSchema(), currentDb()?.name);
  }
  tabs.append(...TABS.map(([k, label]) => h('button.db-tab', { role: 'tab', 'data-tab': k, onClick: () => showTab(k) }, label)));
  sqlUI.showTab = showTab; sqlUI.browse = browse; sqlUI.structure = structure;
  showTab('exec');

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); run(e.shiftKey ? 'current' : 'all'); return; }
    if (e.key === 'Tab') { e.preventDefault(); const s = editor.selectionStart; editor.setRangeText('  ', s, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
  });
  editor.addEventListener('input', () => { if (sqlUI.qid) { drafts[sqlUI.qid] = editor.value; saveDrafts(); } });
  runBtn.addEventListener('click', () => run('all'));
  curBtn.addEventListener('click', () => run('current'));
  const drawHistory = () => histSel.replaceChildren(h('option', { value: '' }, `History (${history.length})`),
    ...history.map((x, i) => h('option', { value: String(i) }, x.sql.replace(/\s+/g, ' ').slice(0, 70))));
  drawHistory();
  histSel.addEventListener('change', () => { const x = history[Number(histSel.value)]; histSel.value = ''; if (x) insertSql(`-- from history\n${x.sql}`); });
  let last = null;
  csvBtn.addEventListener('click', () => { if (last?.columns.length) download(`${sqlUI.qid || 'result'}.csv`, toCsv(last.columns, last.values)); });

  async function run(mode = 'all') {
    let sql = editor.value;
    const a = editor.selectionStart; const b = editor.selectionEnd;
    if (b > a) sql = sql.slice(a, b);
    else if (mode === 'current') {
      const list = statements(editor.value);
      const st = list.find((x) => a >= x.start && a <= x.end) || list.filter((x) => x.start <= a).pop() || list[0];
      sql = st ? st.text : '';
    }
    if (!sql.trim() || /^(\s|--[^\n]*|\/\*[\s\S]*?\*\/|;)*$/.test(sql)) { status.textContent = 'Nothing to run – write a query first.'; return; }
    status.textContent = 'Running…'; runBtn.disabled = true; curBtn.disabled = true;
    try {
      const r = await exec(sql);
      last = r;
      lastResult.set(sqlUI.qid, r);
      renderResult(r);
      const n = r.values.length;
      status.textContent = r.columns.length
        ? `${n.toLocaleString('en-US')} row${n === 1 ? '' : 's'}${r.statements > 1 ? ` · last of ${r.statements} statements` : ''} · ${r.ms} ms`
        : `Executed${r.changes ? ` · ${r.changes.toLocaleString('en-US')} rows changed` : ''} · ${r.ms} ms`;
      csvBtn.disabled = !r.columns.length;
      const clean = sql.trim();
      const i = history.findIndex((x) => x.sql === clean); if (i >= 0) history.splice(i, 1);
      history.unshift({ sql: clean, at: Date.now() }); saveHistory(); drawHistory();
      if (r.changes) { browse.setSchema(getSchema()); structure.reset(); }
      sqlUI.onResult?.(r);
    } catch (err) {
      last = null; csvBtn.disabled = true;
      lastResult.delete(sqlUI.qid);
      results.replaceChildren(h('div.err', {}, err.message));
      status.textContent = 'Error';
      sqlUI.onResult?.(null);
    } finally { runBtn.disabled = false; curBtn.disabled = false; }
  }
  sqlUI.run = run;
  return sqlUI;
}

function renderResult(r) {
  const ui = sqlBench();
  if (!r) { ui.results.replaceChildren(h('div.empty', {}, 'Run a query to see the result here.')); return; }
  if (!r.columns.length) { ui.results.replaceChildren(h('div.empty', {}, 'Statement executed (no rows returned).')); return; }
  const max = 1000;
  ui.results.replaceChildren(grid(r.columns, r.values, { max }));
  if (r.values.length > max) ui.results.append(h('div.empty', {}, `Showing the first ${max.toLocaleString('en-US')} of ${r.values.length.toLocaleString('en-US')} rows – all rows are used when you check, and ⤓ CSV downloads all of them.`));
}

function renderSchema(schema) {
  const ui = sqlBench();
  const insert = (text) => { ui.showTab('exec'); const e = ui.editor; e.focus(); e.setRangeText(text, e.selectionStart, e.selectionEnd, 'end'); e.dispatchEvent(new Event('input')); };
  ui.schema.replaceChildren(h('div.small.muted', { style: { margin: '0 0 6px' } }, 'DB Schema – click a name to insert it, ⧉ to browse'),
    ...schema.map((t, i) => h('details', { open: i < 3 || undefined }, h('summary', {}, h('span.tname', { onClick: (e) => { e.preventDefault(); insert(t.name); } }, t.name), ' ', h('span.muted', {}, `(${t.rows.toLocaleString('en-US')})`),
      h('button.db-open', { title: `Browse ${t.name}`, onClick: (e) => { e.preventDefault(); ui.showTab('browse'); ui.browse.open(t.name); } }, '⧉')),
    h('ul', {}, t.cols.map((c) => h('li', { onClick: () => insert(c.name) }, c.name, ' ', h('span', {}, c.type.toLowerCase())))))));
  ui.browse.setSchema(schema);
  ui.structure.reset();
  if (ui.tab === 'struct') ui.structure.render(schema, currentDb()?.name);
  ui.ed.refresh();
}

async function mountSql(body, bar, q, onResult) {
  const ui = sqlBench();
  ui.qid = q.id; ui.onResult = onResult;
  ui.editor.value = drafts[q.id] ?? `-- ${q.id}: write your query below\n`;
  ui.ed.paint();
  renderResult(lastResult.get(q.id));
  ui.status.textContent = '';
  body.append(ui.root);
  bar.replaceChildren(h('span.tag.sql', {}, 'SQLite'), h('b', {}, DB_TITLES[q.db]), h('span.muted', {}, 'DB Browser-style workbench · runs in your browser'), h('span.spacer'));
  if (currentDb()?.name !== q.db) {
    const cover = h('div.loading', {}, h('div', {}, h('div.spin'), h('div', {}, `Loading ${DB_TITLES[q.db]}…`)));
    body.append(cover);
    try {
      const info = await openDb(q.db, (got, total) => { cover.querySelector('div > div:last-child').textContent = `Loading ${DB_TITLES[q.db]}… ${(got / 1048576).toFixed(1)}${total ? ' / ' + (total / 1048576).toFixed(1) : ''} MB`; });
      renderSchema(info.schema);
    } catch (e) { cover.replaceChildren(h('div.err', {}, `Could not load the database: ${e.message}`)); return; }
    cover.remove();
  } else renderSchema(currentDb().schema);
}

async function mountExcel(body, bar, q) {
  const cover = h('div.loading', {}, h('div', {}, h('div.spin'), h('div.msg', {}, 'Loading spreadsheet…')));
  body.append(cover);
  bar.replaceChildren(h('span.tag.excel', {}, 'Spreadsheet'), h('b', {}, WORKBOOK_TITLES[q.wb] || q.wb), h('span.muted.engine-note', {}, 'Excel-compatible formulas · PivotTables · scratch sheet "Work"'), h('span.spacer'));
  try {
    const mod = await loadExcel();
    await mod.mountWorkbook(body, q.wb, (s) => { const m = cover.querySelector('.msg'); if (m && s) m.textContent = s; });
    window.dispatchEvent(new Event('resize'));
    if (mod.engineName() === 'Univer') {
      bar.querySelector('.spacer').before(h('button.btn.sm.pv-insert', { title: 'Insert ▸ PivotTable (like Excel)', onClick: () => mod.insertPivot() }, '⊞ Insert PivotTable'));
    }
  } catch (e) { cover.replaceChildren(h('div.err', {}, `Could not load the spreadsheet: ${e.message}`)); return; }
  cover.remove();
}

// ------------------------------------------------------------------ layout: resizable split + full screen
const LAYOUT_KEY = 'examstudio.panelWidth';
const relayout = () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
function initLayout(work, splitter) {
  let w = null;
  try { w = Number(localStorage.getItem(LAYOUT_KEY)) || null; } catch { /* ignore */ }
  if (w) work.style.setProperty('--panel-w', `${w}px`);
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    work.classList.add('dragging');
    const left = work.getBoundingClientRect().left;
    const move = (ev) => {
      const max = Math.max(320, work.clientWidth * 0.7);
      w = Math.round(Math.min(max, Math.max(260, ev.clientX - left)));
      work.style.setProperty('--panel-w', `${w}px`);
    };
    const up = () => {
      work.classList.remove('dragging');
      splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up);
      try { localStorage.setItem(LAYOUT_KEY, String(w)); } catch { /* ignore */ }
      relayout();
    };
    splitter.addEventListener('pointermove', move); splitter.addEventListener('pointerup', up);
  });
  splitter.addEventListener('dblclick', () => { work.style.removeProperty('--panel-w'); try { localStorage.removeItem(LAYOUT_KEY); } catch { /* ignore */ } relayout(); });
}

function viewControls(work) {
  const wide = h('button.btn.sm.ghost', { title: 'Hide the question panel and give the spreadsheet the whole width' }, '⇤ Wider');
  const full = h('button.btn.sm.ghost', { title: 'Full screen (Esc to leave)' }, '⛶ Full screen');
  const sync = () => {
    const isMax = work.classList.contains('max');
    wide.textContent = isMax ? '⇥ Show question' : '⇤ Wider';
    full.textContent = document.fullscreenElement === work ? '✕ Exit full screen' : '⛶ Full screen';
  };
  wide.addEventListener('click', () => { work.classList.toggle('max'); sync(); relayout(); });
  full.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (work.requestFullscreen) await work.requestFullscreen();
      else if (work.webkitRequestFullscreen) work.webkitRequestFullscreen();
    } catch { /* not allowed */ }
  });
  const onFs = () => { sync(); relayout(); };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
  return h('span', { style: { display: 'inline-flex', gap: '4px' } }, wide, full);
}

// ------------------------------------------------------------------ answer panel (left side)
function excelFields(q, saved = []) {
  return q.answers.map((a, i) => {
    const input = a.choices
      ? h('select', {}, h('option', { value: '' }, '— choose —'), a.choices.map((c) => h('option', { value: c }, c)))
      : h('input', { type: 'text', inputmode: a.kind === 'text' ? 'text' : 'decimal', autocomplete: 'off', placeholder: a.kind === 'datetime' ? 'm/d/yyyy h:mm' : a.kind === 'date' ? 'm/d/yyyy' : a.kind === 'pct' ? 'e.g. 0.1234 or 12.34%' : a.kind === 'text' ? 'text' : 'number' });
    const st = { exact: false };
    if (saved[i]) { input.value = saved[i].raw ?? ''; st.exact = !!saved[i].exact; }
    input.addEventListener('input', () => { st.exact = false; wrap.classList.remove('ok', 'bad'); msg.textContent = ''; });
    const useBtn = h('button.btn.sm', { type: 'button', title: 'Copy the value of the selected cell in the spreadsheet' }, '⇦ cell');
    useBtn.addEventListener('click', async () => {
      const mod = await loadExcel();
      let c = null;
      try { c = await mod.activeCell(); } catch (e) { toast(`Could not read the cell: ${e.message}`); return; }
      if (!c || c.value === null || c.value === undefined || c.value === '') { toast('Select a cell with a value in the spreadsheet first.'); return; }
      let v = c.value;
      if ((a.kind === 'datetime' || a.kind === 'date') && typeof v === 'number') v = serialToText(v, a.kind === 'datetime');
      input.value = String(v); st.exact = typeof c.value === 'number';
      wrap.classList.remove('ok', 'bad'); msg.textContent = `from ${c.address}`;
    });
    const msg = h('div.fmsg');
    const wrap = h('div.field', {}, h('label', {}, a.label), h('div.inrow', {}, input, a.choices ? null : useBtn), msg);
    return { a, wrap, input, msg, st, get: () => ({ raw: input.value, exact: st.exact }) };
  });
}

export function renderQuestion(main, qid, { exam = null } = {}) {
  const q = byId.get(qid);
  if (!q) { main.replaceChildren(h('div.page', {}, h('h2', {}, 'Question not found'), h('p', {}, h('a', { href: '#/' }, 'Back to practice')))); return; }
  const cs = caseById(q.case);
  const st = qState(q.id);
  const panel = h('div.panel');
  const bar = h('div.bench-bar');
  const body = h('div.bench-body');
  const splitter = h('div.splitter', { title: 'Drag to resize', role: 'separator', 'aria-orientation': 'vertical' });
  const work = h('div.work', { class: exam ? 'with-exam' : '' }, panel, splitter, h('div.bench', {}, bar, body));
  initLayout(work, splitter);
  if (exam) main.append(work); else main.replaceChildren(work);

  const { prev, next, index, total } = neighbours(q);
  const crumbs = exam ? h('div.crumbs', {}, `Question ${exam.index + 1} of ${exam.total}`, ' · ', h('span.mono', {}, q.id))
    : h('div.crumbs', {}, h('a', { href: '#/' }, 'Practice'), '›', h('a', { href: `#/case/${q.case}` }, cs.title), '›', h('span.mono', {}, q.id), h('span', { style: { flex: 1 } }), statusDot(st.status));
  const meta = h('div.qmeta', {}, h('span.tag', { class: q.tool }, q.tool === 'excel' ? 'Excel' : 'SQL'), h('span', {}, '≈ ', Math.round(q.secs / 15) * 15 >= 60 ? `${Math.round(q.secs / 60 * 2) / 2} min` : `${q.secs} s`), h('span', {}, levelDots(q.level)), q.source ? h('span', {}, q.source) : null);
  const skills = h('div', {}, q.skills.map((s) => h('span.chip', {}, s)));
  const feedback = h('div');
  const extra = h('div');
  panel.append(crumbs, h('div.prompt', {}, q.prompt), meta, skills);

  let fields = null;
  if (q.tool === 'excel') {
    fields = excelFields(q, exam?.answers?.[q.id]);
    panel.append(h('div', { style: { marginTop: '14px' } }, fields.map((f) => f.wrap)));
  } else {
    panel.append(h('p.small.muted', { style: { marginTop: '14px' } }, 'Write and run your query in the SQL editor. ', exam ? 'Your last successful result is saved as your answer.' : 'Then check the result – it is compared row by row with the verified result.'));
  }

  const checkBtn = h('button.btn.primary', {}, exam ? 'Save answer' : (q.tool === 'sql' ? 'Check my result' : 'Check'));
  const hintBtn = q.hint && !exam ? h('button.btn.ghost', {}, 'Hint') : null;
  const solBtn = !exam ? h('button.btn.ghost', {}, 'Show solution') : null;
  panel.append(h('div.actions', {}, checkBtn, hintBtn, solBtn), feedback, extra);
  if (!exam) panel.append(tutorBox({ getCtx: () => tutorContext(q, fields, feedback), starters: q.tool === 'excel' ? ['Give me a hint', 'Why is my answer wrong?', 'Which functions should I use?'] : ['Give me a hint', 'Why is my result wrong?', 'Explain the JOIN I need'] }));

  hintBtn?.addEventListener('click', () => { extra.replaceChildren(h('div.hint', {}, h('b', {}, 'Hint: '), q.hint)); });
  solBtn?.addEventListener('click', () => {
    if (qState(q.id).status !== 'correct' && !confirm('Reveal the solution? The question will be marked as "solution viewed" until you solve it yourself.')) return;
    markRevealed(q.id);
    extra.replaceChildren(solution(q));
  });

  async function onCheck() {
    if (q.tool === 'excel') {
      const inputs = fields.map((f) => f.get());
      if (exam) { exam.save(q.id, inputs); toast('Answer saved'); return; }
      const r = checkExcel(q, inputs);
      const msgs = [];
      r.fields.forEach((fr, i) => {
        const f = fields[i];
        f.wrap.classList.toggle('ok', fr.ok); f.wrap.classList.toggle('bad', !fr.ok);
        f.msg.textContent = fr.ok ? 'Correct' : fr.diag ? '' : fr.msg || 'Not the verified value.';
        if (fr.diag) msgs.push(fr.diag);
      });
      const s = recordAttempt(q.id, r.result, msgs);
      showFeedback(r.result, msgs, s);
    } else {
      const mine = lastResult.get(q.id);
      if (exam) { if (!mine) { toast('Run your query first.'); return; } exam.save(q.id, mine); toast('Result saved as your answer'); return; }
      if (!mine) { feedback.replaceChildren(h('div.feedback.mid', {}, 'Run your query first (▶ Execute or Ctrl/⌘ + Enter), then check.')); return; }
      checkBtn.disabled = true; checkBtn.textContent = 'Checking…';
      try {
        const expected = await exec(q.ref);
        const r = compareSql(q, mine, expected);
        const s = recordAttempt(q.id, r.ok ? 'correct' : 'wrong', r.known ? [r.known] : []);
        showFeedback(r.ok ? 'correct' : 'wrong', r.ok ? (r.note ? [r.note] : []) : r.msgs, s, true);
      } finally { checkBtn.disabled = false; checkBtn.textContent = 'Check my result'; }
    }
  }
  checkBtn.addEventListener('click', onCheck);

  function showFeedback(result, msgs, s, sql = false) {
    const cls = result === 'correct' ? 'ok' : result === 'partial' ? 'mid' : 'bad';
    const title = result === 'correct' ? (s.firstTry ? 'Correct on the first try ✓' : 'Correct ✓') : result === 'partial' ? 'Partly correct' : 'Not yet';
    const tail = result === 'correct' ? (q.explain ? [q.explain] : []) : [sql ? '' : 'Fields marked red do not match the value computed from the course file.'];
    feedback.replaceChildren(h('div.feedback', { class: cls }, h('div.title', {}, title), msgs.length || tail.filter(Boolean).length ? h('ul', {}, [...msgs, ...tail].filter(Boolean).map((m) => h('li', {}, m))) : null,
      result === 'correct' && next && !exam ? h('div', { style: { marginTop: '8px' } }, h('a.btn.sm.green', { href: `#/q/${next.id}` }, 'Next question →')) : null));
    crumbs.querySelector('.st')?.replaceWith(statusDot(qState(q.id).status));
  }

  if (!exam) {
    panel.append(h('div.qnav', {}, prev ? h('a.btn.sm', { href: `#/q/${prev.id}` }, '← ', prev.id) : h('span'), h('span.small.muted', {}, `${index + 1} / ${total}`), next ? h('a.btn.sm', { href: `#/q/${next.id}` }, next.id, ' →') : h('a.btn.sm', { href: `#/case/${q.case}` }, 'Back to case')));
    if (st.status === 'correct') feedback.replaceChildren(h('div.feedback.ok', {}, h('div.title', {}, 'You have already solved this one ✓'), h('div.small', {}, 'Solve it again for practice – your record stays.')));
  }

  if (q.tool === 'excel') mountExcel(body, bar, q);
  else mountSql(body, bar, q, () => {});
  bar.append(viewControls(work));
  return { q };
}

async function tutorContext(q, fields, feedback) {
  const st = qState(q.id);
  const cs = caseById(q.case);
  const ctx = {
    course_case: `${cs.title} (${cs.source})`, question_id: q.id, question: q.prompt, tool: q.tool === 'excel' ? 'Excel (built-in spreadsheet or desktop Excel)' : 'SQL (SQLite)',
    skills: q.skills, hint_on_site: q.hint || null, extra_explanation: q.explain || null,
    student_has_solved_or_revealed: st.status === 'correct' || !!st.revealed,
    last_check_feedback_shown_to_student: feedback.textContent.trim() || 'not checked yet',
  };
  if (q.tool === 'excel') {
    ctx.verified_answers = q.answers.map((a) => ({ label: a.label, value: a.kind === 'datetime' || a.kind === 'date' ? serialToText(a.value, a.kind === 'datetime') : a.value, reference_formula: a.formula }));
    ctx.known_mistakes = (q.diag || []).map((d) => ({ field: q.answers[d.a].label, wrong_value: d.value, meaning: d.msg }));
    ctx.student_typed_answers = fields.map((f) => ({ label: f.a.label, typed: f.input.value || '(empty)' }));
    const mod = excelSync;
    if (mod) { ctx.workbook = mod.describeWorkbook(); try { const c = await mod.activeCell(); if (c) ctx.student_selected_cell = { address: c.address, formula: c.formula, value: c.value }; } catch { /* no sheet */ } }
  } else {
    const db = currentDb();
    ctx.database = db ? db.schema.map((t) => ({ table: t.name, rows: t.rows, columns: t.cols.map((c) => `${c.name} ${c.type}`) })) : q.db;
    ctx.reference_query = q.ref;
    ctx.expected_result = { rows: q.sig.rows, columns: q.cols, first_rows: q.preview.slice(0, 5) };
    ctx.known_mistakes = (q.variants || []).map((v) => v.msg);
    ctx.ordering_matters = !!q.order;
    const ui = sqlUI;
    ctx.student_query = ui?.editor.value || '(empty)';
    const r = lastResult.get(q.id);
    ctx.student_last_result = r ? { columns: r.columns, rows: r.values.length, first_rows: r.values.slice(0, 5) } : 'not run yet';
  }
  return ctx;
}

export function solution(q) {
  if (q.tool === 'excel') {
    return h('div.solution', {}, h('b', {}, 'Verified answer'),
      q.answers.map((a) => h('div', { style: { margin: '8px 0' } }, h('div.small', {}, a.label, ': ', h('b.mono', {}, a.kind === 'datetime' || a.kind === 'date' ? serialToText(a.value, a.kind === 'datetime') : a.kind === 'pct' ? `${fmtNum(a.value * 100, 4)}%` : fmtNum(a.value, a.dp ?? 6))),
        h('div.small.muted', {}, 'One way to compute it (try it in the Work sheet):'), h('pre', {}, a.formula),
        h('button.btn.sm', { onClick: async () => { const m = await loadExcel(); const where = await m.insertFormula(a.formula).catch(() => null); toast(where ? `Inserted in ${where}` : 'Open the spreadsheet first'); } }, 'Insert formula in Work sheet'))),
      q.explain ? h('p.small', {}, q.explain) : null);
  }
  return h('div.solution', {}, h('b', {}, 'Reference query'), h('pre', {}, q.ref),
    h('button.btn.sm', { onClick: () => { const ui = sqlBench(); ui.editor.value = q.ref; ui.editor.dispatchEvent(new Event('input')); ui.showTab('exec'); ui.run(); } }, 'Load and run it'),
    h('p.small.muted', {}, `Expected result: ${q.sig.rows.toLocaleString('en-US')} row(s) × ${q.sig.cols} column(s). Other correct queries are accepted – the check compares results, not SQL text.`),
    q.explain ? h('p.small', {}, q.explain) : null);
}

export { lastResult };
