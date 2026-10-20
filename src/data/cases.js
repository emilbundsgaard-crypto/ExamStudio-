// Course cases, in the order they are taught. Each maps to one workbook (Excel) or database (SQL).
export const CASES = [
  {
    id: 'film', tool: 'excel', wb: 'film', part: 'Excel part 1', title: 'NYC Film Permits',
    blurb: 'PwC-style data profiling of 33,502 film permits: counting, filtering, dates and text search.',
    source: 'PWC Excel assignment',
    files: [{ name: 'NYC_Film_Permits.xlsx', path: 'downloads/NYC_Film_Permits.xlsx' }, { name: 'NYC_Film_Permits.txt (raw CSV)', path: 'downloads/NYC_Film_Permits.txt' }],
  },
  {
    id: 'etl', tool: 'excel', wb: null, part: 'Excel part 2', title: 'ETL cases 1–4',
    blurb: 'Spot data problems, extract fields from codes, build unique keys and join journal entries.',
    source: 'Analytics mindset – ETL',
    files: [
      { name: 'Case 1 CSV', path: 'downloads/Analytics_mindset_case_studies_ETL_Case1.csv' },
      { name: 'Case 2 workbook', path: 'downloads/Analytics_mindset_case_studies_ETL_Case2_Excel.xlsx' },
      { name: 'Case 3 workbook', path: 'downloads/Analytics_mindset_case_studies_ETL_Case3_Excel.xlsx' },
      { name: 'Case 4 workbook', path: 'downloads/Analytics_mindset_case_studies_ETL_Case4_Excel.xlsx' },
    ],
  },
  {
    id: 'integrate', tool: 'excel', wb: 'integrate', part: 'Excel part 3', title: 'IntegrateCo payroll',
    blurb: 'Explain a $266k payroll increase across two accounting systems: job codes, joins and overtime tests.',
    source: 'Analytics mindset – IntegrateCo',
    files: [
      { name: '2015 payroll (pipe-delimited)', path: 'downloads/Analytics_mindset_case_studies_IntegrateCo_2015payroll.csv' },
      { name: '2016 payroll (pipe-delimited)', path: 'downloads/Analytics_mindset_case_studies_IntegrateCo_2016payroll.csv' },
      { name: 'Job codes', path: 'downloads/Analytics_mindset_case_studies_IntegrateCo_jobcodes.csv' },
      { name: 'Locations', path: 'downloads/Analytics_mindset_case_studies_IntegrateCo_locations.csv' },
    ],
  },
  {
    id: 'restaurant', tool: 'excel', wb: 'restaurant', part: 'Excel part 4', title: 'Restaurant regression',
    blurb: 'Merge sales, weather and game days, then run the regressions Bob asked for.',
    source: 'Restaurant regression case',
    files: [{ name: 'data.xlsm', path: 'downloads/data.xlsm' }],
  },
  {
    id: 'songs', tool: 'sql', db: 'songs', part: 'SQL part 1', title: 'Songs',
    blurb: 'SELECT, WHERE, ORDER BY, aggregates and your first JOIN.', source: 'CS50 songs', files: [{ name: 'songs.db', path: 'db:songs' }],
  },
  {
    id: 'movies', tool: 'sql', db: 'movies', part: 'SQL part 1', title: 'Movies',
    blurb: 'Joins across five tables, DISTINCT and subqueries on 1.2 million star credits.', source: 'CS50 movies', files: [{ name: 'movies.db (69 MB)', path: 'db:movies' }],
  },
  {
    id: 'chinook', tool: 'sql', db: 'chinook', part: 'SQL part 1', title: 'Chinook (PwC SQL)',
    blurb: 'A music store\'s invoices, customers and tracks – the PwC SQL questions and variants.', source: 'PWC SQL assignment', files: [{ name: 'Chinook_Sqlite.sqlite', path: 'db:chinook' }],
  },
  {
    id: 'pcards', tool: 'sql', db: 'pcards', part: 'SQL part 2', title: 'P-card audit',
    blurb: 'Internal-control tests and forensic queries on 489,178 university purchasing-card transactions.', source: 'Analytics mindset – P-card', files: [{ name: 'pcards.db (94 MB)', path: 'db:pcards' }],
  },
  {
    id: 'fiftyville', tool: 'sql', db: 'fiftyville', part: 'SQL part 1 (optional)', title: 'Fiftyville mystery',
    blurb: 'Optional: solve the theft of the CS50 duck with nothing but SELECT statements.', source: 'CS50 Fiftyville', files: [{ name: 'fiftyville.db', path: 'db:fiftyville' }], optional: true,
  },
];

export const WORKBOOK_TITLES = {
  film: 'NYC_Film_Permits.xlsx', etl1: 'ETL Case 1 (CSV opened in Excel)', etl2: 'ETL Case 2 workbook', etl3: 'ETL Case 3 workbook',
  etl4: 'ETL Case 4 workbook', integrate: 'IntegrateCo workbook (2015Data, 2016Data, JobCodes, P4 Location)', restaurant: 'data.xlsm',
};

export const DB_TITLES = { songs: 'songs.db', movies: 'movies.db', chinook: 'Chinook_Sqlite.sqlite', pcards: 'pcards.db', fiftyville: 'fiftyville.db' };

export const caseById = (id) => CASES.find((c) => c.id === id);
