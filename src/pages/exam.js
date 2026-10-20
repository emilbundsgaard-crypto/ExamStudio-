import { h, toast, secs, statusDot } from '../ui.js';
import { QUESTIONS, byId } from '../data/index.js';
import { caseById, WORKBOOK_TITLES, DB_TITLES } from '../data/cases.js';
import { renderQuestion } from './question.js';
import { checkExcel, compareSql } from '../check.js';
import { recordAttempt, recordExam, exams } from '../store.js';
import { exec, openDb } from '../sql/engine.js';

const EXCEL_WBS = ['film', 'integrate', 'restaurant', 'etl1', 'etl2', 'etl3', 'etl4'];
const SQL_DBS = ['songs', 'movies', 'chinook', 'pcards'];

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function pick(list, n, r) {
  const a = [...list]; const out = []; const groups = new Set();
  while (a.length && out.length < n) {
    const q = a.splice(Math.floor(r() * a.length), 1)[0];
    if (q.group && groups.has(q.group) && a.some((x) => !x.group || !groups.has(x.group))) continue;
    if (q.group) groups.add(q.group);
    out.push(q);
  }
  return out;
}

export function composeExam(wb, db, seed) {
  const r = rng(seed);
  const xs = pick(QUESTIONS.filter((q) => q.wb === wb && q.level <= 2), 3, r);
  const ss = pick(QUESTIONS.filter((q) => q.db === db && q.level <= 2), 3, r);
  return [...xs, ...ss];
}

export function renderExams(main) {
  const wbSel = h('select.sel', {}, h('option', { value: '' }, 'Any Excel file'), EXCEL_WBS.map((w) => h('option', { value: w }, WORKBOOK_TITLES[w])));
  const dbSel = h('select.sel', {}, h('option', { value: '' }, 'Any database'), SQL_DBS.map((d) => h('option', { value: d }, DB_TITLES[d])));
  const minSel = h('select.sel', {}, [8, 12, 20].map((m) => h('option', { value: m }, `${m} minutes`)));
  const go = () => {
    const seed = Math.floor(Math.random() * 1e6);
    const r = rng(seed);
    const wb = wbSel.value || EXCEL_WBS[Math.floor(r() * EXCEL_WBS.length)];
    const db = dbSel.value || SQL_DBS[Math.floor(r() * SQL_DBS.length)];
    location.hash = `#/exam/${wb}/${db}/${seed}/${minSel.value}`;
  };
  const hist = exams().slice(0, 8);
  main.replaceChildren(h('div.page', {},
    h('h1', {}, 'Mock exams'),
    h('p', { style: { color: 'var(--ink-2)', maxWidth: '64ch' } }, 'Rehearse under exam conditions: a timer, no feedback until you finish, and a report that tells you exactly which answers were wrong and why. Every exam can be reopened from its link, so you can retake the same one.'),
    h('div.format', { style: { marginTop: '22px' } },
      h('div.card', {}, h('div', {}, h('span.tag.excel', {}, 'Excel'), ' ', h('span.tag.sql', {}, 'SQL')), h('h2', { style: { margin: '10px 0 6px' } }, 'Data manipulation exam'),
        h('p.small.muted', {}, 'Three Excel questions on one course file and three SQL questions on one database. Download the files first if you want to answer in desktop Excel / DB Browser.'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '12px 0' } }, wbSel, dbSel, minSel),
        h('button.btn.primary', { onClick: go }, 'Start exam →')),
      h('div.card', {}, h('span.tag.interp', {}, 'Regression'), h('h2', { style: { margin: '10px 0 6px' } }, 'Data interpretation exam'),
        h('p.small.muted', {}, 'Four questions on one regression context – predict, interpret a slope, a squared term and an interaction – in five minutes.'),
        h('a.btn.primary', { href: '#/interpretation', style: { marginTop: '12px' } }, 'Choose an interpretation exam →'))),
    hist.length ? h('section.section', {}, h('h2', {}, 'Recent exams'), h('table.table', { style: { marginTop: '10px' } }, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Exam'), h('th', {}, 'Score'), h('th', {}, 'Time'), h('th', {}))),
      h('tbody', {}, hist.map((e) => h('tr', {}, h('td', {}, new Date(e.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })), h('td', {}, e.title), h('td.n', {}, `${e.score} / ${e.total}`), h('td.n', {}, secs(e.used)), h('td', {}, h('a', { href: e.link }, 'Retake'))))))) : null));
}

export function renderMockExam(main, wb, db, seed, minutes) {
  const qs = composeExam(wb, db, Number(seed));
  if (!qs.length) { main.replaceChildren(h('div.page', {}, 'Could not build this exam.')); return; }
  const limit = Number(minutes) * 60;
  const state = { idx: 0, answers: {}, elapsed: 0, running: false, finished: false, perQ: {} };
  const timer = h('span.timer', {}, secs(limit));
  const startBtn = h('button.btn.sm', {}, 'Start timer');
  const tabs = h('div.tabs');
  const finishBtn = h('button.btn.sm.green', {}, 'Finish & grade');
  const area = h('div');
  main.replaceChildren(h('div.exambar', {}, h('b', {}, 'Mock exam'), timer, startBtn, tabs, h('span.spacer'), finishBtn), area);
  let iv = null;
  const tick = () => {
    if (!state.running) return;
    state.elapsed++; state.perQ[qs[state.idx].id] = (state.perQ[qs[state.idx].id] || 0) + 1;
    const left = limit - state.elapsed;
    timer.textContent = left >= 0 ? secs(left) : `+${secs(-left)}`;
    timer.classList.toggle('low', left <= 60);
    if (left === 0) toast('Time is up – finish when you are ready (overtime is shown).', 4000);
  };
  startBtn.addEventListener('click', () => { state.running = !state.running; startBtn.textContent = state.running ? 'Pause' : 'Resume'; if (!iv) iv = setInterval(tick, 1000); });
  const exam = { total: qs.length, answers: state.answers, save: (id, a) => { state.answers[id] = a; drawTabs(); } };
  function drawTabs() { tabs.replaceChildren(...qs.map((q, i) => h('button', { class: [i === state.idx ? 'on' : '', state.answers[q.id] ? 'done' : ''].join(' '), title: `${q.id} (${q.tool})`, onClick: () => go(i) }, String(i + 1)))); }
  function go(i) { state.idx = i; drawTabs(); area.replaceChildren(); renderQuestion(area, qs[i].id, { exam: { ...exam, index: i } }); }
  window.__examGuard = () => !state.finished && Object.keys(state.answers).length > 0;
  finishBtn.addEventListener('click', async () => {
    if (Object.keys(state.answers).length < qs.length && !confirm(`You have saved ${Object.keys(state.answers).length} of ${qs.length} answers. Finish anyway?`)) return;
    state.running = false; clearInterval(iv); state.finished = true;
    finishBtn.disabled = true; finishBtn.textContent = 'Grading…';
    const rows = [];
    let score = 0;
    await openDb(db);
    for (const q of qs) {
      const a = state.answers[q.id];
      let ok = false; let msgs = [];
      if (!a) msgs = ['No answer saved.'];
      else if (q.tool === 'excel') {
        const r = checkExcel(q, a); ok = r.result === 'correct';
        msgs = r.fields.map((f, i) => (f.ok ? null : `${q.answers[i].label}: ${f.diag || f.msg || 'not the verified value'}`)).filter(Boolean);
        recordAttempt(q.id, r.result, r.fields.map((f) => f.diag).filter(Boolean), { exam: true });
      } else {
        const r = compareSql(q, a, await exec(q.ref)); ok = r.ok; msgs = r.ok ? [] : r.msgs;
        recordAttempt(q.id, ok ? 'correct' : 'wrong', r.known ? [r.known] : [], { exam: true });
      }
      if (ok) score++;
      rows.push({ q, ok, msgs, t: state.perQ[q.id] || 0 });
    }
    const title = `${WORKBOOK_TITLES[wb].split(' (')[0]} + ${DB_TITLES[db]}`;
    recordExam({ kind: 'manipulation', title, score, total: qs.length, used: state.elapsed, limit, link: location.hash });
    report(rows, score, title);
  });
  function report(rows, score, title) {
    window.__examGuard = null;
    main.replaceChildren(h('div.page', {},
      h('div.crumbs', {}, h('a', { href: '#/exams' }, 'Mock exams'), '›', 'Report'),
      h('h1', {}, `${score} / ${rows.length} correct`),
      h('p.muted', {}, `${title} · time used ${secs(state.elapsed)} of ${secs(limit)}${state.elapsed > limit ? ' (over time)' : ''}`),
      h('div.card', { style: { marginTop: '18px' } }, rows.map(({ q, ok, msgs, t }) => h('div.report-row', {}, statusDot(ok ? 'correct' : 'wrong'), h('span.qid.mono.small', {}, q.id),
        h('div', {}, h('div', {}, q.prompt), msgs.length ? h('ul.small', { style: { color: 'var(--wrong)', margin: '6px 0 0', paddingLeft: '18px' } }, msgs.map((m) => h('li', {}, m))) : null, h('a.small', { href: `#/q/${q.id}` }, 'Practise this question →')),
        h('span.small.muted', { style: { textAlign: 'right' } }, `${secs(t)} · est. ${secs(q.secs)}`)))),
      h('div.actions', { style: { marginTop: '18px' } }, h('a.btn.primary', { href: location.hash.replace(/\/\d+\/(\d+)$/, `/${Math.floor(Math.random() * 1e6)}/$1`) }, 'New exam, same files'), h('a.btn', { href: '#/exams' }, 'Back to mock exams'))));
  }
  drawTabs();
  // every exam starts from untouched files
  import('../excel/workbench.js').then((m) => { if (m.currentWorkbook()) m.disposeWorkbook(); go(0); });
}
