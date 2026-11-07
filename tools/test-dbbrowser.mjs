// Browser test of the DB Browser-style SQL workbench. Needs the dev server: npx vite --port 5320
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:5320/';
const SHOTS = process.env.SHOTS || '/tmp';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1500, height: 920 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => console.log(c ? 'ok  ' : 'FAIL', m);
await p.goto(B + '#/q/C01'); await p.waitForSelector('.schema details', { timeout: 90000 });
const ed = p.locator('textarea.editor');
// --- Execute SQL: multiple statements, run all → last result; current statement
await ed.fill('SELECT COUNT(*) AS n FROM Customer;\nSELECT FirstName, LastName FROM Employee ORDER BY EmployeeId;');
await p.keyboard.press('Control+Enter').catch(() => {}); await ed.focus(); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(600);
ok((await p.locator('.db-exec .results th').allTextContents()).includes('FirstName'), 'run all shows last statement');
console.log('   status:', await p.locator('.db-status').textContent());
await ed.evaluate((e) => e.setSelectionRange(5, 5)); await p.click('text=▶| Current'); await p.waitForTimeout(500);
ok((await p.locator('.db-exec .results td.num').first().textContent()) === '59', 'current statement → Customer count 59');
// highlighting
ok(await p.locator('.hl .hl-kw').count() > 3 && await p.locator('.hl .hl-tbl').count() >= 2, 'syntax highlighting');
// --- autocomplete: type "SELECT * FROM Cus" → suggestion Customer
await ed.fill(''); await ed.focus(); await p.keyboard.type('SELECT c.Fir'); await p.waitForTimeout(150);
await ed.evaluate((e) => { e.value = 'SELECT * FROM Customer c WHERE c.'; e.setSelectionRange(e.value.length, e.value.length); e.dispatchEvent(new Event('input')); });
await p.keyboard.type('Cou'); await p.waitForTimeout(200);
const acTxt = await p.locator('.ac:not([hidden]) .ac-item').allTextContents();
ok(acTxt.some((t) => t.includes('Country')), 'alias autocomplete c.Cou → Country  ' + JSON.stringify(acTxt.slice(0, 3)));
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
ok((await ed.inputValue()).endsWith('c.Country'), 'Enter accepts suggestion');
await p.keyboard.type(" = 'Denmark'"); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(500);
console.log('   status:', await p.locator('.db-status').textContent());
await p.screenshot({ path: `${SHOTS}/db1.png` });
// --- Browse Data
await p.click('.db-tab[data-tab=browse]'); await p.waitForTimeout(500);
await p.selectOption('.db-browse select', 'Invoice'); await p.waitForTimeout(600);
console.log('   info:', await p.locator('.db-toolbar .muted').textContent(), '|', await p.locator('.db-pager span.small').first().textContent());
// filter BillingCountry contains "Germ" and Total >10
const heads = await p.locator('.db-grid thead tr:first-child th').allTextContents();
const ci = heads.indexOf('BillingCountry'); const ti = heads.indexOf('Total');
await p.locator('.db-grid tr.db-filters th').nth(ci).locator('input').fill('Germ');
await p.locator('.db-grid tr.db-filters th').nth(ti).locator('input').fill('>10'); await p.waitForTimeout(900);
const info = await p.locator('.db-toolbar .muted').textContent(); console.log('   filtered:', info);
// sort by Total desc
await p.locator('.db-grid thead tr:first-child th').nth(ti).click(); await p.waitForTimeout(400);
await p.locator('.db-grid thead tr:first-child th').nth(ti).click(); await p.waitForTimeout(500);
const firstTotal = await p.locator('.db-grid tbody tr:first-child td').nth(ti).textContent();
console.log('   top total:', firstTotal);
await p.locator('.db-grid tbody tr:first-child td').nth(ci).click(); await p.waitForTimeout(200);
console.log('   cell:', (await p.locator('.db-cell').textContent()).slice(0, 80));
await p.screenshot({ path: `${SHOTS}/db2.png` });
// show SQL → editor and run it, compare count
await p.click('text=⇢ Show as SQL'); await p.waitForTimeout(300);
const sel = await ed.evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd));
console.log('   sql:', sel.replace(/\n/g, ' '));
await p.keyboard.press('Control+Enter'); await p.waitForTimeout(500);
const st = await p.locator('.db-status').textContent();
ok(st.startsWith(info.split(' ')[0] + ' row'), `Show SQL gives same row count (${st})`);
// pager on unfiltered big table
await p.click('.db-tab[data-tab=browse]'); await p.selectOption('.db-browse select', 'InvoiceLine'); await p.waitForTimeout(600);
await p.click('.db-pager button[title=Last]'); await p.waitForTimeout(500);
console.log('   last page:', await p.locator('.db-pager span.small').first().textContent());
// --- Structure
await p.click('.db-tab[data-tab=struct]'); await p.waitForSelector('.db-structtable', { timeout: 10000 });
await p.locator('tr.db-table', { hasText: 'Invoice ' }).first().locator('.db-twisty').click();
console.log('   rel:', (await p.locator('.db-rel').textContent()).slice(0, 160));
await p.screenshot({ path: `${SHOTS}/db3.png` });
// schema ⧉ opens browse
await p.locator('.schema summary', { hasText: 'Artist' }).first().locator('.db-open').click(); await p.waitForTimeout(500);
ok((await p.inputValue('.db-browse select')) === 'Artist', 'schema ⧉ opens Browse Data');
// check answer still works: load reference via Show solution
console.log('errors:', errs.length ? errs : 'none');
await b.close();
