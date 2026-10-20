// Thin promise wrapper around the SQLite worker. One database is open at a time.
const BASE = import.meta.env.BASE_URL;
let worker = null; let current = null; let opening = null; let seq = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    if (e.data.type === 'progress') { p.onProgress?.(e.data.got, e.data.total); return; }
    pending.delete(e.data.id);
    if (e.data.type === 'error') p.reject(new Error(e.data.message)); else p.resolve(e.data);
  };
  return worker;
}
function call(msg, onProgress) {
  const id = ++seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); ensureWorker().postMessage({ ...msg, id }); });
}

export const currentDb = () => current;

// Large databases are stored as numbered 20 MB parts (see tools/split_dbs.py).
let partsInfo = null;
export async function dbUrls(name) {
  partsInfo ??= fetch(`${BASE}data/db/parts.json`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}));
  const n = (await partsInfo)[name] || 0;
  const base = new URL(`${BASE}data/db/${name}.db.gz`, location.href).href;
  return n ? Array.from({ length: n }, (_, i) => `${base}.${String(i).padStart(3, '0')}`) : [base];
}

export async function openDb(name, onProgress) {
  if (current?.name === name) return current;
  if (opening?.name === name) return opening.promise;
  const promise = dbUrls(name).then((urls) => call({ type: 'open', urls }, onProgress)).then((r) => { current = { name, schema: r.schema }; opening = null; return current; });
  opening = { name, promise };
  return promise;
}

let queue = Promise.resolve();
export function exec(sql) {
  const run = () => call({ type: 'exec', sql });
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** Decompress a course database in the browser and hand it to the user as the original .db file. */
export async function downloadDb(name, filename) {
  const bufs = [];
  for (const u of await dbUrls(name)) { const r = await fetch(u); if (!r.ok) throw new Error(`Download failed (${r.status})`); bufs.push(new Uint8Array(await r.arrayBuffer())); }
  const gz = new Blob(bufs);
  const head = new Uint8Array(await gz.slice(0, 2).arrayBuffer());
  const blob = head[0] === 0x1f && head[1] === 0x8b ? await new Response(gz.stream().pipeThrough(new DecompressionStream('gzip'))).blob() : gz;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.sqlite3' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
