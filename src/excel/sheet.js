// The spreadsheet used by the site: Univer (fast, in-page). GridCraft can be tried with ?engine=gridcraft
// when its files are installed (tools/build-gridcraft.sh). Both expose the same small API.
import * as gc from './gridcraft.js';
import WBINFO from '../data/wbinfo.json';

let engine = null; // module in use
let univerMod = null;
const loadUniver = () => (univerMod ??= import('./workbench.js'));

export const engineName = () => (engine === gc ? 'GridCraft' : engine ? 'Univer' : null);
export function currentWorkbook() { return engine?.currentWorkbook() || null; }
export function disposeWorkbook() { engine?.disposeWorkbook(); }

// Crash-loop guard: if the tab died while GridCraft was starting (Safari reloads the page after a
// crash), the next load uses the basic spreadsheet instead of crashing again.
const GUARD = 'examstudio.gridcraftStarting';
const guard = { get: () => { try { return localStorage.getItem(GUARD); } catch { return null; } }, set: (v) => { try { if (v) localStorage.setItem(GUARD, v); else localStorage.removeItem(GUARD); } catch { /* ignore */ } } };
let crashedBefore = !!guard.get();
export const gridcraftCrashed = () => crashedBefore;
export function retryGridcraft() { crashedBefore = false; guard.set(null); }

export async function mountWorkbook(host, wbId, onStatus) {
  const preferUniver = !/[?&]engine=gridcraft/.test(location.search) || !gc.supported() || crashedBefore;
  if (!preferUniver) {
    try {
      if (engine && engine !== gc) engine.disposeWorkbook();
      engine = gc;
      guard.set(String(Date.now()));
      const r = await gc.mountWorkbook(host, wbId, onStatus);
      gc.setDescription(WBINFO[wbId] || null);
      // still alive 15 s after opening the workbook: GridCraft is stable in this browser
      setTimeout(() => guard.set(null), 15000);
      return r;
    } catch (e) {
      console.warn('GridCraft unavailable, falling back to Univer:', e);
      guard.set(null);
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
export function insertPivot() { return engine && engine !== gc ? engine.insertPivot() : false; }
