// End-to-end smoke test of the built site (vite preview must be running on 5310).
import { chromium } from 'playwright';
const B = process.env.URL || 'http://localhost:5310/';
const out = process.env.SHOTS || '/tmp/claude-0/shots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
await p.goto(B); await p.waitForSelector('.case-card'); await shot('01-home');
await p.goto(B + '#/case/film'); await p.waitForSelector('.qrow'); await shot('02-case');
// Excel question F12 (multi community boards)
await p.goto(B + '#/q/FB12'); await p.waitForSelector('.univer-host', { timeout: 60000 }); await p.waitForTimeout(4000); await shot('03-excel-q');
await p.fill('.field input', '0.636'); await p.click('text=Check'); await p.waitForSelector('.feedback'); await shot('04-excel-wrong');
console.log('excel wrong feedback:', (await p.textContent('.feedback')).slice(0, 200));
await p.fill('.field input', '15.27'); await p.click('text=Check'); await p.waitForSelector('.feedback.ok'); console.log('excel right:', (await p.textContent('.feedback')).slice(0, 80));
// insert formula via solution, then use cell
p.once('dialog', (d) => d.accept());
await p.click('text=Show solution'); await p.click('text=Insert formula in Work sheet'); await p.waitForTimeout(3000); await shot('05-excel-formula');
// SQL question P07
await p.goto(B + '#/q/P07'); await p.waitForSelector('.editor'); await p.waitForSelector('.schema details', { timeout: 120000 }); await shot('06-sql-loaded');
await p.fill('.editor', "SELECT SUM(CASE WHEN Amount >= 500 THEN Amount * 0.0075 ELSE Amount * 0.005 END) FROM pcards WHERE Year = 2014 AND Vendor = 'Amazon.com' AND Amount > 0");
await p.click('text=▶ Run'); await p.waitForSelector('.results table'); await p.click('text=Check my result'); await p.waitForSelector('.feedback.bad', { timeout: 60000 });
console.log('sql diag:', (await p.textContent('.feedback')).slice(0, 220)); await shot('07-sql-wrong');
await p.fill('.editor', "SELECT ROUND(SUM(CASE WHEN Amount >= 500 THEN Amount * 0.0075 ELSE Amount * 0.005 END),2) AS e FROM pcards WHERE Year = 2014 AND Vendor LIKE 'amazon.com' AND Amount > 0");
await p.click('text=▶ Run'); await p.waitForTimeout(1500); await p.click('text=Check my result'); await p.waitForSelector('.feedback.ok', { timeout: 60000 }); console.log('sql ok:', (await p.textContent('.feedback')).slice(0, 80));
// interpretation
await p.goto(B + '#/interp/REST-L'); await p.waitForSelector('.regtable'); await shot('08-interp');
await p.goto(B + '#/progress'); await p.waitForSelector('.kpis'); await shot('09-progress');
await p.goto(B + '#/exam/film/chinook/42/8'); await p.waitForSelector('.exambar'); await p.waitForTimeout(5000); await shot('10-exam');
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(B); await p.waitForSelector('.case-card'); await shot('11-mobile-home');
await p.goto(B + '#/q/S04'); await p.waitForSelector('.schema details', { timeout: 60000 }); await shot('12-mobile-sql');
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await b.close();
