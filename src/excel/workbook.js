// Converts the exported course workbooks (public/data/wb/*.json.gz) into Univer workbook data.
const BASE = import.meta.env.BASE_URL;

export async function fetchGz(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  // GitHub Pages serves .gz as application/gzip without Content-Encoding, so we inflate ourselves.
  const enc = res.headers.get('content-encoding');
  if (enc && enc.includes('gzip')) return await res.arrayBuffer();
  const ds = res.body.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).arrayBuffer();
}

export async function loadWorkbookJson(id) {
  const buf = await fetchGz(`${BASE}data/wb/${id}.json.gz`);
  return JSON.parse(new TextDecoder().decode(buf));
}

const colName = (j) => { let s = ''; j += 1; while (j > 0) { const m = (j - 1) % 26; s = String.fromCharCode(65 + m) + s; j = Math.floor((j - 1) / 26); } return s; };
export { colName };

export function toUniverData(wb, { workSheet = true } = {}) {
  const styles = {
    hdr: { bl: 1, bg: { rgb: '#EEF2F7' } },
    dt: { n: { pattern: 'm/d/yyyy h:mm' } },
    d: { n: { pattern: 'm/d/yyyy' } },
  };
  const sheets = {};
  const order = [];
  wb.sheets.forEach((s, si) => {
    const id = `s${si}`;
    order.push(id);
    const cellData = {};
    let maxCols = 0;
    const textCols = new Set(s.textCols || []);
    const widths = [];
    s.rows.forEach((r, i) => {
      const o = {};
      maxCols = Math.max(maxCols, r.length);
      r.forEach((v, j) => {
        if (v === null || v === undefined) return;
        let cell;
        if (typeof v === 'number') {
          const fmt = i > 0 ? s.dateCols?.[j] : undefined;
          cell = { v, t: 2 };
          if (fmt) cell.s = fmt.includes('h') ? 'dt' : 'd';
        } else if (typeof v === 'boolean') {
          cell = { v: v ? 1 : 0, t: 3 };
        } else {
          cell = { v: String(v), t: textCols.has(j) && i > 0 ? 4 : 1 };
        }
        if (i === 0) cell.s = 'hdr';
        o[j] = cell;
        if (i < 200) {
          const len = typeof v === 'number' ? (s.dateCols?.[j] ? 15 : String(Math.round(v * 100) / 100).length) : String(v).length;
          widths[j] = Math.max(widths[j] || 6, Math.min(len, 38));
        }
      });
      cellData[i] = o;
    });
    const columnData = {};
    widths.forEach((w, j) => { columnData[j] = { w: Math.round(w * 7.2 + 18) }; });
    sheets[id] = {
      id, name: s.name, rowCount: Math.max(s.rows.length + 200, 1000), columnCount: Math.max(maxCols + 12, 26),
      cellData, columnData, freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
      defaultColumnWidth: 88, defaultRowHeight: 22,
    };
  });
  if (workSheet) {
    sheets.work = { id: 'work', name: 'Work', rowCount: 500, columnCount: 26, cellData: {}, defaultColumnWidth: 170, defaultRowHeight: 22 };
    order.push('work');
  }
  return { id: `wb-${wb.id}-${Date.now()}`, name: wb.title, appVersion: '1.0.3', locale: 'enUS', styles, sheetOrder: order, sheets };
}
