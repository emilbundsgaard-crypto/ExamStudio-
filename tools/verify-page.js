import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import enUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';
import { loadWorkbookJson, toUniverData } from '../src/excel/workbook.js';

const params = new URLSearchParams(location.search);
const wbId = params.get('wb');
const wb = await loadWorkbookJson(wbId);
const { univerAPI } = createUniver({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: mergeLocales(enUS) }, presets: [UniverSheetsCorePreset({ container: 'app' })] });
univerAPI.createWorkbook(toUniverData(wb));
window.__api = univerAPI;
window.__evalFormulas = async (formulas) => {
  const book = univerAPI.getActiveWorkbook();
  const ws = book.getSheetByName('Work');
  const out = [];
  // evaluate one at a time so a slow/failed formula cannot hide others
  for (let i = 0; i < formulas.length; i++) {
    const r = ws.getRange(i, 0);
    r.setValue(formulas[i]);
    let v = null;
    const t0 = performance.now();
    for (let k = 0; k < 600; k++) {
      await new Promise((s) => setTimeout(s, 25));
      const cd = r.getCellData?.(); v = (cd && cd.v !== undefined && cd.v !== null) ? cd.v : r.getValue();
      if (v !== null && v !== undefined && v !== '') break;
    }
    out.push({ v, ms: Math.round(performance.now() - t0), disp: r.getDisplayValue?.() });
  }
  return out;
};
window.__ready = true;
