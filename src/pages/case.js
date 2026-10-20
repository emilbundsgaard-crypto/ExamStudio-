import { h, bar, levelDots, statusDot, toast } from '../ui.js';
import { caseQuestions, skillCounts } from '../data/index.js';
import { caseById } from '../data/cases.js';
import { qState, summary } from '../store.js';
import { downloadDb } from '../sql/engine.js';

const BASE = import.meta.env.BASE_URL;
const filterState = { status: 'all', skill: '' };

export function renderCase(main, id) {
  const c = caseById(id);
  if (!c) { main.replaceChildren(h('div.page', {}, h('h2', {}, 'Case not found'))); return; }
  const qs = caseQuestions(id);
  const s = summary(qs);
  const list = h('div.qlist');
  const files = c.files.map((f) => f.path.startsWith('db:')
    ? h('button.btn.sm', { onClick: async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Preparing…'; try { await downloadDb(f.path.slice(3), f.name.split(' ')[0]); } catch (err) { toast(err.message); } b.disabled = false; b.textContent = `⬇ ${f.name}`; } }, `⬇ ${f.name}`)
    : h('a.btn.sm', { href: BASE + f.path, download: '' }, `⬇ ${f.name}`));

  const statusSeg = h('div.seg', {}, [['all', 'All'], ['todo', 'Not solved'], ['wrong', 'Needs another try'], ['correct', 'Solved']].map(([k, l]) => h('button', { class: filterState.status === k ? 'on' : '', onClick: () => { filterState.status = k; draw(); statusSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === l)); } }, l)));
  const skillSel = h('select.sel', { onChange: (e) => { filterState.skill = e.target.value; draw(); } }, h('option', { value: '' }, 'All skills'), skillCounts(qs).map(([k, n]) => h('option', { value: k, selected: filterState.skill === k || undefined }, `${k} (${n})`)));
  if (!skillCounts(qs).some(([k]) => k === filterState.skill)) filterState.skill = '';

  function draw() {
    const rows = qs.filter((q) => {
      const st = qState(q.id).status;
      if (filterState.status === 'todo' && st === 'correct') return false;
      if (filterState.status === 'wrong' && st !== 'wrong') return false;
      if (filterState.status === 'correct' && st !== 'correct') return false;
      if (filterState.skill && !q.skills.includes(filterState.skill)) return false;
      return true;
    });
    list.replaceChildren(...(rows.length ? rows.map((q) => h('a.qrow', { href: `#/q/${q.id}` }, statusDot(qState(q.id).status), h('span.qid', {}, q.id),
      h('div', {}, h('div.qp', {}, q.prompt), h('div.qs', {}, q.skills.slice(0, 3).map((k) => h('span.chip', {}, k)))),
      h('span.meta', {}, levelDots(q.level)), h('span.meta.time', {}, q.secs >= 60 ? `${Math.round(q.secs / 30) / 2} min` : `${q.secs} s`))) : [h('div.qrow', {}, h('span'), h('span'), h('div.muted', {}, 'No questions match this filter.'))]));
  }
  draw();
  main.replaceChildren(h('div.page', {},
    h('div.crumbs', {}, h('a', { href: '#/' }, 'Practice'), '›', c.title),
    h('div.case-head', {},
      h('div', {}, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' } }, h('span.tag', { class: c.tool }, c.tool === 'excel' ? 'Excel' : 'SQL'), h('span.small.muted', {}, `${c.part} · ${c.source}`)),
        h('h1', {}, c.title), h('p', { style: { color: 'var(--ink-2)', maxWidth: '62ch' } }, c.blurb),
        h('div.small.muted', {}, 'Original course files – use them if you prefer to work in desktop Excel or DB Browser and type your answers here:'),
        h('div.files', {}, files)),
      h('div.card', { style: { minWidth: '240px' } }, h('div.stat', {}, h('div.n', { style: { fontSize: '1.6rem', fontWeight: 600 } }, `${s.solved} / ${s.total}`), h('div.small.muted', {}, 'verified correct')), h('div', { style: { margin: '10px 0' } }, bar(s.solved / s.total)),
        h('a.btn.primary.sm', { href: `#/q/${(qs.find((q) => qState(q.id).status !== 'correct') || qs[0]).id}` }, s.solved ? 'Continue →' : 'Start →'))),
    h('div.filters', {}, statusSeg, skillSel, h('span.small.muted', {}, `${qs.length} questions`)),
    list));
}
