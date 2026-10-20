"""Export the course datasets into compact JSON workbooks the in-browser spreadsheet loads.
Dates become Excel serial numbers (1900 date system) so formulas behave exactly like desktop Excel."""
import openpyxl, csv, json, gzip, datetime as dt, re, os, shutil, sys
MAT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/mat'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
EPOCH = dt.datetime(1899, 12, 30)

def serial(d):
    if isinstance(d, dt.datetime): return round((d - EPOCH).total_seconds() / 86400, 10)
    if isinstance(d, dt.date): return (dt.datetime(d.year, d.month, d.day) - EPOCH).days
    return d

def excel_like(s):
    """Parse a CSV text field the way US-locale Excel does on open."""
    if s is None: return None
    if s == '': return None
    t = s.strip()
    if t == '': return s
    m = re.fullmatch(r'\((\d[\d,]*(\.\d+)?)\)', t)
    if m: return -float(m.group(1).replace(',', '')) if '.' in m.group(1) else -int(m.group(1).replace(',', ''))
    if re.fullmatch(r'-?\d{1,3}(,\d{3})+(\.\d+)?|-?\d+(\.\d+)?', t):
        v = t.replace(',', '')
        return float(v) if '.' in v else int(v)
    return s

def sheet_from_ws(ws, name=None, date_fmt='m/d/yyyy'):
    rows, datecols = [], {}
    for r in ws.iter_rows(values_only=True):
        row = []
        for j, v in enumerate(r):
            if isinstance(v, (dt.datetime, dt.date)):
                has_time = isinstance(v, dt.datetime) and (v.hour or v.minute or v.second)
                datecols.setdefault(j, 'm/d/yyyy h:mm' if has_time else date_fmt)
                if has_time: datecols[j] = 'm/d/yyyy h:mm'
                v = serial(v)
            if isinstance(v, str) and v == '': v = None
            row.append(v)
        while row and row[-1] is None: row.pop()
        rows.append(row)
    while rows and not any(x is not None for x in rows[-1]): rows.pop()
    return {'name': name or ws.title, 'rows': rows, 'dateCols': datecols}

def write(wid, title, sheets, source):
    os.makedirs(os.path.join(OUT, 'wb'), exist_ok=True)
    data = {'id': wid, 'title': title, 'source': source, 'sheets': sheets}
    raw = json.dumps(data, separators=(',', ':'), default=str).encode()
    with gzip.open(os.path.join(OUT, 'wb', wid + '.json.gz'), 'wb', 9) as f: f.write(raw)
    # plain JSON too, for the Python/Node verification scripts
    os.makedirs(os.path.join(OUT, '..', '..', 'tools', 'cache'), exist_ok=True)
    open(os.path.join(OUT, '..', '..', 'tools', 'cache', wid + '.json'), 'wb').write(raw)
    print(wid, [ (s['name'], len(s['rows'])) for s in sheets ], len(raw)//1024, 'KB')

def load(f, **kw): return openpyxl.load_workbook(os.path.join(MAT, f), read_only=True, data_only=True, **kw)

# 1. NYC film permits (PWC Excel assignment)
wb = load('NYC_Film_Permits.xlsx')
write('film', 'NYC Film Permits', [sheet_from_ws(wb.worksheets[0])], 'NYC_Film_Permits.xlsx')

# 2. ETL cases
rows = [[excel_like(x) for x in r] for r in csv.reader(open(os.path.join(MAT, 'Analytics_mindset_case_studies_ETL_Case1.csv'), encoding='utf-8-sig'))]
write('etl1', 'ETL Case 1 – Balance sheet data', [{'name': 'Case1', 'rows': rows, 'dateCols': {}}], 'Analytics_mindset_case_studies_ETL_Case1.csv')
for n, f in [(2, 'Analytics_mindset_case_studies_ETL_Case2_Excel.xlsx'), (3, 'Analytics_mindset_case_studies_ETL_Case3_Excel.xlsx')]:
    wb = load(f); write(f'etl{n}', f'ETL Case {n} – Employee codes', [sheet_from_ws(ws) for ws in wb.worksheets], f)
wb = load('Analytics_mindset_case_studies_ETL_Case4_Excel.xlsx')
write('etl4', 'ETL Case 4 – Journal entries', [sheet_from_ws(ws) for ws in wb.worksheets], 'Analytics_mindset_case_studies_ETL_Case4_Excel.xlsx')

# 3. IntegrateCo payroll – the four tabs the case asks students to build
s15 = sheet_from_ws(load('Analytics_mindset_case_studies_IntegrateCo_2015payroll.xlsx').worksheets[0], '2015Data')
s16 = sheet_from_ws(load('Analytics_mindset_case_studies_IntegrateCo_2016payroll.xlsx').worksheets[0], '2016Data')
jc = [r for r in csv.reader(open(os.path.join(MAT, 'Analytics_mindset_case_studies_IntegrateCo_jobcodes.csv'), encoding='utf-8-sig'), delimiter='|')]
loc = [[excel_like(x) for x in r] for r in csv.reader(open(os.path.join(MAT, 'Analytics_mindset_case_studies_IntegrateCo_locations.csv'), encoding='utf-8-sig'), delimiter='|')]
write('integrate', 'IntegrateCo payroll', [s15, s16, {'name': 'JobCodes', 'rows': jc, 'dateCols': {}, 'textCols': [0]}, {'name': 'P4 Location', 'rows': loc, 'dateCols': {}}],
      'IntegrateCo 2015/2016 payroll, job codes, locations')

# 4. Restaurant regression case
wb = load('data.xlsm', keep_vba=False)
write('restaurant', "Larry's Commissary (restaurant)", [sheet_from_ws(wb[n]) for n in ['salesData', 'weatherData', 'gameData', 'salesDataDictionary']], 'data.xlsm')
