// Verifies the question bank against the engines the website actually uses:
//  * Excel answers: every reference formula is evaluated in Univer (headless Chromium) and compared with pandas.
//  * SQL answers: every reference query runs in sql.js and its result signature is compared with SQLite/Python.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Q = JSON.parse(fs.readFileSync(path.join(root, 'src/data/questions.json'), 'utf8'));
const only = process.argv[2];
let fails = 0, checked = 0;

function usDate(v) {
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return NaN;
  const ms = Date.UTC(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return ms / 86400000 + 25569;
}
function close(a, v) {
  if ((a.kind === 'datetime' || a.kind === 'date') && typeof v === 'string') v = usDate(v);
  if (a.kind === 'text') return String(v).trim().toLowerCase() === String(a.value).trim().toLowerCase();
  const x = Number(v), y = Number(a.value);
  if (!Number.isFinite(x)) return false;
  const tol = a.kind === 'datetime' ? 1 / 1440 : Math.max(1e-6, Math.abs(y) * 1e-9);
  return Math.abs(x - y) <= tol;
}

// ---------- Excel
const xq = Q.filter((q) => q.tool === 'excel' && (!only || q.wb === only || q.id === only));
if (xq.length) {
  const server = await createServer({ root, server: { port: 5287 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const byWb = {};
  xq.forEach((q) => (byWb[q.wb] ??= []).push(q));
  for (const [wb, qs] of Object.entries(byWb)) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
    await page.goto(`http://localhost:5287/tools/verify.html?wb=${wb}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const items = qs.flatMap((q) => q.answers.map((a, i) => ({ q, a, i })));
    const res = await page.evaluate((fs) => window.__evalFormulas(fs), items.map((x) => x.a.formula));
    items.forEach((it, k) => {
      checked++;
      const r = res[k];
      const ok = close(it.a, r.v);
      if (!ok) { fails++; console.log(`FAIL ${it.q.id}[${it.i}] expected ${JSON.stringify(it.a.value)} got ${JSON.stringify(r.v)} (${r.ms}ms)\n     ${it.a.formula.slice(0, 220)}`); }
      else if (r.ms > 4000) console.log(`slow ${it.q.id}[${it.i}] ${r.ms}ms`);
    });
    console.log(`${wb}: ${items.length} formulas checked`);
    await page.close();
  }
  await browser.close();
  await server.close();
}

// ---------- SQL
const sq = Q.filter((q) => q.tool === 'sql' && (!only || q.db === only || q.id === only));
if (sq.length) {
  const SQL = await initSqlJs();
  const dbs = {};
  const sig = (cols, rows) => ({ rows: rows.length, cols: cols.length, sums: cols.map((_, j) => { const c = rows.map((r) => r[j]).filter((x) => x !== null); return c.length && c.every((x) => typeof x === 'number') ? Math.round(c.reduce((a, b) => a + b, 0) * 100) / 100 : null; }) });
  for (const q of sq) {
    if (!dbs[q.db]) {
      const dir = path.join(root, 'public/data/db');
      const n = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'))[q.db] || 0;
      const gz = n ? Buffer.concat(Array.from({ length: n }, (_, i) => fs.readFileSync(path.join(dir, `${q.db}.db.gz.${String(i).padStart(3, '0')}`)))) : fs.readFileSync(path.join(dir, `${q.db}.db.gz`));
      dbs[q.db] = new SQL.Database(zlib.gunzipSync(gz));
    }
    const t0 = Date.now();
    const r = dbs[q.db].exec(q.ref);
    const cols = r[0]?.columns ?? [], rows = r[0]?.values ?? [];
    const s = sig(cols, rows);
    checked++;
    const same = s.rows === q.sig.rows && s.cols === q.sig.cols && s.sums.every((v, j) => (v === null && q.sig.sums[j] === null) || Math.abs(v - q.sig.sums[j]) < 0.011);
    if (!same) { fails++; console.log(`FAIL ${q.id} sql.js ${JSON.stringify(s)} vs python ${JSON.stringify(q.sig)}`); }
    if (Date.now() - t0 > 3000) console.log(`slow ${q.id} ${Date.now() - t0}ms`);
  }
  console.log(`sql: ${sq.length} queries checked`);
}
console.log(`\n${checked} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
