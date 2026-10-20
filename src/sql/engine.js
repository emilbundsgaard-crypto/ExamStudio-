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

export async function openDb(name, onProgress) {
  if (current?.name === name) return current;
  if (opening?.name === name) return opening.promise;
  const promise = call({ type: "open", url: new URL(`${BASE}data/db/${name}.db.gz`, location.href).href }, onProgress).then((r) => { current = { name, schema: r.schema }; opening = null; return current; });
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
  const res = await fetch(`${BASE}data/db/${name}.db.gz`);
  const enc = res.headers.get('content-encoding');
  let blob;
  if (enc && enc.includes('gzip')) blob = await res.blob();
  else blob = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.sqlite3' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
