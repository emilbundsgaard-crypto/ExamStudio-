import { h, levelDots, statusDot } from '../ui.js';
import { QUESTIONS } from '../data/index.js';
import { caseById } from '../data/cases.js';
import { qState } from '../store.js';

// Short reference of the formulas and SQL used in the course. Practice buttons are found automatically:
// a question is linked when its verified reference solution uses the function (or carries the skill tag).
const X = 'excel', S = 'sql';
export const GUIDE = [
  { group: 'Counting & summing', tool: X, items: [
    { k: 'COUNTIFS', syntax: 'COUNTIFS(range1, criteria1, [range2, criteria2], …)', what: 'Counts rows where every condition holds.', ex: '=COUNTIFS(H:H,"Brooklyn",B:B,"Shooting Permit") → 10,367', pit: 'All ranges must be the same size. Text criteria are not case-sensitive; use "*text*" for "contains".', fn: ['COUNTIFS', 'COUNTIF'] },
    { k: 'SUMIFS', syntax: 'SUMIFS(sum_range, criteria_range1, criteria1, …)', what: 'Adds the values in sum_range for rows that meet all conditions.', ex: '=SUMIFS(OT_Pay, Emp_No, 195)', pit: 'sum_range comes FIRST in SUMIFS (unlike SUMIF).', fn: ['SUMIFS', 'SUMIF'] },
    { k: 'AVERAGEIFS', syntax: 'AVERAGEIFS(avg_range, criteria_range1, criteria1, …)', what: 'Average of the values that meet the conditions.', ex: '=AVERAGEIFS(D:D,H:H,"Brooklyn")', pit: 'It can only average an existing column – for a calculation (End − Start) use a helper column or AVERAGE(FILTER(…)).', fn: ['AVERAGEIFS'], skills: ['date arithmetic'] },
    { k: 'SUMPRODUCT', syntax: 'SUMPRODUCT(array1, [array2], …)', what: 'Multiplies arrays element by element and sums – a flexible conditional count/sum.', ex: '=SUMPRODUCT((H2:H100="Bronx")*(WEEKDAY(C2:C100,2)>5))', pit: 'Conditions become 1/0 when multiplied. Text cells in a multiplied range give #VALUE!.', fn: ['SUMPRODUCT'] },
    { k: 'COUNTA / COUNTBLANK', syntax: 'COUNTA(range) · COUNTBLANK(range)', what: 'Counts non-empty cells / truly empty cells.', ex: '=COUNTA(A:A)-1 → number of records', pit: 'A cell with "N/A" or a space is NOT blank – a classic missing-data trap.', fn: ['COUNTA', 'COUNTBLANK'], skills: ['data quality'] },
    { k: 'MAXIFS / MINIFS / LARGE', syntax: 'MAXIFS(max_range, criteria_range, criteria) · LARGE(array, k)', what: 'Largest/smallest value under conditions; LARGE gives the k-th largest.', ex: '=LARGE(COUNTIFS(H:H,UNIQUE(H:H)),2) → second-ranked borough', pit: 'MAX of an empty filter returns 0, not an error.', fn: ['MAXIFS', 'MINIFS', 'LARGE', 'MAX', 'MIN'], skills: ['ranking'] },
  ] },
  { group: 'Lookups & joins', tool: X, items: [
    { k: 'XLOOKUP', syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])', what: 'Finds a value and returns the matching item from another column – the modern join.', ex: '=XLOOKUP(B2,ChartOfAccounts!B:B,ChartOfAccounts!C:C) → AccountType', pit: 'Exact match by default. A number stored as text will not match a number.', fn: ['XLOOKUP'], skills: ['joins'] },
    { k: 'INDEX / MATCH', syntax: 'INDEX(return_range, MATCH(value, lookup_range, 0))', what: 'Classic two-step lookup; works left of the key and with two keys.', ex: '=INDEX(H:H,MATCH(300127,A:A,0)) → Manhattan', pit: 'Always put 0 as the last MATCH argument for an exact match.', fn: ['MATCH', 'XMATCH'], skills: ['lookup', 'INDEX/MATCH'] },
    { k: 'VLOOKUP', syntax: 'VLOOKUP(value, table, col_index, FALSE)', what: 'Looks up in the first column of a table and returns column n.', ex: '=VLOOKUP(300127,A:H,8,FALSE)', pit: 'Forgetting FALSE gives an approximate (wrong) match; it cannot look left.', fn: ['VLOOKUP'], skills: ['lookup', 'joins'] },
    { k: 'Composite keys', syntax: '=A2&"-"&B2  or  COUNTIFS(id, x, unit, y)', what: 'When one column is not unique (PreparerID per business unit), combine columns into a key.', ex: '=COUNTIFS(D:D,101,C:C,1) → lines by Carolyn Slater', pit: 'Joining on PreparerID alone mixes up different people.', fn: [], skills: ['composite keys', 'unique identifiers'] },
  ] },
  { group: 'Dynamic arrays (Excel 365)', tool: X, items: [
    { k: 'FILTER', syntax: 'FILTER(array, include, [if_empty])', what: 'Returns only the rows that meet a condition – combine with AVERAGE, SUM, MAX…', ex: '=AVERAGE(FILTER((D2:D99-C2:C99)*24,B2:B99="Shooting Permit")) → hours', pit: 'Multiple conditions: (cond1)*(cond2) for AND, (cond1)+(cond2) for OR.', fn: ['FILTER'] },
    { k: 'UNIQUE', syntax: 'UNIQUE(array)', what: 'Distinct values (or distinct rows).', ex: '=ROWS(UNIQUE(B2:B33503)) → 4 event types', pit: 'A blank cell counts as one more unique value – filter blanks out first.', fn: ['UNIQUE', 'ROWS'] },
    { k: 'SORTBY', syntax: 'SORTBY(array, by_array, -1)', what: 'Sorts one array by another; with INDEX(…,1) it gives "the top one".', ex: '=INDEX(SORTBY(UNIQUE(K:K),COUNTIF(K:K,UNIQUE(K:K)),-1),1) → most common category', pit: '-1 = descending, 1 = ascending.', fn: ['SORTBY', 'SORT'] },
    { k: 'LET', syntax: 'LET(name, value, …, result)', what: 'Names an intermediate result so a long formula is readable and computed once.', ex: '=LET(k,LEFT(A2:A598,3),ROWS(UNIQUE(k)))', pit: 'Names must not look like cell references (x7, AB1).', fn: ['LET'] },
    { k: 'MAP / LAMBDA', syntax: 'MAP(array, LAMBDA(x, formula_using_x))', what: 'Applies your own formula to every element – e.g. extracting a code from each row.', ex: '=MAP(A2:A598,LAMBDA(x,LEFT(x,3)))', pit: 'Powerful but slow on 30,000+ rows; a helper column is often simpler.', fn: ['MAP', 'LAMBDA', 'BYCOL', 'SEQUENCE'] },
  ] },
  { group: 'Text (ETL)', tool: X, items: [
    { k: 'LEFT / RIGHT / MID', syntax: 'LEFT(text, n) · RIGHT(text, n) · MID(text, start, n)', what: 'Cut a code into its parts (location, ID, plant, pay period).', ex: '=MID("JAP1080-19M",4,4) → "1080"', pit: 'The result is TEXT – wrap in VALUE() or -- to use it as a number.', fn: ['LEFT', 'RIGHT', 'MID', 'VALUE'], skills: ['text functions', 'MID'] },
    { k: 'FIND / SEARCH', syntax: 'FIND(find, within) · SEARCH(find, within)', what: 'Position of a character – e.g. the hyphen in an employee code.', ex: '=MID(A2,FIND("-",A2)+1,2) → plant ID', pit: 'FIND is case-sensitive, SEARCH is not and allows wildcards.', fn: ['FIND', 'SEARCH'] },
    { k: 'TRIM / SUBSTITUTE / LEN', syntax: 'TRIM(text) · SUBSTITUTE(text, old, new) · LEN(text)', what: 'Clean messy text: extra spaces, inconsistent codes, wrong lengths.', ex: '=SUBSTITUTE("A M Z N"," ","") → "AMZN"', pit: 'TRIM keeps single spaces between words.', fn: ['TRIM', 'SUBSTITUTE', 'LEN'], skills: ['transformation', 'data quality'] },
    { k: 'TEXTBEFORE / TEXTAFTER', syntax: 'TEXTBEFORE(text, delimiter) · TEXTAFTER(text, delimiter)', what: 'Split at a delimiter – e.g. "Name|Title" or "9700 K".', ex: '=TEXTBEFORE("9700 K"," ") → "9700"', pit: 'Returns #N/A when the delimiter is missing; wrap in IFERROR.', fn: ['TEXTBEFORE', 'TEXTAFTER'] },
    { k: 'Wildcards in criteria', syntax: '"*text*" · "text*" · "*,*"', what: '* = any characters, ? = one character, inside COUNTIF(S)/SUMIF(S)/XLOOKUP.', ex: '=COUNTIFS(G:G,"*BROADWAY*")', pit: 'Without * the cell must match exactly.', fn: [], skills: ['wildcards', 'text search'] },
  ] },
  { group: 'Dates & time', tool: X, items: [
    { k: 'Date arithmetic', syntax: '=(End − Start)*24', what: 'Excel stores dates as days since 1900; the time is the decimal part.', ex: '=(D2-C2)*24 → duration in hours', pit: 'Forgetting ×24 gives days – the most common wrong answer on this site.', fn: ['INT'], skills: ['date arithmetic'] },
    { k: 'YEAR / MONTH / DATE', syntax: 'YEAR(date) · MONTH(date) · DATE(y, m, d)', what: 'Extract parts or build a date for a criterion.', ex: '=COUNTIFS(C:C,">="&DATE(2014,1,1),C:C,"<"&DATE(2015,1,1))', pit: 'Criteria with dates must be glued with &: ">="&DATE(…).', fn: ['YEAR', 'MONTH', 'DATE'], skills: ['dates'] },
    { k: 'WEEKDAY / TEXT', syntax: 'WEEKDAY(date, 2) · TEXT(date, "dddd")', what: 'Day of week as a number (Mon=1 with type 2) or a name.', ex: '=TEXT(C2,"dddd") → "Monday"', pit: 'Default WEEKDAY numbering starts on Sunday = 1.', fn: ['WEEKDAY', 'TEXT', 'MOD'] },
  ] },
  { group: 'Logic & errors', tool: X, items: [
    { k: 'IF / IFERROR', syntax: 'IF(test, then, else) · IFERROR(value, fallback)', what: 'Choose between results; replace errors with a value.', ex: '=IF(RIGHT(v)="K",1000,1000000)', pit: 'IFERROR hides every error – also the ones that signal a real mistake.', fn: ['IF', 'IFERROR'] },
    { k: 'ISNUMBER / ISNA / ISTEXT', syntax: 'ISNUMBER(x) · ISNA(x) · ISTEXT(x)', what: 'Test a value type – e.g. "is there a match?" or "is this a number stored as text?".', ex: '=ISNUMBER(SEARCH("broadway",G2))', pit: 'Numbers stored as text are a common ETL veracity issue.', fn: ['ISNUMBER', 'ISNA', 'ISTEXT', 'NOT'] },
  ] },
  { group: 'Summaries & PivotTables', tool: X, items: [
    { k: 'PivotTable', syntax: 'Insert ▸ PivotTable → Rows · Columns · Values · Filters', what: 'Summarise a table by category without formulas: counts, sums, averages, % of total.', ex: 'Rows = Borough, Filters = EventType = Shooting Permit, Values = Count of EventID', pit: 'Count counts non-empty cells; use a column that is never blank (an ID).', fn: [], skills: ['pivot / summary'] },
    { k: 'Control totals', syntax: '=SUM(Amount) · =ROWS(…) after each step', what: 'Reconcile totals and row counts before and after an ETL step.', ex: 'Journal entries: SUM(Amount) must be 0; 2015 + 2016 payroll must explain $266,055.56', pit: 'A total that changes after a join means rows were lost or duplicated.', fn: [], skills: ['control totals'] },
  ] },
  { group: 'Regression', tool: X, items: [
    { k: 'SLOPE / INTERCEPT / LINEST', syntax: 'SLOPE(y, x) · INTERCEPT(y, x) · LINEST(y, x)', what: 'Estimate a simple regression; LINEST returns slope and intercept (and more).', ex: '=SLOPE(daily_sales, tmax) → change in sales per °F', pit: 'Aggregate to the right level first (daily totals, not item rows).', fn: ['SLOPE', 'INTERCEPT', 'LINEST', 'CORREL'], skills: ['regression'], interp: true },
  ] },
  { group: 'SQL: the basics', tool: S, items: [
    { k: 'SELECT / WHERE', syntax: 'SELECT cols FROM t WHERE condition', what: 'Pick columns and filter rows.', ex: "SELECT name FROM songs WHERE energy > 0.6 AND valence > 0.6", pit: '"Greater than" is >, "at least" is >=.', sql: /\bWHERE\b/i },
    { k: 'ORDER BY / LIMIT', syntax: 'ORDER BY col DESC LIMIT n OFFSET m', what: 'Sort, then keep the top n.', ex: 'SELECT name FROM songs ORDER BY duration_ms DESC LIMIT 3', pit: 'Without DESC the order is ascending (smallest first).', sql: /\bORDER BY\b|\bLIMIT\b/i },
    { k: 'LIKE', syntax: "col LIKE 'text%'  ·  col LIKE '%text%'", what: '% = any characters, _ = one character.', ex: "SELECT title FROM movies WHERE title LIKE 'Toy Story%'", pit: "In SQLite LIKE ignores case, = does not ('Amazon.com' ≠ 'AMAZON.COM').", sql: /\bLIKE\b/i },
    { k: 'NULL & COUNT(col)', syntax: 'COUNT(*) vs COUNT(col) · col IS NULL', what: 'COUNT(*) counts rows; COUNT(col) skips NULLs.', ex: 'SELECT COUNT(Company) FROM Customer → 10', pit: '= NULL never matches – use IS NULL.', sql: /COUNT\((?!\*)/i },
    { k: 'BETWEEN / IN', syntax: 'col BETWEEN a AND b · col IN (x, y)', what: 'Ranges (inclusive) and lists.', ex: "WHERE Country IN ('Brazil','Argentina','Chile')", pit: 'BETWEEN includes both ends.', sql: /\bBETWEEN\b|\bIN \(/i },
  ] },
  { group: 'SQL: aggregation', tool: S, items: [
    { k: 'GROUP BY', syntax: 'SELECT key, SUM(x) FROM t GROUP BY key', what: 'One result row per group.', ex: 'SELECT BillingCountry, SUM(Total) FROM Invoice GROUP BY BillingCountry', pit: 'Group by an id, not a name – two people can share a name.', sql: /\bGROUP BY\b/i },
    { k: 'HAVING', syntax: 'GROUP BY key HAVING COUNT(*) > 10', what: 'Filters groups after aggregation (WHERE filters rows before).', ex: 'HAVING SUM(Amount) > 100000', pit: 'Returns are negative: SUM(Amount) > 1000 never finds refunds.', sql: /\bHAVING\b/i },
    { k: 'COUNT(DISTINCT …)', syntax: 'COUNT(DISTINCT col) · SELECT DISTINCT …', what: 'Count or list each value once.', ex: 'SELECT COUNT(DISTINCT person_id) FROM stars JOIN movies …', pit: 'Without DISTINCT, people in several movies are counted several times.', sql: /\bDISTINCT\b/i },
    { k: 'CASE WHEN', syntax: 'CASE WHEN cond THEN a ELSE b END', what: 'Conditional values – tiered rates, year-over-year columns.', ex: 'SUM(CASE WHEN Amount >= 500 THEN Amount*0.0075 ELSE Amount*0.005 END)', pit: 'Always add ELSE – otherwise unmatched rows become NULL.', sql: /\bCASE\b/i },
  ] },
  { group: 'SQL: joins & subqueries', tool: S, items: [
    { k: 'JOIN', syntax: 'FROM a JOIN b ON a.key = b.key', what: 'Combine tables on a key – the SQL version of XLOOKUP.', ex: 'FROM songs JOIN artists ON songs.artist_id = artists.id', pit: 'A join without ON pairs every row with every row (a cross join).', sql: /\bJOIN\b/i },
    { k: 'LEFT JOIN', syntax: 'FROM a LEFT JOIN b ON …', what: 'Keeps all rows of a, even without a match (NULLs).', ex: 'Movies without ratings stay in the result', pit: 'Use INNER JOIN when unmatched rows must be excluded.', sql: /\bLEFT JOIN\b/i },
    { k: 'Subqueries / IN (SELECT…)', syntax: 'WHERE id IN (SELECT …)', what: 'Use the result of one query inside another.', ex: "WHERE artist_id = (SELECT id FROM artists WHERE name = 'Drake')", pit: '= expects one value; use IN when the subquery can return several.', sql: /\(\s*SELECT\b/i },
    { k: 'Dates in SQLite', syntax: "strftime('%Y', d) · julianday(d2) - julianday(d1)", what: 'Extract parts of a date or compute day differences.', ex: "WHERE strftime('%w', BirthDate) = '0' → born on a Sunday", pit: "strftime returns TEXT: compare with '0', not 0.", sql: /strftime|julianday/i },
    { k: 'Text in SQLite', syntax: 'SUBSTR(s, start, n) · INSTR(s, find) · LENGTH(s)', what: 'Cut and search strings.', ex: "SUBSTR(Phone, INSTR(Phone, ') ') + 2)", pit: 'instr() is case-sensitive; LIKE is not.', sql: /\bSUBSTR\b|\bINSTR\b|\bLENGTH\b/i },
  ] },
];

const slug = (k) => k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function questionsFor(item) {
  const fnRe = item.fn?.length ? new RegExp(`\\b(${item.fn.map((f) => f.replace('.', '\\.')).join('|')})\\(`) : null;
  const list = QUESTIONS.filter((q) => {
    if (q.tool === 'excel' && fnRe && q.answers.some((a) => fnRe.test(a.formula))) return true;
    if (q.tool === 'sql' && item.sql && item.sql.test(q.ref)) return true;
    if (item.skills && q.skills.some((s) => item.skills.includes(s)) && (q.tool === 'excel') === !item.sql) return true;
    return false;
  });
  // easiest first, then not yet solved first
  return list.sort((a, b) => (a.level - b.level) || ((qState(a.id).status === 'correct') - (qState(b.id).status === 'correct')) || (a.secs - b.secs));
}

function card(item, tool) {
  const qs = questionsFor(item);
  const done = qs.filter((q) => qState(q.id).status === 'correct').length;
  return h('div.card.fn-card', { id: slug(item.k) },
    h('div.fn-head', {}, h('h3', {}, item.k), h('span.tag', { class: tool }, tool === 'excel' ? 'Excel' : 'SQL')),
    h('code.fn-syntax', {}, item.syntax),
    h('p', {}, item.what),
    h('div.fn-ex', {}, h('span.small.muted', {}, 'Example: '), h('code', {}, item.ex)),
    h('div.fn-pit', {}, h('b', {}, 'Watch out: '), item.pit),
    h('div.fn-practise', {},
      qs.length ? [h('span.small.muted', {}, `${qs.length} question${qs.length === 1 ? '' : 's'} to practise it · ${done} solved:`),
        ...qs.slice(0, 3).map((q) => h('a.btn.sm', { href: `#/q/${q.id}`, title: q.prompt }, statusDot(qState(q.id).status), ' ', caseById(q.case).title, ' · ', q.id)),
        qs.length > 3 ? h('a.btn.sm.ghost', { href: `#/formulas/${slug(item.k)}` }, `All ${qs.length} →`) : null]
        : item.interp ? h('a.btn.sm', { href: '#/interpretation' }, 'Practise regression interpretation →') : h('span.small.muted', {}, 'Used throughout – see the cases.'),
      item.interp && qs.length ? h('a.btn.sm.ghost', { href: '#/interpretation' }, 'Interpretation exams →') : null));
}

export function renderFormulas(main, key) {
  if (key) {
    const item = GUIDE.flatMap((g) => g.items.map((i) => ({ ...i, tool: g.tool }))).find((i) => slug(i.k) === key);
    if (item) {
      const qs = questionsFor(item);
      main.replaceChildren(h('div.page', {},
        h('div.crumbs', {}, h('a', { href: '#/formulas' }, 'Formulas'), '›', item.k),
        h('h1', {}, item.k), h('p', { style: { color: 'var(--ink-2)' } }, item.what), h('code.fn-syntax', {}, item.syntax),
        h('h2', { style: { margin: '24px 0 10px' } }, `${qs.length} questions to practise ${item.k}`),
        h('div.qlist', {}, qs.map((q) => h('a.qrow', { href: `#/q/${q.id}` }, statusDot(qState(q.id).status), h('span.qid', {}, q.id),
          h('div', {}, h('div.qp', {}, q.prompt), h('div.qs', {}, h('span.chip', {}, caseById(q.case).title))), h('span.meta', {}, levelDots(q.level)), h('span.meta.time', {}, q.secs >= 60 ? `${Math.round(q.secs / 30) / 2} min` : `${q.secs} s`))))));
      return;
    }
  }
  const search = h('input.fn-search', { type: 'search', placeholder: 'Search a function or keyword, e.g. XLOOKUP, dates, GROUP BY…' });
  const toc = h('div.fn-toc', {}, GUIDE.map((g) => h('a.chip', { href: `#/formulas`, onClick: (e) => { e.preventDefault(); document.getElementById(slug(g.group))?.scrollIntoView({ behavior: 'smooth' }); } }, g.group)));
  const body = h('div');
  const draw = () => {
    const t = search.value.trim().toLowerCase();
    body.replaceChildren(...GUIDE.map((g) => {
      const items = g.items.filter((i) => !t || [i.k, i.syntax, i.what, i.ex, i.pit, g.group].join(' ').toLowerCase().includes(t));
      if (!items.length) return null;
      return h('section.section', { id: slug(g.group) }, h('div.section-head', {}, h('h2', {}, g.group), h('span.tag', { class: g.tool }, g.tool === 'excel' ? 'Excel' : 'SQL')), h('div.fn-grid', {}, items.map((i) => card(i, g.tool))));
    }).filter(Boolean));
  };
  search.addEventListener('input', draw);
  draw();
  main.replaceChildren(h('div.page', {},
    h('h1', {}, 'Formulas & SQL – quick reference'),
    h('p', { style: { color: 'var(--ink-2)', maxWidth: '68ch' } }, 'What each function does, how to write it, an example from the course data and the mistake people make with it. The buttons open practice questions whose verified solution uses exactly that function.'),
    search, toc, body));
}
