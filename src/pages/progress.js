import { h, bar, secs, toast } from '../ui.js';
import { QUESTIONS, INTERP, CASES, caseQuestions } from '../data/index.js';
import { summary, qState, mistakes, exams, resetProgress, exportProgress, streak, days } from '../store.js';
import { interpQid } from './interp.js';

export function renderProgress(main) {
  const s = summary(QUESTIONS);
  const iq = INTERP.flatMap((e) => e.questions.map((q) => ({ id: interpQid(e, q) })));
  const si = summary(iq);
  // skills: attempted vs solved
  const skill = new Map();
  for (const q of QUESTIONS) {
    const st = qState(q.id);
    for (const k of q.skills) {
      const v = skill.get(k) || { k, n: 0, tried: 0, solved: 0, first: 0 };
      v.n++; if (st.attempts) v.tried++; if (st.status === 'correct') v.solved++; if (st.firstTry) v.first++;
      skill.set(k, v);
    }
  }
  const skills = [...skill.values()].filter((v) => v.n >= 3).sort((a, b) => (a.tried ? a.first / a.tried : 2) - (b.tried ? b.first / b.tried : 2));
  const mis = Object.entries(mistakes()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const ex = exams();
  const active = Object.keys(days()).length;
  main.replaceChildren(h('div.page', {},
    h('h1', {}, 'Your progress'),
    h('p.muted', {}, 'Stored only in this browser. "Verified correct" means your answer matched the value computed from the course file – not that you opened the question.'),
    h('div.kpis', { style: { marginTop: '20px' } },
      [[`${s.solved} / ${s.total}`, 'data manipulation questions verified correct'], [s.tried ? `${Math.round((s.first / s.tried) * 100)}%` : '–', 'correct on the first try'], [`${si.solved} / ${si.total}`, 'interpretation questions correct'], [`${streak()} · ${active}`, 'day streak · active days']]
        .map(([n, l]) => h('div.card', {}, h('div.stat', {}, h('div.n', {}, n), h('div.l', {}, l))))),
    h('section.section', {}, h('h2', {}, 'By case'),
      h('table.table', { style: { marginTop: '10px' } }, h('thead', {}, h('tr', {}, h('th', {}, 'Case'), h('th', {}, 'Tool'), h('th', { style: { width: '30%' } }, 'Verified correct'), h('th', {}, 'Tried'), h('th', {}, 'First-try rate'))),
        h('tbody', {}, CASES.map((c) => { const v = summary(caseQuestions(c.id)); return h('tr', {}, h('td', {}, h('a', { href: `#/case/${c.id}` }, c.title)), h('td', {}, c.tool === 'excel' ? 'Excel' : 'SQL'), h('td', {}, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('div', { style: { flex: 1 } }, bar(v.solved / v.total)), h('span.small', {}, `${v.solved}/${v.total}`))), h('td.n', {}, v.tried), h('td.n', {}, v.tried ? `${Math.round((v.first / v.tried) * 100)}%` : '–')); })))),
    h('section.section', {}, h('h2', {}, 'Skills to work on'), h('p.small.muted', {}, 'Sorted by first-try rate – the skills where you most often needed a second attempt come first.'),
      h('table.table', { style: { marginTop: '10px' } }, h('thead', {}, h('tr', {}, h('th', {}, 'Skill'), h('th', {}, 'Questions'), h('th', {}, 'Tried'), h('th', {}, 'Solved'), h('th', {}, 'First try'))),
        h('tbody', {}, skills.slice(0, 14).map((v) => h('tr', {}, h('td', {}, v.k), h('td.n', {}, v.n), h('td.n', {}, v.tried), h('td.n', {}, v.solved), h('td.n', {}, v.tried ? `${Math.round((v.first / v.tried) * 100)}%` : '–')))))),
    h('section.section', {}, h('h2', {}, 'Mistakes the checker recognised'),
      mis.length ? h('div.card', { style: { marginTop: '10px' } }, mis.map(([m, n]) => h('div', { style: { display: 'flex', gap: '12px', padding: '6px 0', borderBottom: '1px solid var(--line)' } }, h('b', { style: { minWidth: '30px', textAlign: 'right' } }, `${n}×`), h('span', {}, m))))
        : h('p.muted', {}, 'Nothing yet. When a wrong answer matches a known mistake (e.g. counting all event types, using days instead of hours, forgetting refunds), it is listed here.')),
    h('section.section', {}, h('h2', {}, 'Mock exams'),
      ex.length ? h('table.table', { style: { marginTop: '10px' } }, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Type'), h('th', {}, 'Exam'), h('th', {}, 'Score'), h('th', {}, 'Time used'))),
        h('tbody', {}, ex.map((e) => h('tr', {}, h('td', {}, new Date(e.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })), h('td', {}, e.kind), h('td', {}, h('a', { href: e.link }, e.title)), h('td.n', {}, `${e.score}/${e.total}`), h('td.n', {}, `${secs(e.used)} / ${secs(e.limit)}`)))))
        : h('p.muted', {}, 'No mock exams yet.')),
    h('section.section', {}, h('h2', {}, 'Your data'),
      h('div.actions', {}, h('button.btn', { onClick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([exportProgress()], { type: 'application/json' })), download: 'examstudio-progress.json' }); a.click(); } }, 'Download my progress (JSON)'),
        h('button.btn', { onClick: () => { if (confirm('Delete all progress in this browser?')) { resetProgress(); toast('Progress reset'); renderProgress(main); } } }, 'Reset progress')))));
}
