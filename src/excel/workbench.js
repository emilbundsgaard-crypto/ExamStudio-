// The built-in spreadsheet: Univer (open-source, Excel-compatible) loaded with the course workbook.
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import enUS from '@univerjs/preset-sheets-core/locales/en-US';
import filterEN from '@univerjs/preset-sheets-filter/locales/en-US';
import sortEN from '@univerjs/preset-sheets-sort/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import '@univerjs/preset-sheets-sort/lib/index.css';
import { loadWorkbookJson, toUniverData } from './workbook.js';
import { createPivotTool } from './pivot-ui.js';

let inst = null; // { wbId, univer, univerAPI, host }

export function currentWorkbook() { return inst?.wbId || null; }

export async function mountWorkbook(host, wbId, onStatus) {
  if (inst && inst.wbId === wbId) {
    if (inst.host.parentElement !== host) host.appendChild(inst.host);
    return inst;
  }
  disposeWorkbook();
  onStatus?.('Loading workbook…');
  const data = await loadWorkbookJson(wbId);
  onStatus?.('Building spreadsheet…');
  const el = document.createElement('div');
  el.className = 'univer-host';
  host.appendChild(el);
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(enUS, filterEN, sortEN) },
    presets: [UniverSheetsCorePreset({ container: el, disableTextFormatAlert: true, disableTextFormatMark: true }), UniverSheetsFilterPreset(), UniverSheetsSortPreset()],
  });
  univerAPI.createWorkbook(toUniverData(data));
  if (import.meta.env.DEV) window.__univerAPI = univerAPI;
  // On a Mac, Univer binds jump/extend-selection to Cmd+arrow (as Mac Excel does). Accept Ctrl+arrow too.
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    const DIR = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
    el.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.metaKey || e.altKey || !(e.key in DIR)) return;
      e.preventDefault(); e.stopPropagation();
      univerAPI.executeCommand(e.shiftKey ? 'sheet.command.expand-selection' : 'sheet.command.move-selection', { direction: DIR[e.key], jumpOver: 1 });
    }, true);
  }
  const dateCols = Object.fromEntries(data.sheets.map((s) => [s.name, s.dateCols || {}]));
  const pivot = createPivotTool({ api: univerAPI, get host() { return el.parentElement; }, dateCols });
  inst = { wbId, univer, univerAPI, host: el, pivot, sheets: data.sheets.map((s) => ({ name: s.name, headers: s.rows[0], rows: s.rows.length - 1, example: s.rows[1] })) };
  onStatus?.('');
  return inst;
}

export function disposeWorkbook() {
  if (!inst) return;
  try { inst.pivot.dispose(); } catch { /* ignore */ }
  try { inst.univer.dispose(); } catch { /* ignore */ }
  inst.host.remove();
  inst = null;
}

/** Value of the active cell, raw (full precision). */
export async function activeCell() {
  if (!inst) return null;
  const wb = inst.univerAPI.getActiveWorkbook();
  const ws = wb?.getActiveSheet();
  const r = ws?.getActiveRange?.() || wb?.getActiveRange?.();
  if (!r) return null;
  // raw cell (the facade returns number-formatted text, e.g. "42.86%", which loses precision)
  let cd = null;
  try { cd = ws.getSheet().getCellRaw(r.getRow(), r.getColumn()); } catch { /* fall back */ }
  cd ??= r.getCellData?.();
  const v = cd && cd.v !== undefined && cd.v !== null ? cd.v : r.getValue();
  return { value: v, address: `${ws.getSheetName()}!${r.getA1Notation()}`, formula: cd?.f || null };
}

/** Put a formula into the first empty row of the Work sheet and select it. */
export async function insertFormula(formula) {
  if (!inst) return null;
  const wb = inst.univerAPI.getActiveWorkbook();
  const ws = wb.getSheetByName('Work');
  let row = 0;
  while (row < 400 && ws.getRange(row, 0).getValue() !== null && ws.getRange(row, 0).getValue() !== '') row++;
  wb.setActiveSheet(ws);
  const r = ws.getRange(row, 0);
  r.setValue(formula);
  ws.setActiveRange?.(r);
  return `Work!A${row + 1}`;
}

/** Sheet names, headers and row counts – context for the AI tutor. */
export function describeWorkbook() { return inst ? inst.sheets : null; }

/** Excel: Insert ▸ PivotTable (or reopen the field list when a PivotTable sheet is active). */
export function insertPivot() { inst?.pivot.insert(); return !!inst; }
