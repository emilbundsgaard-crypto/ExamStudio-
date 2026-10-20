import { h, secs, statusDot, toast } from '../ui.js';
import { INTERP } from '../data/index.js';
import { checkField, parseInput } from '../check.js';
import { qState, recordAttempt, markRevealed, recordExam } from '../store.js';

const SUB = ['₀', '₁', '₂', '₃'];
const LETTER = { P: 'b', S: 'a', Q: 'c', I: 'd' };
const KIND = { P: 'Prediction', S: 'Slope', Q: 'Squared term', I: 'Interaction' };
const pfmt = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const num = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(v));
export const interpQid = (e, q) => `INT-${e.id}-${q.kind}`;

export function renderInterpList(main) {
  main.replaceChildren(h('div.page', {},
    h('div.crumbs', {}, h('a', { href: '#/' }, 'Practice'), '›', 'Data interpretation'),
    h('h1', {}, 'Data interpretation exams'),
    h('p', { style: { color: 'var(--ink-2)', maxWidth: '66ch' } }, 'Each exam has the four question types of the oral exam: a prediction, a slope interpretation, the p-value of a squared term and an interaction model. Instead of invented numbers, every model was estimated on one of the course datasets, so the coefficients and p-values are real – some effects are significant, some are not, so you cannot guess.'),
    h('div.grid', { style: { marginTop: '20px' } }, INTERP.map((e) => {
      const done = e.questions.filter((q) => qState(interpQid(e, q)).status === 'correct').length;
      return h('a.card.case-card', { href: `#/interp/${e.id}` }, h('div.row', {}, h('span.tag.interp', {}, 'Regression'), h('span.small.muted', {}, `${done} / 4 correct`)), h('h3', {}, e.title), h('p', {}, e.data), h('div.small.muted', {}, `n = ${e.questions[0].model.n.toLocaleString('en-US')} observations`));
    }))));
}

function regTable(m, kind) {
  const L = LETTER[kind];
  return h('table.regtable', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Parameter'), h('th', {}, 'Term'), h('th', { style: { textAlign: 'right' } }, 'Estimate'), h('th', { style: { textAlign: 'right' } }, 'p-value'))),
    h('tbody', {}, m.terms.map((t, i) => h('tr', {}, h('td', {}, L + SUB[i]), h('td', {}, t), h('td.r', {}, num(m.show[i])), h('td.r', {}, pfmt(m.p[i]))))),
    h('caption', { style: { captionSide: 'bottom', textAlign: 'left', fontSize: '.8rem', color: 'var(--muted)', paddingTop: '6px' } }, `n = ${m.n.toLocaleString('en-US')} · R² = ${m.r2.toFixed(3)}`));
}

export function renderInterp(main, id) {
  const e = INTERP.find((x) => x.id === id);
  if (!e) { main.replaceChildren(h('div.page', {}, 'Exam not found')); return; }
  let idx = 0; let elapsed = 0; let running = false; let iv = null;
  const results = {};
  const timer = h('span.timer', {}, secs(e.seconds));
  const startBtn = h('button.btn.sm', {}, 'Start timer');
  const tabs = h('div.tabs');
  const body = h('div.interp-wrap');
  startBtn.addEventListener('click', () => { running = !running; startBtn.textContent = running ? 'Pause' : 'Resume'; if (!iv) iv = setInterval(() => { if (!running) return; elapsed++; const left = e.seconds - elapsed; timer.textContent = left >= 0 ? secs(left) : `+${secs(-left)}`; timer.classList.toggle('low', left <= 60); }, 1000); });
  main.replaceChildren(h('div.exambar', {}, h('b', {}, e.title), timer, startBtn, tabs, h('span.spacer'), h('a.btn.sm', { href: '#/interpretation', style: { color: '#fff', borderColor: 'rgba(255,255,255,.3)', background: 'transparent' } }, 'All exams')), body);
  const drawTabs = () => tabs.replaceChildren(...e.questions.map((q, i) => h('button', { class: [i === idx ? 'on' : '', results[i] ? 'done' : ''].join(' '), onClick: () => { idx = i; draw(); } }, String(i + 1))));

  function draw() {
    drawTabs();
    const q = e.questions[idx];
    const qid = interpQid(e, q);
    const fields = q.checks.map((c) => {
      const a = c.choices ? { kind: 'text', value: c.value, choices: c.choices } : { kind: 'num', value: c.value, tol: c.tol };
      const input = c.choices ? h('select', {}, h('option', { value: '' }, '— choose —'), c.choices.map((x) => h('option', { value: x }, x))) : h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'number' });
      const msg = h('div.fmsg');
      const wrap = h('div.field', {}, h('label', {}, c.label), h('div.inrow', {}, input), msg);
      input.addEventListener('input', () => { wrap.classList.remove('ok', 'bad'); msg.textContent = ''; });
      return { a, input, wrap, msg };
    });
    const fb = h('div');
    const ans = h('div');
    const checkBtn = h('button.btn.primary', {}, 'Check');
    const showBtn = h('button.btn.ghost', {}, 'Show model answer');
    checkBtn.addEventListener('click', () => {
      let n = 0;
      fields.forEach((f) => {
        const r = checkField(f.a, parseInput(f.a, f.input.value));
        f.wrap.classList.toggle('ok', r.ok); f.wrap.classList.toggle('bad', !r.ok);
        f.msg.textContent = r.ok ? 'Correct' : r.msg || (f.a.choices ? 'No' : 'Not the expected value');
        if (r.ok) n++;
      });
      const res = n === fields.length ? 'correct' : n ? 'partial' : 'wrong';
      results[idx] = res;
      recordAttempt(qid, res);
      fb.replaceChildren(h('div.feedback', { class: res === 'correct' ? 'ok' : res === 'partial' ? 'mid' : 'bad' }, h('div.title', {}, res === 'correct' ? 'Correct ✓' : res === 'partial' ? 'Partly correct' : 'Not yet'),
        h('div.small', {}, 'In the oral exam you also have to say it in words – compare with the model answer.')));
      drawTabs();
      if (Object.keys(results).length === 4 && !e.__logged) {
        e.__logged = true;
        recordExam({ kind: 'interpretation', title: e.title, score: Object.values(results).filter((r) => r === 'correct').length, total: 4, used: elapsed, limit: e.seconds, link: location.hash });
      }
    });
    showBtn.addEventListener('click', () => { if (qState(qid).status !== 'correct') markRevealed(qid); ans.replaceChildren(h('div.solution', {}, h('b', {}, 'Model answer'), q.answer.map((p) => h('p.small', { style: { margin: '6px 0' } }, p)))); });
    body.replaceChildren(
      h('div.crumbs', {}, `Question ${idx + 1} of 4 · ${KIND[q.kind]}`, h('span', { style: { flex: 1 } }), statusDot(qState(qid).status)),
      h('div.prompt', { style: { fontSize: '1.2rem' } }, q.prompt),
      h('div.card', { style: { margin: '14px 0' } },
        h('dl.vars', {}, h('dt', {}, `${e.y.name}`), h('dd', {}, e.y.unit),
          h('dt', {}, e.x.name), h('dd', {}, `${e.x.unit} · observed range ${num(+e.x.range[0].toPrecision(4))} to ${num(+e.x.range[1].toPrecision(4))}`),
          q.kind === 'P' || q.kind === 'I' ? [h('dt', {}, e.d.name), h('dd', {}, `0 = ${e.d.ref}; 1 = ${e.d.one}`)] : null),
        h('div.eq', {}, q.equation), regTable(q.model, q.kind), h('div.small.muted', {}, `Data: ${e.data}`)),
      h('div', {}, fields.map((f) => f.wrap)),
      h('div.actions', {}, checkBtn, showBtn), fb, ans,
      h('div.qnav', {}, idx > 0 ? h('button.btn.sm', { onClick: () => { idx--; draw(); } }, '← Previous') : h('span'), idx < 3 ? h('button.btn.sm', { onClick: () => { idx++; draw(); } }, 'Next →') : h('a.btn.sm', { href: '#/interpretation' }, 'Done')));
  }
  draw();
}
