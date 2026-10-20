import { h, toast, fmtNum, levelDots, statusDot } from '../ui.js';
import { byId, neighbours } from '../data/index.js';
import { caseById, WORKBOOK_TITLES, DB_TITLES } from '../data/cases.js';
import { checkExcel, compareSql, serialToText } from '../check.js';
import { qState, recordAttempt, markRevealed } from '../store.js';
import { openDb, exec, currentDb } from '../sql/engine.js';
import { tutorBox } from '../tutor.js';

const drafts = (() => { try { return JSON.parse(localStorage.getItem('examstudio.drafts') || '{}'); } catch { return {}; } })();
const saveDrafts = () => { try { localStorage.setItem('examstudio.drafts', JSON.stringify(drafts)); } catch { /* ignore */ } };
const lastResult = new Map(); // qid -> {columns, values}

let excelMod = null; // lazily loaded (Univer is large)
let excelSync = null; // resolved module, for synchronous use
const loadExcel = () => (excelMod ??= import('../excel/workbench.js').then((m) => (excelSync = m)));

// ------------------------------------------------------------------ workbench (right side)
let sqlUI = null;
function sqlBench() {
  if (sqlUI) return sqlUI;
  const schema = h('div.schema');
  const editor = h('textarea.editor', { spellcheck: 'false', 'aria-label': 'SQL editor', placeholder: 'SELECT … FROM …' });
  const status = h('span.muted');
  const runBtn = h('button.btn.primary.sm', { title: 'Ctrl/⌘ + Enter' }, '▶ Run');
  const results = h('div.results', {}, h('div.empty', {}, 'Run a query to see the result here.'));
  const root = h('div.sqlwrap', {}, schema, h('div.sqlmain', {}, editor, h('div.runbar', {}, runBtn, h('span.muted.small', {}, 'Ctrl/⌘ + Enter'), h('span', { style: { flex: 1 } }), status), results));
  sqlUI = { root, schema, editor, status, runBtn, results, qid: null, onResult: null };
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Tab') { e.preventDefault(); const s = editor.selectionStart; editor.setRangeText('  ', s, editor.selectionEnd, 'end'); }
  });
  editor.addEventListener('input', () => { if (sqlUI.qid) { drafts[sqlUI.qid] = editor.value; saveDrafts(); } });
  runBtn.addEventListener('click', run);
  async function run() {
    const sql = editor.value.trim();
    if (!sql) return;
    status.textContent = 'Running…'; runBtn.disabled = true;
    try {
      const r = await exec(sql);
      lastResult.set(sqlUI.qid, r);
      renderResult(r);
      status.textContent = `${r.values.length.toLocaleString('en-US')} row${r.values.length === 1 ? '' : 's'} · ${r.ms} ms`;
      sqlUI.onResult?.(r);
    } catch (err) {
      lastResult.delete(sqlUI.qid);
      results.replaceChildren(h('div.err', {}, err.message));
      status.textContent = 'Error';
      sqlUI.onResult?.(null);
    } finally { runBtn.disabled = false; }
  }
  sqlUI.run = run;
  return sqlUI;
}

function renderResult(r) {
  const ui = sqlBench();
  if (!r) { ui.results.replaceChildren(h('div.empty', {}, 'Run a query to see the result here.')); return; }
  if (!r.columns.length) { ui.results.replaceChildren(h('div.empty', {}, 'Statement executed (no rows returned).')); return; }
  const max = 500;
  const rows = r.values.slice(0, max).map((row) => h('tr', {}, row.map((v) => (v === null ? h('td.null', {}, 'NULL') : typeof v === 'number' ? h('td.num', {}, String(v)) : h('td', { title: String(v) }, String(v))))));
  ui.results.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, r.columns.map((c) => h('th', {}, c)))), h('tbody', {}, rows)));
  if (r.values.length > max) ui.results.append(h('div.empty', {}, `Showing the first ${max} of ${r.values.length.toLocaleString('en-US')} rows.`));
}

function renderSchema(schema) {
  const ui = sqlBench();
  ui.schema.replaceChildren(h('div.small.muted', { style: { margin: '0 0 6px' } }, 'Tables – click a column to insert it'),
    ...schema.map((t, i) => h('details', { open: i < 3 || undefined }, h('summary', {}, t.name, ' ', h('span.muted', {}, `(${t.rows.toLocaleString('en-US')})`)),
      h('ul', {}, t.cols.map((c) => h('li', { onClick: () => { const e = ui.editor; e.focus(); e.setRangeText(c.name, e.selectionStart, e.selectionEnd, 'end'); e.dispatchEvent(new Event('input')); } }, c.name, ' ', h('span', {}, c.type.toLowerCase())))))));
}

async function mountSql(body, bar, q, onResult) {
  const ui = sqlBench();
  ui.qid = q.id; ui.onResult = onResult;
  ui.editor.value = drafts[q.id] ?? `-- ${q.id}: write your query below\n`;
  renderResult(lastResult.get(q.id));
  ui.status.textContent = '';
  body.append(ui.root);
  bar.replaceChildren(h('span.tag.sql', {}, 'SQLite'), h('b', {}, DB_TITLES[q.db]), h('span.muted', {}, 'runs in your browser – nothing is uploaded'), h('span.spacer'));
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
  bar.replaceChildren(h('span.tag.excel', {}, 'Spreadsheet'), h('b', {}, WORKBOOK_TITLES[q.wb] || q.wb), h('span.muted', {}, 'Excel-compatible formulas · scratch sheet "Work"'), h('span.spacer'));
  try {
    const mod = await loadExcel();
    await mod.mountWorkbook(body, q.wb, (s) => { const m = cover.querySelector('.msg'); if (m && s) m.textContent = s; });
    window.dispatchEvent(new Event('resize'));
  } catch (e) { cover.replaceChildren(h('div.err', {}, `Could not load the spreadsheet: ${e.message}`)); return; }
  cover.remove();
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
      const c = mod.activeCell();
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
  const work = h('div.work', { class: exam ? 'with-exam' : '' }, panel, h('div.bench', {}, bar, body));
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
      if (!mine) { feedback.replaceChildren(h('div.feedback.mid', {}, 'Run your query first (▶ Run or Ctrl/⌘ + Enter), then check.')); return; }
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
  return { q };
}

function tutorContext(q, fields, feedback) {
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
    if (mod) { ctx.workbook = mod.describeWorkbook(); const c = mod.activeCell(); if (c) ctx.student_selected_cell = { address: c.address, formula: c.formula, value: c.value }; }
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
        h('button.btn.sm', { onClick: async () => { const m = await import('../excel/workbench.js'); const where = m.insertFormula(a.formula); toast(where ? `Inserted in ${where}` : 'Open the spreadsheet first'); } }, 'Insert formula in Work sheet'))),
      q.explain ? h('p.small', {}, q.explain) : null);
  }
  return h('div.solution', {}, h('b', {}, 'Reference query'), h('pre', {}, q.ref),
    h('button.btn.sm', { onClick: () => { const ui = sqlBench(); ui.editor.value = q.ref; ui.editor.dispatchEvent(new Event('input')); ui.run(); } }, 'Load and run it'),
    h('p.small.muted', {}, `Expected result: ${q.sig.rows.toLocaleString('en-US')} row(s) × ${q.sig.cols} column(s). Other correct queries are accepted – the check compares results, not SQL text.`),
    q.explain ? h('p.small', {}, q.explain) : null);
}

export { lastResult };
