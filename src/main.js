import './styles.css';
import { h } from './ui.js';
import { QUESTIONS } from './data/index.js';
import { summary, onProgress } from './store.js';
import { renderHome } from './pages/home.js';
import { renderCase } from './pages/case.js';
import { renderQuestion } from './pages/question.js';
import { renderExams, renderMockExam } from './pages/exam.js';
import { renderInterp, renderInterpList } from './pages/interp.js';
import { renderProgress } from './pages/progress.js';
import { renderAbout } from './pages/about.js';

const nav = h('nav.nav', {},
  h('a', { href: '#/', 'data-k': 'home' }, 'Practice'),
  h('a', { href: '#/exams', 'data-k': 'exams' }, 'Mock exams'),
  h('a', { href: '#/interpretation', 'data-k': 'interp' }, 'Interpretation'),
  h('a', { href: '#/progress', 'data-k': 'progress' }, 'Progress'),
  h('a', { href: '#/about', 'data-k': 'about' }, 'How it works'));
const pill = h('a.pill', { href: '#/progress' });
const menu = h('button.menu-btn', { 'aria-label': 'Menu', onClick: () => nav.classList.toggle('open') }, '☰');
const main = h('main', { id: 'main' });
document.getElementById('app').replaceChildren(
  h('header.top', {}, h('a.brand', { href: '#/' }, h('span.mark', {}, 'ES'), 'Exam Studio'), nav, h('span.spacer'), pill, menu), main);

function drawPill() {
  const s = summary(QUESTIONS);
  pill.replaceChildren(h('span', {}, '✓'), h('b', {}, `${s.solved}`), h('span', {}, `/ ${s.total} verified`));
}
onProgress(drawPill);
drawPill();

function route() {
  nav.classList.remove('open');
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  const [p0, ...rest] = parts;
  const key = { '': 'home', case: 'home', q: 'home', exams: 'exams', exam: 'exams', interpretation: 'interp', interp: 'interp', progress: 'progress', about: 'about' }[p0] || 'home';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.k === key));
  window.__examGuard = null;
  window.scrollTo(0, 0);
  switch (p0) {
    case 'case': renderCase(main, rest[0]); break;
    case 'q': renderQuestion(main, rest[0]); break;
    case 'exams': renderExams(main); break;
    case 'exam': renderMockExam(main, ...rest); break;
    case 'interpretation': renderInterpList(main); break;
    case 'interp': renderInterp(main, rest[0]); break;
    case 'progress': renderProgress(main); break;
    case 'about': renderAbout(main); break;
    default: renderHome(main);
  }
  document.title = ({ q: `${rest[0]} · Exam Studio`, case: 'Case · Exam Studio' }[p0]) || 'Exam Studio – Data Analytics in Accounting';
}
let lastHash = location.hash;
window.addEventListener('hashchange', (e) => {
  if (window.__examGuard?.() && !confirm('Leave the exam? Your saved answers will be lost.')) { history.replaceState(null, '', lastHash); return; }
  lastHash = location.hash;
  route();
});
window.addEventListener('beforeunload', (e) => { if (window.__examGuard?.()) { e.preventDefault(); e.returnValue = ''; } });
route();
