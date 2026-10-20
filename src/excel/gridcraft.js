// GridCraft (open-source Excel-style spreadsheet, MIT/Apache-2.0, https://github.com/storytold/gridcraft)
// embedded in an iframe through its host bridge (?host=parent). The course workbook is sent in as .xlsx;
// `gridcraft:run` (our small addition to the bridge) reads the selected cell or enters a formula.
const BASE = import.meta.env.BASE_URL;

let inst = null; // { wbId, frame, host, ready: Promise, pending: Map, seq }

function onMessage(e) {
  if (!inst || e.source !== inst.frame.contentWindow || e.origin !== location.origin) return;
  const d = e.data || {};
  if (d.type === 'gridcraft:ready') inst.onReady?.();
  else if (d.type === 'gridcraft:failed') inst.onFail?.(new Error(d.error || 'GridCraft could not start'));
  else if (d.type === 'gridcraft:result') {
    const p = inst.pending.get(d.id);
    if (!p) return;
    inst.pending.delete(d.id);
    if (d.ok) { try { p.resolve(JSON.parse(d.result)); } catch { p.resolve(d.result); } } else p.reject(new Error(d.error));
  }
}
window.addEventListener('message', onMessage);

export function currentWorkbook() { return inst?.wbId || null; }

/** Is WebGL2 (or WebGPU) available? GridCraft draws with the GPU. */
export function supported() {
  if ('gpu' in navigator) return true;
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

export async function mountWorkbook(host, wbId, onStatus) {
  if (inst && inst.wbId === wbId) {
    if (inst.host.parentElement !== host) host.appendChild(inst.host);
    return inst;
  }
  disposeWorkbook();
  onStatus?.('Starting the spreadsheet…');
  const probe = await fetch(`${BASE}gridcraft/index.html`, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
  if (!probe?.ok) throw new Error('GridCraft is not installed on this site');
  const el = document.createElement('div');
  el.className = 'univer-host gridcraft-host';
  const frame = document.createElement('iframe');
  frame.title = 'Spreadsheet';
  frame.src = `${BASE}gridcraft/index.html?host=parent&author=Student`;
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  el.appendChild(frame);
  host.appendChild(el);
  const me = { wbId, frame, host: el, pending: new Map(), seq: 0 };
  inst = me;
  const xlsx = fetch(`${BASE}data/xlsx/${wbId}.xlsx`).then((r) => { if (!r.ok) throw new Error(`Workbook missing (${r.status})`); return r.arrayBuffer(); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('GridCraft did not start in time')), 45000);
    me.onReady = () => { clearTimeout(t); resolve(); };
    me.onFail = (e) => { clearTimeout(t); reject(e); };
  });
  onStatus?.('Opening the workbook…');
  const bytes = await xlsx;
  frame.contentWindow.postMessage({ type: 'gridcraft:open', name: `${wbId}.xlsx`, bytes }, location.origin);
  // wait until the workbook is the active document
  for (let i = 0; i < 100; i++) {
    try { const info = await run('document.inspect', {}); if (JSON.stringify(info).includes('"Work"')) break; } catch { /* not open yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  frame.focus();
  onStatus?.('');
  return me;
}

export function disposeWorkbook() {
  if (!inst) return;
  inst.pending.forEach((p) => p.reject(new Error('closed')));
  inst.host.remove();
  inst = null;
}

export function run(command, params = {}) {
  if (!inst) return Promise.reject(new Error('No spreadsheet open'));
  const id = `r${++inst.seq}`;
  return new Promise((resolve, reject) => {
    inst.pending.set(id, { resolve, reject });
    inst.frame.contentWindow.postMessage({ type: 'gridcraft:run', id, command, params: JSON.stringify(params) }, location.origin);
    setTimeout(() => { if (inst?.pending.delete(id)) reject(new Error('GridCraft did not answer')); }, 8000);
  });
}

function activeSheetName(info) {
  const i = info?.activeSheet;
  if (typeof i === 'number') return info.sheets?.[i]?.name || null;
  return typeof i === 'string' ? i : null;
}

/** Value of the selected cell: { value, address, formula } */
export async function activeCell() {
  if (!inst) return null;
  const c = await run('cell.get', {});
  let sheet = null;
  try { sheet = activeSheetName(await run('document.inspect', {})); } catch { /* ignore */ }
  let v = c.value;
  if (v && typeof v === 'object') v = v.number ?? v.text ?? v.value ?? v.bool ?? null;
  return { value: v, address: sheet ? `${sheet}!${c.cell}` : c.cell, formula: c.formula, text: c.text };
}

/** Put a formula into the first empty cell in column A of the Work sheet and select it. */
export async function insertFormula(formula) {
  if (!inst) return null;
  await run('sheet.activate', { sheet: 'Work', name: 'Work' }).catch(() => {});
  const r = await run('sheet.read', { sheet: 'Work', range: 'A1:A400' }).catch(() => null);
  const vals = r?.values || [];
  let row = vals.findIndex((x) => x[0] === null || x[0] === '' || (typeof x[0] === 'object' && !x[0]));
  if (row < 0) row = vals.length;
  const cell = `A${row + 1}`;
  await run('cell.set', { sheet: 'Work', cell, input: formula });
  await run('selection.set', { sheet: 'Work', range: cell }).catch(() => {});
  inst.frame.focus();
  return `Work!${cell}`;
}

let described = null;
export function describeWorkbook() { return described; }
export function setDescription(d) { described = d; }
