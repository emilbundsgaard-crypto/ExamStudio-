// Progress lives only in this browser (localStorage). Nothing is sent anywhere.
const KEY = 'examstudio.progress.v1';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
let state = read();
state.q ??= {}; state.exams ??= []; state.mistakes ??= {}; state.days ??= {};

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
  listeners.forEach((f) => f());
}
export const onProgress = (f) => { listeners.add(f); return () => listeners.delete(f); };

const today = () => new Date().toISOString().slice(0, 10);

export function qState(id) { return state.q[id] || { status: 'new', attempts: 0 }; }

/** result: 'correct' | 'partial' | 'wrong'; mistakes: diagnostic messages that fired */
export function recordAttempt(id, result, mistakes = [], { exam = false } = {}) {
  const s = { status: 'new', attempts: 0, ...state.q[id] };
  s.attempts += 1;
  s.last = Date.now();
  if (result === 'correct') {
    if (s.status !== 'correct') s.solvedAt = Date.now();
    if (s.attempts === 1 && !s.revealed) s.firstTry = true;
    s.status = 'correct';
    if (!s.revealed) s.independent = true;
  } else if (s.status !== 'correct') s.status = 'wrong';
  if (exam) s.examAttempts = (s.examAttempts || 0) + 1;
  state.q[id] = s;
  mistakes.forEach((m) => { state.mistakes[m] = (state.mistakes[m] || 0) + 1; });
  state.days[today()] = (state.days[today()] || 0) + 1;
  save();
  return s;
}

export function markRevealed(id) {
  const s = { status: 'new', attempts: 0, ...state.q[id] };
  if (s.status !== 'correct') { s.revealed = true; if (s.status === 'new') s.status = 'revealed'; }
  state.q[id] = s;
  save();
}

export function recordExam(entry) { state.exams.unshift({ ...entry, at: Date.now() }); state.exams = state.exams.slice(0, 100); save(); }
export const exams = () => state.exams;
export const mistakes = () => state.mistakes;
export const days = () => state.days;

export function streak() {
  let n = 0; const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (state.days[k]) { n++; d.setDate(d.getDate() - 1); } else if (n === 0 && k === today()) { d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}

export function summary(questions) {
  let solved = 0, independent = 0, tried = 0, first = 0;
  for (const q of questions) {
    const s = state.q[q.id];
    if (!s) continue;
    if (s.attempts) tried++;
    if (s.status === 'correct') solved++;
    if (s.independent) independent++;
    if (s.firstTry) first++;
  }
  return { total: questions.length, solved, independent, tried, first };
}

export function resetProgress() { state = { q: {}, exams: [], mistakes: {}, days: {} }; save(); }
export function exportProgress() { return JSON.stringify(state, null, 1); }
