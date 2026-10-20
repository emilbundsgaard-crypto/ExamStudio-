// Checks the PivotTable engine against values verified with pandas on the course data.
import fs from 'node:fs';
import { build } from '../src/excel/pivot-core.js';
const wb = JSON.parse(fs.readFileSync(new URL('./cache/film.json', import.meta.url)));
const s = wb.sheets[0]; const hdr = s.rows[0]; const data = s.rows.slice(1);
const fields = hdr.map((name, index) => ({ name, index, date: String(index) in s.dateCols }));
const F = (n) => hdr.indexOf(n);
let fails = 0;
const eq = (label, got, want) => { const ok = typeof got === 'number' && Math.abs(got - want) < 1e-6; if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', label, got, want); };
const row = (g, lab) => g.find((r) => r && String(r[0]).trim() === lab);
const SP = { [F('EventType')]: ['Shooting Permit'] };
let p = build(data, fields, { rows: [F('Borough')], values: [{ field: F('EventID'), agg: 'count' }], filters: [F('EventType')], keep: SP });
eq('Brooklyn shooting', row(p.grid, 'Brooklyn')[1], 10367); eq('Grand total', row(p.grid, 'Grand Total')[1], 28680);
console.log('filter cell:', p.grid[0]);
p = build(data, fields, { rows: [F('StartDateTime')], cols: [F('Borough')], values: [{ field: F('EventID'), agg: 'count' }], filters: [F('EventType')], keep: SP, group: { [F('StartDateTime')]: 'years' } });
const hdrRow = p.grid[p.bodyTop - 1]; const r17 = row(p.grid, '2017');
eq('2017 Brooklyn', r17[hdrRow.indexOf('Brooklyn')], 1719); eq('2017 Manhattan', r17[hdrRow.indexOf('Manhattan')], 1550); eq('2017 total', r17[hdrRow.indexOf('Grand Total')], 1719 + 1550 + r17.slice(1, -1).reduce((a, b, i) => a + (['Brooklyn', 'Manhattan'].includes(hdrRow[i + 1]) ? 0 : (b || 0)), 0));
p = build(data, fields, { rows: [F('Category')], values: [{ field: F('EventID'), agg: 'count', show: 'grand' }], filters: [F('EventType')], keep: SP });
eq('Television % of total', row(p.grid, 'Television')[1], 16731 / 28680);
p = build(data, fields, { rows: [F('Borough'), F('EventType')], values: [{ field: F('EventID'), agg: 'count' }], layout: 'compact' });
eq('compact Brooklyn subtotal', row(p.grid, 'Brooklyn')[1], 11335); eq('compact grand', row(p.grid, 'Grand Total')[1], 33502);
p = build(data, fields, { rows: [F('Borough'), F('EventType')], values: [{ field: F('EventID'), agg: 'count' }], layout: 'tabular' });
eq('tabular Brooklyn Total', row(p.grid, 'Brooklyn Total')[2], 11335);
// sort by value desc: first body row should be Manhattan (most permits)
p = build(data, fields, { rows: [F('Borough')], values: [{ field: F('EventID'), agg: 'count' }], sort: { [F('Borough')]: 'value' } });
console.log('sort by value first:', p.grid[p.bodyTop][0]);
console.log(build(data, fields, { rows: [F('Borough'), F('EventType')], values: [{ field: F('EventID'), agg: 'count' }], layout: 'tabular' }).grid.slice(2, 9));
process.exit(fails ? 1 : 0);
