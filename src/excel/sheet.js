// The spreadsheet used by the site: GridCraft when the browser can run it (WebGL2/WebGPU),
// otherwise Univer. Both expose the same small API.
import * as gc from './gridcraft.js';
import WBINFO from '../data/wbinfo.json';

let engine = null; // module in use
let univerMod = null;
const loadUniver = () => (univerMod ??= import('./workbench.js'));

export const engineName = () => (engine === gc ? 'GridCraft' : engine ? 'Univer' : null);
export function currentWorkbook() { return engine?.currentWorkbook() || null; }
export function disposeWorkbook() { engine?.disposeWorkbook(); }

export async function mountWorkbook(host, wbId, onStatus) {
  const preferUniver = /[?&]engine=univer/.test(location.search) || !gc.supported();
  if (!preferUniver) {
    try {
      if (engine && engine !== gc) engine.disposeWorkbook();
      engine = gc;
      const r = await gc.mountWorkbook(host, wbId, onStatus);
      gc.setDescription(WBINFO[wbId] || null);
      return r;
    } catch (e) {
      console.warn('GridCraft unavailable, falling back to Univer:', e);
      gc.disposeWorkbook();
    }
  }
  if (engine === gc) engine = null;
  const u = await loadUniver();
  engine = u;
  return u.mountWorkbook(host, wbId, onStatus);
}

export async function activeCell() { return engine ? await engine.activeCell() : null; }
export async function insertFormula(f) { return engine ? await engine.insertFormula(f) : null; }
export function describeWorkbook() { return engine === gc ? gc.describeWorkbook() : engine?.describeWorkbook?.() || null; }
