# Exam Studio – Data Analytics in Accounting

Practice website for the oral exam in *Data Analytics in Accounting* (SDU). 278 data manipulation questions (Excel and SQL) and 8 data interpretation exams, built only from the course cases:

| Course part | Case | Tool | Questions |
|---|---|---|---|
| Excel part 1 | NYC Film Permits (PwC Excel assignment) | Excel | 89 |
| Excel part 2 | ETL cases 1–4 | Excel | 39 |
| Excel part 3 | IntegrateCo payroll | Excel | 26 |
| Excel part 4 | Restaurant regression | Excel | 8 |
| SQL part 1 | Songs, Movies (CS50), Chinook (PwC SQL), Fiftyville (optional) | SQL | 90 |
| SQL part 2 | P-card audit | SQL | 26 |
| Interpretation | Regressions estimated on the course datasets | – | 8 exams × 4 |

**Live site (with AI tutor):** https://clouterx.com/StudioExam/  ·  static mirror without tutor: https://emilbundsgaard-crypto.github.io/ExamStudio-/

## The added functionality: verified answers, in a built-in workbench

On the original site, only the regression questions have answers. The 400 Excel and SQL questions have none, just an AI tutor. Here every question can be solved in a **built-in spreadsheet** (Univer, Excel-compatible formulas) or a **SQL editor** (SQLite in the browser) running on the actual course files. You can also work in desktop Excel or DB Browser and type the answer. Either way, the answer is **checked against a value computed from the course data**, and typical mistakes are recognised and explained.

* **Excel questions** have one or more answer fields. Every expected value is computed in pandas, and every question has a reference formula. `tools/verify.mjs` evaluates each formula in the browser's own spreadsheet engine and compares it with pandas (270 fields).
* **SQL questions** are graded by **comparing result sets**, not SQL text. Any correct query passes. Row order is checked only when the question asks for a sort. Each reference query is run in SQLite (Python) and again in sql.js.
* **185 known wrong approaches** (e.g. hours vs. days, all event types instead of shooting permits, refunds included, case-sensitive `=` on vendor names, missing `DISTINCT`) are executed too. If a student's answer matches one, the site says what probably went wrong.
* The original answer keys (PwC Excel `solutions.xlsx`, PwC SQL answers) are asserted in the build. All 20 Excel answers and every SQL answer the key gives are reproduced.
* **Progress tracking** counts *verified correct* answers per case and per skill. It also tracks the first-try rate and the mistakes that were recognised, plus timed **mock exams** (3 Excel + 3 SQL, 8 minutes, graded at the end) and interpretation exams. Everything is stored locally in the browser.

Verifying the reference formulas found a real bug in the spreadsheet engine: `AVERAGE(FILTER(...))` returned the first value, and `COUNTIFS(range, UNIQUE(range))` returned a single count. `tools/patch-univer.mjs` fixes it at install time, so the engine behaves like Excel 365.

### Paragraph for the hand-in: why it is an improvement

> On the original site the 400 Excel and SQL questions have no answers – only the regression questions have "Show answer" – and the AI tutor only receives dataset metadata, so neither the student nor the tutor can tell whether a result is right. That is a problem because the typical errors in these cases are silent: forgetting ×24 makes the average Brooklyn shooting permit 0.64 instead of 15.27 hours, leaving refunds in turns 20,584 AMAZON purchases into 21,095, and an exact `=` match on "Amazon.com" in SQLite misses the transactions recorded as "AMAZON.COM". My site lets students solve every question in a built-in spreadsheet or SQL editor on the real course files and checks the answer against a value I computed from the data and then recomputed in the browser's own engines (386 checks, 0 failures; the PwC answer keys are reproduced). It recognises 185 typical wrong approaches with a one-line explanation, and it grades SQL by comparing result sets, so any correct query passes. Building the checker even exposed a bug in the open-source spreadsheet engine (AVERAGE of a FILTER result returned only the first value), which I patched – exactly the kind of error a student would never notice without a reference value. This matters because practice only improves learning when wrong answers are corrected (Hattie & Timperley, 2007; Roediger & Butler, 2011), and because it is what accountants do with any data transfer: reconcile to a control total before trusting the number.

### Paragraph for the hand-in: why the starting materials make this case harder

> Unlike the earlier cases, the starting material is not one dataset with a given ground truth but nine heterogeneous sources: .xlsx, an .xlsm with macros, comma- and pipe-delimited text files and five SQLite databases (the largest 94 MB, with 1.2 million star credits in movies.db), with the instructions spread over .docx and .pptx files. Most of the tasks come with no answer key at all, and the keys that exist are incomplete ("approximately 55.5 years", "256 tracks have been downloaded twice"), so the ground truth had to be produced and proved correct before any question could be checked. Many tasks are ambiguous in ways that change the number – which date defines "since 2013", whether "containing AMAZON" is case-sensitive, whether the longest last name refers to customers (12 characters) or employees (8, the key's answer) – and the ETL data is deliberately messy (an unquoted comma in "Apple, Inc.", "N/A" stored as text instead of blanks, "We"/"Mo" pay codes). Finally, the files are far too large to paste into an AI model, so the AI cannot simply read off the answers; every value had to be computed in code and cross-checked between two engines.

## AI tutor (Gemini)

Every practice question has an AI tutor. It gets the question, the dataset's columns, the student's formula or query, their result, the checker's feedback **and the verified answer**, so it can point at the actual mistake without inventing numbers. It is told not to reveal the final answer until the student has solved the question or viewed the solution.

* `server/api/ask.php` is a small PHP proxy. The Gemini key stays on the server in `api/.env` and is never sent to the browser. It also applies per-IP and per-day limits.
* The browser retries a failed Gemini call **up to 20 times, 10 seconds apart**, and shows a countdown. Retries happen in the browser, so the host's PHP time limit is never hit. A wrong key or model name is not retried, because retrying cannot fix it.

## Deploy to a PHP web host (Simply.com)

```bash
./tools/package-upload.sh      # -> upload/StudioExam/ (static site + api/ + .htaccess)
```

1. Upload the **contents** of `upload/StudioExam/` to `public_html/StudioExam/`. Hidden files must be included: `.htaccess`, `api/.htaccess` and `api/.env`.
2. Put your key in `api/.env` (`GEMINI_API_KEY=…`) and check `GEMINI_MODEL`.
3. Check that `https://<domain>/StudioExam/api/ask.php` shows `"configured":true` and that `https://<domain>/StudioExam/api/.env` gives 403 Forbidden.

## Run locally

```bash
npm install          # also applies tools/patch-univer.mjs
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
```

Rebuilding the question bank from the course files (Python 3 with pandas, numpy, scipy, openpyxl):

```bash
python3 tools/export_data.py /path/to/materials   # workbooks -> public/data/wb
python3 tools/build_questions.py                  # -> src/data/questions.json
python3 tools/build_interp.py                     # -> src/data/interp.json
node tools/verify.mjs                             # every answer re-checked in Univer and sql.js
```

## Structure

* `tools/q_*.py` – question definitions: prompt, expected answers (pandas/SQLite), reference formula or query, known mistakes
* `tools/verify.mjs` – runs every reference formula in Univer (headless Chromium) and every query in sql.js
* `src/check.js` – answer and result-set comparison, diagnostics
* `src/excel/` – the built-in spreadsheet; `src/sql/` – SQLite in a Web Worker
* `src/pages/` – practice, case, question, mock exam, interpretation, progress pages

## Sources

Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research, 77*(1), 81–112.
Roediger, H. L., & Butler, A. C. (2011). The critical role of retrieval practice in long-term retention. *Trends in Cognitive Sciences, 15*(1), 20–27.
