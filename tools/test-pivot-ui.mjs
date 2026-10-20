// Browser test of the PivotTable UI. Needs the dev server: npx vite --port 5320
import { chromium } from 'playwright';
const B = 'http://localhost:5320/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1500, height: 920 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 300)); });
await p.goto(B + '#/q/F01'); await p.waitForSelector('.univer-host', { timeout: 90000 }); await p.waitForTimeout(5000);
await p.click('.pv-insert'); await p.waitForSelector('.pv-modal');
console.log('range:', await p.inputValue('.pv-modal input.pv-in'));
await p.screenshot({ path: '/tmp/claude-0/shots/pv1.png' });
await p.click('.pv-modal button.pv-btn.primary'); await p.waitForSelector('.pv-pane'); await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/claude-0/shots/pv2.png' });
const read = (n=14, w=6) => p.evaluate(([n,w]) => { const ws = window.__univerAPI.getActiveWorkbook().getActiveSheet(); return { name: ws.getSheetName(), v: ws.getRange(0,0,n,w).getValues() }; }, [n,w]);
console.log('placeholder', JSON.stringify((await read(4,2))));
// check Borough -> Rows
await p.click('.pv-field:has-text("Borough") input'); await p.waitForTimeout(800);
// drag Borough into Values (count)
const src = p.locator('.pv-field', { hasText: 'Borough' }).first();
const dst = p.locator('.pv-area', { hasText: 'Values' });
await src.dragTo(dst); await p.waitForTimeout(1500);
console.log(JSON.stringify(await read(10,3)));
// add Category to Columns via drag
await p.locator('.pv-field', { hasText: 'Category' }).first().dragTo(p.locator('.pv-area', { hasText: 'Columns' })); await p.waitForTimeout(1500);
console.log(JSON.stringify(await read(8,4)));
await p.screenshot({ path: '/tmp/claude-0/shots/pv3.png' });
// field menu on Category -> remove
await p.locator('.pv-area:has-text("Columns") .pv-caret').click(); await p.screenshot({ path: '/tmp/claude-0/shots/pv4.png' });
await p.click('.pv-menu >> text=Remove Field'); await p.waitForTimeout(800);
// value settings -> % of Grand total
await p.locator('.pv-area:has-text("Values") .pv-caret').click(); await p.click('.pv-menu >> text=Value Field Settings…');
await p.selectOption('.pv-modal select.pv-in', 'grand'); await p.screenshot({ path: '/tmp/claude-0/shots/pv5.png' });
await p.click('.pv-modal button.pv-btn.primary'); await p.waitForTimeout(1000);
console.log(JSON.stringify(await read(10,2)));
// filter on Borough rows
await p.locator('.pv-area:has-text("Rows") .pv-caret').click(); await p.click('.pv-menu >> text=Filter…');
await p.click('.pv-modal .pv-all input'); await p.click('.pv-checks label:has-text("Bronx") input'); await p.click('.pv-checks label:has-text("Queens") input');
await p.click('.pv-modal button.pv-btn.primary'); await p.waitForTimeout(1000);
console.log(JSON.stringify(await read(6,2))); console.log('ERRS', errs); console.log('cell', JSON.stringify(await p.evaluate(() => window.__univerAPI.getActiveWorkbook().getActiveSheet().getRange(3,1).getCellData())));
await p.screenshot({ path: '/tmp/claude-0/shots/pv6.png' });
// switch to data sheet: pane hides; back: pane shows
await p.evaluate(() => { const wb = window.__univerAPI.getActiveWorkbook(); wb.setActiveSheet(wb.getSheets()[0]); }); await p.waitForTimeout(800);
console.log('pane after switch:', await p.locator('.pv-pane').count());
await p.evaluate(() => { const wb = window.__univerAPI.getActiveWorkbook(); wb.setActiveSheet(wb.getSheetByName('PivotTable1')); }); await p.waitForTimeout(800);
console.log('pane after back:', await p.locator('.pv-pane').count());
// date field grouping
await p.locator('.pv-area:has-text("Rows") .pv-caret').click(); await p.click('.pv-menu >> text=Remove Field'); await p.waitForTimeout(500);
const df = await p.$$eval('.pv-field', (a) => a.filter((x) => x.textContent.includes('(date)')).map((x) => x.textContent));
console.log('date fields', df);
if (df.length) { await p.locator('.pv-field', { hasText: df[0].replace(' (date)','').trim() }).first().dragTo(p.locator('.pv-area', { hasText: 'Rows' })); await p.waitForTimeout(1500); console.log(JSON.stringify(await read(14,2))); }
await p.screenshot({ path: '/tmp/claude-0/shots/pv7.png' });
// active cell read
await p.click('text=⇦ cell').catch(()=>{});
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close();
