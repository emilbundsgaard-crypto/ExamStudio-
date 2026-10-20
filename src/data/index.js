import QUESTIONS from './questions.json';
import INTERP from './interp.json';
import { CASES } from './cases.js';

export { QUESTIONS, INTERP, CASES };
export const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
export const caseQuestions = (caseId) => QUESTIONS.filter((q) => q.case === caseId);
export const wbOf = (q) => q.wb;

export function skillCounts(list) {
  const m = new Map();
  list.forEach((q) => q.skills.forEach((s) => m.set(s, (m.get(s) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function neighbours(q) {
  const list = caseQuestions(q.case);
  const i = list.findIndex((x) => x.id === q.id);
  return { prev: list[i - 1], next: list[i + 1], index: i, total: list.length };
}
