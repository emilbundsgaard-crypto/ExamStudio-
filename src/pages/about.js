import { h } from '../ui.js';
import { QUESTIONS, INTERP } from '../data/index.js';

export function renderAbout(main) {
  const nx = QUESTIONS.filter((q) => q.tool === 'excel');
  const nf = nx.reduce((a, q) => a + q.answers.length, 0);
  const ns = QUESTIONS.length - nx.length;
  const nd = QUESTIONS.reduce((a, q) => a + (q.diag?.length || 0) + (q.variants?.length || 0), 0);
  main.replaceChildren(h('div.page', {}, h('div.prose', {},
    h('h1', {}, 'How answers are verified'),
    h('p', {}, `Exam Studio contains ${QUESTIONS.length} data manipulation questions and ${INTERP.length} data interpretation exams, all built only from the course cases. The point is simple: when you practise, you should find out whether your number is right.`),
    h('div.callout', {}, h('b', {}, 'Every answer is computed from the actual course files, twice. '),
      `For the ${nx.length} Excel questions, the expected values (${nf} answer fields) were computed in Python/pandas and each has a reference formula that was evaluated in both spreadsheet engines this site uses (GridCraft and Univer); all must agree. For the ${ns} SQL questions, the reference query was run in SQLite and again in sql.js (the in-browser engine). The original assignment answer keys (PwC Excel solutions, PwC SQL answers) were used as an extra check.`),
    h('h2', { style: { marginTop: '28px' } }, 'Recognised mistakes'),
    h('p', {}, `${nd} typical wrong approaches were run against the data as well – for example counting all event types instead of shooting permits, using days instead of hours, forgetting refunds in the P-card data, or matching a vendor name case-sensitively. If your wrong answer equals one of them, you are told what probably went wrong.`),
    h('h2', { style: { marginTop: '28px' } }, 'SQL: results, not syntax'),
    h('p', {}, 'Your query is not compared with a model query. The site runs both and compares the results: same rows (in any order unless the question asks for a sort), same values (numbers to two decimals). Extra columns are tolerated in practice mode. Any correct query passes.'),
    h('h2', { style: { marginTop: '28px' } }, 'The spreadsheet'),
    h('p', {}, 'The built-in spreadsheet is GridCraft, an open-source Excel-style spreadsheet (MIT/Apache-2.0): ribbon, PivotTables with a field list, fill handle, Ctrl/Cmd + arrow shortcuts, dynamic arrays (FILTER, UNIQUE, SORTBY, LET, LAMBDA) and 500+ functions. Before using it, every reference formula of the question bank was run through GridCraft\'s engine: all 270 gave the verified answer.'),
    h('p', {}, 'Browsers without WebGL2 get a basic spreadsheet instead (Univer). Verifying it exposed a bug – AVERAGE(FILTER(…)) returned only the first value – which this site patches; it has no PivotTables. Dates follow US format (month/day/year). If something looks wrong, download the original file and confirm in desktop Excel – your answer is checked the same way.'),
    h('h2', { style: { marginTop: '28px' } }, 'Interpretation exams'),
    h('p', {}, 'The regression output in each interpretation exam was estimated (OLS) on a course dataset: the restaurant sales data, IntegrateCo payroll, NYC film permits, songs, movies, P-cards and Chinook. Predictions, slopes, interaction effects and significance decisions are checked automatically; the model answer shows how to say it in the oral exam.'),
    h('h2', { style: { marginTop: '28px' } }, 'Privacy'),
    h('p', {}, 'Everything runs in your browser. Databases and workbooks are downloaded once and queried locally; progress is stored in this browser only (Progress → Download / Reset). No accounts, no tracking.'))));
}
