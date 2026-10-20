// Runs SQLite (sql.js / WebAssembly) off the main thread so long queries never freeze the page.
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL = null;
let db = null;

async function inflate(buf) {
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'open') {
      SQL ??= await initSqlJs({ locateFile: () => wasmUrl });
      const res = await fetch(e.data.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        self.postMessage({ id, type: 'progress', got, total });
      }
      const gz = new Uint8Array(got); let o = 0; for (const c of chunks) { gz.set(c, o); o += c.length; }
      const enc = res.headers.get('content-encoding');
      const bytes = gz[0] === 0x1f && gz[1] === 0x8b && !(enc && enc.includes('gzip')) ? await inflate(gz) : gz;
      db?.close();
      db = new SQL.Database(bytes);
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map((r) => r[0]) || [];
      const schema = tables.map((t) => ({ name: t, cols: db.exec(`PRAGMA table_info("${t}")`)[0].values.map((r) => ({ name: r[1], type: r[2] })), rows: db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0] }));
      self.postMessage({ id, type: 'done', schema, bytes: e.data.wantBytes ? bytes : undefined });
    } else if (type === 'exec') {
      const t0 = performance.now();
      const stmt = db.prepare(e.data.sql);
      const columns = stmt.getColumnNames();
      const values = [];
      while (stmt.step()) values.push(stmt.get());
      stmt.free();
      self.postMessage({ id, type: 'done', columns, values, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err.message || err) });
  }
};
