// AI tutor (Google Gemini via the PHP proxy in api/ask.php).
// Gemini is often overloaded, so every request is retried up to 20 times, 10 seconds apart.
import { h } from './ui.js';

const BASE = import.meta.env.BASE_URL;
const ENDPOINT = `${BASE}api/ask.php`;
export const MAX_ATTEMPTS = 20;
export const RETRY_SECONDS = 10;

let availability = null; // Promise<{ok, configured, model} | null>
export function tutorAvailable() {
  availability ??= fetch(ENDPOINT, { cache: 'no-store' })
    .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
    .catch(() => null);
  return availability;
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
});

/** Ask Gemini. onStatus(text) reports retries. Resolves to { text } or throws Error. */
export async function ask({ system, messages }, { onStatus, signal } = {}) {
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onStatus?.(attempt === 1 ? 'Thinking…' : `Gemini failed (${lastErr}). Attempt ${attempt} of ${MAX_ATTEMPTS}…`);
    let retry = true;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages }), signal });
      let j = null;
      try { j = await res.json(); } catch { /* HTML error page from the host */ }
      if (res.ok && j?.text) return j;
      lastErr = j?.error || `HTTP ${res.status}`;
      retry = j ? j.retry !== false : true;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = 'no connection';
    }
    if (!retry) throw new Error(lastErr);
    if (attempt < MAX_ATTEMPTS) {
      for (let s = RETRY_SECONDS; s > 0; s--) {
        onStatus?.(`Gemini failed (${lastErr}). Retrying in ${s} s – attempt ${attempt + 1} of ${MAX_ATTEMPTS}.`);
        await sleep(1000, signal);
      }
    }
  }
  throw new Error(`Gemini did not answer after ${MAX_ATTEMPTS} attempts (${lastErr}). Try again in a few minutes.`);
}

// ---------------------------------------------------------------- prompt
const SYSTEM = `You are the tutor on Exam Studio, a practice site for the SDU course "Data Analytics in Accounting" (oral exam: a data manipulation exam in Excel and SQL, and a regression interpretation exam).
Rules:
- Answer in the language the student writes in (Danish or English). Use English Excel function names (Excel 365) and SQLite syntax.
- Be short and concrete: at most ~150 words unless the student asks for more. Use bullet points and \`code\` for formulas and SQL.
- You receive the VERIFIED answer and a reference solution as hidden context. Use them to diagnose the student's attempt precisely (which condition, column, filter or unit is wrong), but do NOT give the final number or the complete formula/query unless the context says the student has already solved the question or revealed the solution, or the student explicitly asks for the full solution after trying. Prefer a hint that lets them fix it themselves.
- Never invent numbers. Only use values that appear in the context. If you cannot tell, say what the student should check.
- The built-in spreadsheet (Univer) has Excel 365 functions (COUNTIFS, XLOOKUP, FILTER, UNIQUE, SORTBY, LET…), fill handle, Ctrl/Cmd+Shift+arrow selection and a scratch sheet "Work". PivotTables work like Excel: the "⊞ Insert PivotTable" button above the sheet opens Create PivotTable and the PivotTable Fields pane (Filters, Columns, Rows, Σ Values; Value Field Settings; date grouping by years/quarters/months). LINEST is not reliable in it – suggest SLOPE/INTERCEPT/RSQ. Dates are month/day/year. Suggest PivotTables where Excel users would use them.
- In the oral exam the student must also explain the approach – when relevant, end with one sentence they could say to the examiner.`;

export function buildSystem(ctx) {
  return `${SYSTEM}\n\n=== Hidden context (do not quote verbatim) ===\n${JSON.stringify(ctx, null, 1)}`;
}

// ---------------------------------------------------------------- tiny markdown renderer
function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
export function md(text) {
  const blocks = text.split(/```/);
  return blocks.map((b, i) => {
    if (i % 2 === 1) return `<pre>${esc(b.replace(/^[a-z]*\n/i, ''))}</pre>`;
    const lines = esc(b).split('\n');
    let html = ''; let inList = false;
    for (const ln of lines) {
      const li = ln.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
      if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
      if (inList) { html += '</ul>'; inList = false; }
      if (ln.trim()) html += `<p>${inline(ln.replace(/^#+\s*/, ''))}</p>`;
    }
    if (inList) html += '</ul>';
    return html;
  }).join('');
  function inline(s) { return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); }
}

// ---------------------------------------------------------------- UI
/** getCtx() returns the hidden context for the current state of the question. */
export function tutorBox({ getCtx, starters = [] }) {
  const history = []; // { role: 'user'|'model', text }
  const log = h('div.tutor-log');
  const input = h('textarea.tutor-in', { rows: 3, placeholder: 'Ask about this question – e.g. "Why is my COUNTIFS too high?"' });
  const send = h('button.btn.primary.sm', {}, 'Ask');
  const stop = h('button.btn.sm.hidden', {}, 'Stop');
  const status = h('div.tutor-status.small.muted');
  const chips = h('div.tutor-chips', {}, starters.map((s) => h('button.chip-btn', { type: 'button', onClick: () => { input.value = s; go(); } }, s)));
  const body = h('div.tutor-body', {}, log, chips, input, h('div.actions', { style: { marginTop: '6px' } }, send, stop), status);
  const box = h('details.tutor', {}, h('summary', {}, h('span', {}, '✦ AI tutor'), h('span.small.muted', {}, ' – Gemini, knows the verified answer and your attempt')), body);
  let ctrl = null;

  tutorAvailable().then((a) => {
    if (!a) { body.replaceChildren(h('p.small.muted', {}, 'The AI tutor runs on the course web server (clouterx.com/StudioExam). It is not available on this copy of the site.')); }
    else if (!a.configured) { body.replaceChildren(h('p.small.muted', {}, 'The AI tutor is installed but no API key is configured yet (api/.env).')); }
  });

  function bubble(role, text) {
    const el = h('div.msg', { class: role === 'user' ? 'me' : 'ai' });
    if (role === 'user') el.textContent = text; else el.innerHTML = md(text);
    log.append(el); log.scrollTop = log.scrollHeight;
    return el;
  }
  async function go() {
    const text = input.value.trim();
    if (!text || ctrl) return;
    input.value = ''; chips.classList.add('hidden');
    history.push({ role: 'user', text });
    bubble('user', text);
    ctrl = new AbortController();
    send.disabled = true; stop.classList.remove('hidden');
    try {
      const ctxNow = await getCtx();
      const r = await ask({ system: buildSystem(ctxNow), messages: history }, { signal: ctrl.signal, onStatus: (s) => { status.textContent = s; } });
      history.push({ role: 'model', text: r.text });
      bubble('model', r.text + (r.truncated ? '\n\n(The answer was cut off – ask "continue".)' : ''));
      status.textContent = '';
    } catch (e) {
      history.pop();
      status.textContent = e.name === 'AbortError' ? 'Stopped.' : e.message;
      log.lastChild?.classList.add('failed');
    } finally { ctrl = null; send.disabled = false; stop.classList.add('hidden'); }
  }
  send.addEventListener('click', go);
  stop.addEventListener('click', () => ctrl?.abort());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  return box;
}
