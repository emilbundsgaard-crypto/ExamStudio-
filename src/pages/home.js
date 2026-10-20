import { h, bar } from '../ui.js';
import { QUESTIONS, INTERP, CASES, caseQuestions, skillCounts } from '../data/index.js';
import { summary, qState, streak, exams } from '../store.js';

function nextUp() {
  // last touched question that is not solved yet, otherwise the first new question
  let best = null;
  for (const q of QUESTIONS) {
    const s = qState(q.id);
    if (s.last && s.status !== 'correct' && (!best || s.last > best.t)) best = { q, t: s.last };
  }
  if (best) return best.q;
  return QUESTIONS.find((q) => qState(q.id).status === 'new');
}

function caseCard(c) {
  const qs = caseQuestions(c.id);
  const s = summary(qs);
  const top = skillCounts(qs).slice(0, 4).map(([k]) => k);
  return h('a.card.case-card', { href: `#/case/${c.id}` },
    h('div.row', {}, h('span.tag', { class: c.tool }, c.tool === 'excel' ? 'Excel' : 'SQL'), h('span.small.muted', {}, c.part)),
    h('h3', {}, c.title), h('p', {}, c.blurb),
    h('div', {}, top.map((k) => h('span.chip', {}, k))),
    h('div', {}, h('div.row', { style: { marginBottom: '5px' } }, h('span.count', {}, `${s.solved} / ${s.total} verified correct`), s.tried ? h('span.count', {}, `${Math.round((s.first / Math.max(s.tried, 1)) * 100)}% first try`) : null), bar(s.solved / s.total)));
}

export function renderHome(main) {
  const s = summary(QUESTIONS);
  const nu = nextUp();
  const ex = exams();
  const excel = CASES.filter((c) => c.tool === 'excel');
  const sql = CASES.filter((c) => c.tool === 'sql');
  main.replaceChildren(h('div.page', {},
    h('section.hero', {},
      h('div', {},
        h('div.small.muted', { style: { marginBottom: '10px', letterSpacing: '.06em', textTransform: 'uppercase' } }, 'Data Analytics in Accounting · oral exam practice'),
        h('h1', {}, 'Practise the exam – and know when you are right.'),
        h('p.lead', {}, `${QUESTIONS.length} questions built only from the course cases. Solve them in the built-in spreadsheet and SQL editor (or your own Excel and DB Browser) and every answer is checked against results computed from the actual course files.`),
        h('div.actions', {},
          nu ? h('a.btn.primary', { href: `#/q/${nu.id}` }, s.tried ? 'Continue where you left off' : 'Start with the first question', ' →') : null,
          h('a.btn', { href: '#/exams' }, 'Take a timed mock exam'))),
      h('div.statbox', {},
        h('div.stat', {}, h('div.n', {}, s.solved), h('div.l', {}, `of ${s.total} questions verified correct`)),
        h('div.stat', {}, h('div.n', {}, s.tried ? `${Math.round((s.first / s.tried) * 100)}%` : '–'), h('div.l', {}, 'correct on the first try')),
        h('div.stat', {}, h('div.n', {}, ex.length), h('div.l', {}, 'mock exams taken')),
        h('div.stat', {}, h('div.n', {}, streak()), h('div.l', {}, 'day practice streak')),
        h('div', { style: { gridColumn: '1 / -1' } }, bar(s.solved / s.total)))),
    h('section.section', {},
      h('div.section-head', {}, h('h2', {}, 'What the oral exam asks for')),
      h('div.format', {},
        h('div.card', {}, h('div.ico', { style: { background: '#e3f2e9', color: 'var(--excel)' } }, 'fx'),
          h('div', {}, h('h3', {}, 'A full data manipulation exam'), h('p.small.muted', { style: { margin: '4px 0 8px' } }, 'Excel and SQL questions on two course data files. About eight minutes, including any import task.'),
            h('a.btn.sm', { href: '#/exams' }, 'Practise a full exam'))),
        h('div.card', {}, h('div.ico', { style: { background: '#efe6f6', color: 'var(--interp)' } }, 'β'),
          h('div', {}, h('h3', {}, 'A full data interpretation exam'), h('p.small.muted', { style: { margin: '4px 0 8px' } }, `Four regression questions: predict, interpret a slope, a squared term and an interaction. ${INTERP.length} exams built on regressions estimated from the course datasets.`),
            h('a.btn.sm', { href: '#/interpretation' }, 'Practise interpretation'))))),
    h('section.section', {}, h('div.section-head', {}, h('h2', {}, 'Excel cases'), h('span.small.muted', {}, 'Open a case to see all its questions')), h('div.grid', {}, excel.map(caseCard))),
    h('section.section', {}, h('div.section-head', {}, h('h2', {}, 'SQL cases'), h('span.small.muted', {}, 'Queries run on the real databases, in your browser')), h('div.grid', {}, sql.map(caseCard))),
    h('section.section', {}, h('div.section-head', {}, h('h2', {}, 'Data interpretation'), h('a.small', { href: '#/interpretation' }, 'All interpretation exams →')),
      h('div.grid', {}, INTERP.slice(0, 4).map((e) => h('a.card.case-card', { href: `#/interp/${e.id}` }, h('div.row', {}, h('span.tag.interp', {}, 'Regression'), h('span.small.muted', {}, '5 min')), h('h3', {}, e.title), h('p', {}, e.data)))))));
}
