// Minimal DOM helpers.
export function h(tag, attrs = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function toast(msg, ms = 2600) {
  const t = h('div.toast', {}, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export const fmtNum = (v, dp) => {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v) && dp === undefined) return v.toLocaleString('en-US');
  return v.toLocaleString('en-US', { maximumFractionDigits: dp ?? 6, minimumFractionDigits: 0 });
};

export const levelDots = (n) => h('span.lvl', { title: ['', 'Basic', 'Intermediate', 'Advanced'][n] }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })));

export const statusDot = (st) => h('span.st', { class: st, title: { correct: 'Verified correct', wrong: 'Attempted – not yet correct', revealed: 'Solution viewed', new: 'Not started' }[st] || '' }, { correct: '✓', wrong: '✕', revealed: '◐' }[st] || '');

export const secs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function bar(frac) { return h('div.bar', {}, h('span', { style: { width: `${Math.round(Math.min(1, frac) * 100)}%` } })); }
