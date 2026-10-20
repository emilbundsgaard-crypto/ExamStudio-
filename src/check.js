// Answer checking. Excel answers are compared with verified values; SQL results with the reference query's result.

export function usDateToSerial(v) {
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  let y, mo, d, h = 0, mi = 0, se = 0;
  if (m) {
    [mo, d, y] = [+m[1], +m[2], +m[3]]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0);
    if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0);
  } else return NaN;
  return Date.UTC(y, mo - 1, d, h, mi, se) / 86400000 + 25569;
}

export function serialToText(v, withTime) {
  const ms = Math.round((v - 25569) * 86400000);
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  return withTime ? `${base} ${d.getUTCHours()}:${p(d.getUTCMinutes())}` : base;
}

function decimals(str) {
  const m = String(str).match(/\.(\d+)/);
  return m ? m[1].length : 0;
}

/** Parse what the student typed (or picked from a cell) into a comparable value. */
export function parseInput(a, raw, exact = false) {
  if (raw === null || raw === undefined) return { empty: true };
  let s = String(raw).trim();
  if (s === '') return { empty: true };
  if (a.kind === 'text' || a.choices) return { value: s };
  if (a.kind === 'datetime' || a.kind === 'date') {
    let v = Number(s.replace(/,/g, ''));
    if (!Number.isFinite(v)) v = usDateToSerial(s);
    if (!Number.isFinite(v)) return { error: 'Use a date like 12/7/2011 16:38 (month/day/year).' };
    return { value: v };
  }
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1).trim(); }
  s = s.replace(/[\s$]/g, '').replace(/,/g, '');
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { error: 'That is not a number.' };
  let v = Number(s);
  let dp = exact ? 15 : decimals(s);
  if (pct) { v /= 100; dp += 2; }
  return { value: v, dp };
}

function within(a, v, dp) {
  const target = Number(a.value);
  if (a.tol !== undefined) return Math.abs(v - target) <= a.tol;
  const tol = 0.5 * 10 ** -Math.min(dp, 12) + Math.abs(target) * 1e-12 + 1e-12;
  return Math.abs(v - target) <= tol;
}

/** returns { ok, close, msg } for one field */
export function checkField(a, parsed) {
  if (parsed.empty) return { ok: false, msg: 'Missing.' };
  if (parsed.error) return { ok: false, msg: parsed.error };
  if (a.kind === 'text' || a.choices) {
    const norm = (x) => String(x).trim().toLowerCase().replace(/\s+/g, ' ');
    const ok = [a.value, ...(a.accept || [])].some((x) => norm(x) === norm(parsed.value));
    return { ok };
  }
  const v = parsed.value;
  if (a.kind === 'datetime') return { ok: Math.abs(v - a.value) <= 1 / 1440 + 1e-9 };
  if (a.kind === 'date') return { ok: Math.floor(v + 1e-9) === Math.floor(a.value + 1e-9) };
  if (a.kind === 'int') {
    return { ok: Math.abs(v - a.value) < 1e-9 || (parsed.dp > 0 && within(a, v, parsed.dp)) };
  }
  const isWhole = Number.isInteger(a.value);
  const minDp = a.tol !== undefined ? 0 : isWhole ? 0 : Math.min(a.dp ?? 2, 4);
  if (within(a, v, Math.max(parsed.dp, 0))) {
    if (parsed.dp < minDp) return { ok: false, close: true, msg: `Right value, but give at least ${minDp} decimals${a.kind === 'pct' ? ' (as a fraction, or a percentage with ' + Math.max(minDp - 2, 0) + ')' : ''}.` };
    return { ok: true };
  }
  if (a.kind === 'pct' && within(a, v / 100, parsed.dp + 2)) return { ok: false, close: true, msg: 'Looks like a percentage typed without the % sign. Type 7.84% or 0.0784.' };
  return { ok: false };
}

/** Full check of an Excel-style question. inputs[i] = { raw, exact } */
export function checkExcel(q, inputs) {
  const fields = q.answers.map((a, i) => {
    const parsed = parseInput(a, inputs[i]?.raw, inputs[i]?.exact);
    const r = checkField(a, parsed);
    if (!r.ok && !parsed.empty && !parsed.error) {
      for (const d of q.diag || []) {
        if (d.a !== i) continue;
        const r2 = checkField({ ...a, value: d.value, accept: [] }, parsed);
        if (r2.ok || r2.close) { r.diag = d.msg; break; }
      }
    }
    return r;
  });
  const n = fields.filter((f) => f.ok).length;
  return { fields, result: n === fields.length ? 'correct' : n > 0 ? 'partial' : 'wrong' };
}

// ---------------------------------------------------------------- SQL
const normCell = (v) => {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') return (Math.round(v * 100) / 100).toFixed(2);
  if (v instanceof Uint8Array) return `blob:${v.length}`;
  const s = String(v).trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) && /^-?\d/.test(s) ? (Math.round(n * 100) / 100).toFixed(2) : s;
};

function columnKey(rows, j) {
  return rows.map((r) => normCell(r[j])).sort().join('\u0001');
}

export function signature(cols, rows) {
  return {
    rows: rows.length, cols: cols.length,
    sums: cols.map((_, j) => {
      const c = rows.map((r) => r[j]).filter((x) => x !== null && x !== undefined);
      return c.length && c.every((x) => typeof x === 'number') ? Math.round(c.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    }),
  };
}

function sigEq(a, b) {
  return a.rows === b.rows && a.cols === b.cols && a.sums.every((v, j) => (v === null && b.sums[j] === null) || (v !== null && b.sums[j] !== null && Math.abs(v - b.sums[j]) < 0.011));
}

const fmtRow = (r) => r.map((v) => (v === null ? 'NULL' : typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(4)) : `'${v}'`)).join(', ');

/** Compare the student's result with the expected result. */
export function compareSql(q, mine, expected) {
  const out = { ok: false, msgs: [] };
  const [mc, mr] = [mine.columns, mine.values];
  const [ec, er] = [expected.columns, expected.values];
  // 1. map each expected column to one of the student's columns with the same multiset of values
  const used = new Set();
  const map = [];
  const myKeys = mc.map((_, k) => (mr.length === er.length ? columnKey(mr, k) : null));
  for (let j = 0; j < ec.length; j++) {
    const key = columnKey(er, j);
    let found = -1;
    for (let k = 0; k < mc.length; k++) if (!used.has(k) && myKeys[k] === key) { found = k; break; }
    if (found < 0) { map.length = 0; break; }
    used.add(found); map.push(found);
  }
  if (map.length === ec.length && mr.length === er.length) {
    // 2. rows must match as a multiset on the mapped columns
    const a = mr.map((r) => map.map((k) => normCell(r[k])).join('\u0001')).sort();
    const b = er.map((r) => ec.map((_, j) => normCell(r[j])).join('\u0001')).sort();
    const same = a.every((x, i) => x === b[i]);
    if (same) {
      if (q.order) {
        const seqA = mr.map((r) => q.order.map((j) => normCell(r[map[j]])).join('|')).join('\n');
        const seqB = er.map((r) => q.order.map((j) => normCell(r[j])).join('|')).join('\n');
        if (seqA !== seqB) { out.msgs.push('Right rows, wrong order. Check your ORDER BY (column and ASC/DESC).'); out.close = true; return out; }
      }
      out.ok = true;
      if (mc.length > ec.length) out.note = `Correct. You returned ${mc.length - ec.length} extra column(s) – fine for practice, but in the exam return exactly what is asked.`;
      return out;
    }
  }
  // 3. diagnose
  const sig = signature(mc, mr);
  for (const v of q.variants || []) if (sigEq(sig, v.sig)) { out.msgs.push(v.msg); out.known = v.msg; break; }
  if (out.known) return out;
  if (mr.length !== er.length) out.msgs.push(`Your query returns ${mr.length.toLocaleString('en-US')} row${mr.length === 1 ? '' : 's'}; the correct result has ${er.length.toLocaleString('en-US')}.`);
  else if (mc.length < ec.length) out.msgs.push(`Your query returns ${mc.length} column(s); ${ec.length} are expected (${ec.join(', ')}).`);
  else {
    const bset = new Set(er.map((r) => ec.map((_, j) => normCell(r[j])).join('\u0001')));
    out.msgs.push('Same number of rows, but the values differ.');
    if (mc.length === ec.length) {
      const miss = mr.find((r) => !bset.has(r.map(normCell).join('\u0001')));
      if (miss) out.msgs.push(`For example, this row of yours is not in the correct result: (${fmtRow(miss)}).`);
    }
  }
  if (er.length === 1 && ec.length <= 3 && mr.length === 1) out.msgs.push('Compare carefully with the conditions in the question (>, >=, which rows are included).');
  return out;
}
