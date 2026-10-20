from qlib import excel, A, D
from common import df, wb
import re
import pandas as pd

SRC = 'Analytics mindset – ETL case'

# ================================================================ Case 1: identifying data problems
raw = wb('etl1')['sheets'][0]['rows']
rows = raw[1:]
R = lambda c: f'Case1!{c}2:{c}{len(raw)}'
excel('E1-01', 'etl', 'etl1', 'Case 1 has one company name that contains a comma but no text qualifier, so the row was split into too many columns. How many rows are affected?',
      [A('Misaligned rows', sum(1 for r in rows if len(r) > 8), formula=f'=COUNTA({R("I")})')], ['data quality', 'delimiters'],
      hint='Rows with a value in column I have more fields than there are headers.', source=SRC + ' 1', secs=60,
      explain='"Apple, Inc." was written without double-quote qualifiers, so Excel split it at the comma and every value moved one column to the right.')
excel('E1-02', 'etl', 'etl1', 'How many rows are missing the Ticker (the unique identifier)?',
      [A('Rows without ticker', sum(1 for r in rows if r[0] is None), formula=f'=COUNTBLANK({R("A")})')], ['data quality', 'unique identifiers'], source=SRC + ' 1', secs=45)
uniq = len({tuple(r) for r in rows})
excel('E1-03', 'etl', 'etl1', 'How many rows are exact duplicates of an earlier row?',
      [A('Duplicate rows', len(rows) - uniq, formula=f'=ROWS(Case1!A2:H{len(raw)})-ROWS(UNIQUE(Case1!A2:H{len(raw)}))')], ['data quality', 'UNIQUE'], source=SRC + ' 1', secs=60)
sp = sum(1 for r in rows if isinstance(r[0], str) and ' ' in r[0])
excel('E1-04', 'etl', 'etl1', 'How many tickers contain one or more spaces (inconsistent coding of the same company)?',
      [A('Tickers with spaces', sp, formula=f'=SUMPRODUCT(--ISNUMBER(SEARCH(" ",{R("A")})))')], ['data quality', 'text functions'], source=SRC + ' 1', secs=60)
txt = sum(1 for r in rows if len(r) <= 8 and isinstance(r[3], str))
excel('E1-05', 'etl', 'etl1', 'Ignoring the misaligned Apple rows, how many Cash values are stored as text because they carry a unit suffix (K or M)?',
      [A('Text cash values', txt, formula=f'=SUMPRODUCT(--ISTEXT({R("D")}))')], ['data quality', 'data types'], source=SRC + ' 1', secs=60,
      diag=[D(0, txt + 3, 'Your count includes the Apple rows; their Cash value shifted into column E.')])


def to_usd(v):
    if isinstance(v, str):
        n, u = v.split()
        return float(n) * {'K': 1e3, 'M': 1e6}[u]
    return float(v)


apvo16 = to_usd(next(r for r in rows if r[0] == 'APVO' and r[2] == 2016)[3])
excel('E1-06', 'etl', 'etl1', 'Transform Cash to plain dollars (K = thousands, M = millions). What is Aptevo Therapeutics\' 2016 cash in dollars?',
      [A('Cash 2016 (USD)', apvo16, formula='=LET(v,INDEX(FILTER(Case1!D2:D23,(Case1!A2:A23="APVO")*(Case1!C2:C23=2016)),1),IF(ISNUMBER(v),v,VALUE(TEXTBEFORE(v," "))*IF(TEXTAFTER(v," ")="K",1000,1000000)))')],
      ['transformation', 'text functions'], diag=[D(0, 9700, 'You dropped the unit: 9700 K means 9,700 × 1,000.'), D(0, 9.7e9, 'K means thousands, not millions.')], source=SRC + ' 1', secs=90, level=2)
inv_bad = sum(1 for r in rows if len(r) <= 8 and (r[5] is None or (isinstance(r[5], str) and r[5].strip() in ('', '-'))))
excel('E1-07', 'etl', 'etl1', 'How many Inventories values are missing in some form – empty, only spaces, or a dash?',
      [A('Missing inventories', inv_bad, formula=f'=SUMPRODUCT(--((TRIM({R("F")}&"")="")+(TRIM({R("F")}&"")="-")>0))')], ['data quality', 'TRIM'],
      diag=[D(0, 1, 'COUNTBLANK only finds truly empty cells. Cells with a space or a dash also mean "missing".')], source=SRC + ' 1', secs=90, level=2)
amzn = sum(r[3] for r in rows if isinstance(r[0], str) and r[0].replace(' ', '') == 'AMZN')
excel('E1-08', 'etl', 'etl1', 'After standardising the ticker (remove spaces), what is Amazon\'s total cash across 2016–2018?',
      [A('Total cash (USD)', amzn, formula='=SUM(FILTER(Case1!D2:D23,SUBSTITUTE(Case1!A2:A23," ","")="AMZN"))')], ['transformation', 'SUBSTITUTE'],
      diag=[D(0, 19330000000, 'You only matched the clean "AMZN" row. Two rows are coded "A M Z N" and "AM ZN".')], source=SRC + ' 1', secs=90)

# ================================================================ Case 2: text extraction
e2 = df('etl2', 'Case 2')
n2 = len(e2) + 1
c2 = f"'Case 2'!$A$2:$A${n2}"
e2['loc'] = e2.EmployeeCode.str[:3]
e2['emp'] = e2.EmployeeCode.str[3:7].astype(int)
e2['plant'] = e2.EmployeeCode.str.extract(r'-(\d+)')[0]
e2['pay'] = e2.EmployeeCode.str[-1]
e2['lp'] = e2['loc'] + '-' + e2['plant']
LP2 = f'LEFT({c2},3)&"-"&MID({c2},FIND("-",{c2})+1,2)'
excel('E2-01', 'etl', 'etl2', 'Case 2: how many employees are paid weekly (pay period W)?',
      [A('Weekly employees', int((e2.pay == 'W').sum()), formula=f'=COUNTIF({c2},"*W")')], ['text functions', 'COUNTIF', 'wildcards'], source=SRC + ' 2', secs=45)
excel('E2-02', 'etl', 'etl2', 'Case 2: how many distinct LocationPlantID values (e.g. USA-12) are there?',
      [A('Distinct LocationPlantIDs', e2.lp.nunique(), formula=f'=ROWS(UNIQUE({LP2}))')], ['text functions', 'UNIQUE', 'unique identifiers'],
      diag=[D(0, e2.plant.nunique(), 'You counted PlantIDs only. Plant numbering restarts in each country, so the unique key is Location + PlantID.')],
      source=SRC + ' 2', secs=90, level=2, explain='This is exactly why the case asks for a combined key: PlantID alone is not unique across countries.')
for loc in ['JAP', 'GER', 'USA', 'MEX']:
    excel(f'E2-L{loc}', 'etl', 'etl2', f'Case 2: how many employees work in location {loc}, and how many of them are paid monthly?',
          [A('Employees', int((e2['loc'] == loc).sum()), formula=f'=COUNTIF({c2},"{loc}*")'),
           A('Monthly paid', int(((e2['loc'] == loc) & (e2.pay == 'M')).sum()), formula=f'=COUNTIFS({c2},"{loc}*",{c2},"*M")')],
          ['text functions', 'COUNTIFS', 'wildcards'], source=SRC + ' 2', secs=60, group='E2L')
top = e2.lp.value_counts()
excel('E2-03', 'etl', 'etl2', 'Case 2: which LocationPlantID has the most employees, and how many?',
      [A('LocationPlantID', top.index[0], formula=f'=LET(k,{LP2},u,UNIQUE(k),INDEX(SORTBY(u,MAP(u,LAMBDA(x,SUM(--(k=x)))),-1),1))'),
       A('Employees', int(top.iloc[0]), formula=f'=LET(k,{LP2},u,UNIQUE(k),MAX(MAP(u,LAMBDA(x,SUM(--(k=x))))))')],
      ['text functions', 'pivot / summary'], source=SRC + ' 2', secs=120, level=2)
r = e2.sort_values('emp').iloc[0]
excel('E2-04', 'etl', 'etl2', 'Case 2: what is the lowest EmpID, and what is that employee\'s LocationPlantID?',
      [A('Lowest EmpID', int(r.emp), formula=f'=MIN(--MID({c2},4,4))'),
       A('LocationPlantID', r.lp, formula=f'=LET(e,--MID({c2},4,4),k,{LP2},XLOOKUP(MIN(e),e,k))')],
      ['text functions', 'MID', 'lookup'], diag=[D(0, 1000, 'EmpIDs start at 1,000 by definition – compute the minimum of the extracted values.')], source=SRC + ' 2', secs=90)
excel('E2-05', 'etl', 'etl2', 'Case 2: what is the sum of all extracted EmpID values? (A control total that proves your MID formula worked on every row.)',
      [A('Sum of EmpIDs', int(e2.emp.sum()), formula=f'=SUMPRODUCT(--MID({c2},4,4))')], ['text functions', 'control totals'],
      diag=[D(0, 0, 'A sum of 0 means MID returned text. Wrap it in VALUE() or -- to convert text to numbers.')], source=SRC + ' 2', secs=60)

# ================================================================ Case 3: messy extraction
e3 = df('etl3', 'Case 3 data')
n3 = len(e3) + 1
c3 = f"'Case 3 data'!$A$2:$A${n3}"
m = e3.EmployeeCode.str.extract(r'^([A-Za-z]+)(\d+)-(\d+)([A-Za-z]+)$')
assert m.notna().all().all()
e3['loc'], e3['emp'], e3['plant'], e3['pay'] = m[0], m[1].astype(int), m[2].astype(int), m[3]
e3['pp'] = e3.pay.map({'W': 'Weekly', 'We': 'Weekly', 'M': 'Monthly', 'Mo': 'Monthly'})
e3['lp'] = e3['loc'] + '-' + e3.plant.astype(str)
LOC3 = f'MAP({c3},LAMBDA(x,LEFT(x,MIN(IFERROR(FIND({{0,1,2,3,4,5,6,7,8,9}},x),99))-1)))'
PL3 = f'MAP({c3},LAMBDA(x,--MID(x,FIND("-",x)+1,MIN(IFERROR(FIND({{"M","W"}},x,FIND("-",x)),99))-FIND("-",x)-1)))'
EMP3 = f'MAP({c3},LAMBDA(x,--MID(x,MIN(IFERROR(FIND({{0,1,2,3,4,5,6,7,8,9}},x),99)),FIND("-",x)-MIN(IFERROR(FIND({{0,1,2,3,4,5,6,7,8,9}},x),99)))))'
excel('E3-01', 'etl', 'etl3', 'Case 3: how many employees are paid weekly? (Weekly is recorded as W or We.)',
      [A('Weekly employees', int((e3.pp == 'Weekly').sum()), formula=f'=COUNTIF({c3},"*W")+COUNTIF({c3},"*We")')], ['text functions', 'COUNTIF', 'messy data'],
      diag=[D(0, int((e3.pay == 'W').sum()), 'You only counted codes ending in W. Weekly is also recorded as "We".')], source=SRC + ' 3', secs=60)
excel('E3-02', 'etl', 'etl3', 'Case 3: how many employees are paid monthly? (Monthly is recorded as M or Mo.)',
      [A('Monthly employees', int((e3.pp == 'Monthly').sum()), formula=f'=COUNTIF({c3},"*M")+COUNTIF({c3},"*Mo")')], ['text functions', 'COUNTIF', 'messy data'],
      diag=[D(0, int((e3.pay == 'M').sum()), 'You only counted codes ending in M. Monthly is also recorded as "Mo".')], source=SRC + ' 3', secs=60)
for loc in ['Canada', 'Japan', 'US', 'ARG']:
    sub = e3[e3['loc'] == loc]
    excel(f'E3-L{loc}', 'etl', 'etl3', f'Case 3: how many employees work in location "{loc}", and what is the highest PlantID used there?',
          [A('Employees', len(sub), formula=f'=SUM(--({LOC3}="{loc}"))'),
           A('Highest PlantID', int(sub.plant.max()), formula=f'=MAX(FILTER({PL3},{LOC3}="{loc}"))')],
          ['text functions', 'FIND', 'messy data'], diag=[D(0, int(e3.EmployeeCode.str.startswith(loc).sum()), f'Prefix matching "{loc}*" is unsafe here – check which other codes start with the same letters.')] if e3.EmployeeCode.str.startswith(loc).sum() != len(sub) else [],
          source=SRC + ' 3', secs=120, level=2, group='E3L')
excel('E3-03', 'etl', 'etl3', 'Case 3: how many distinct Location–PlantID combinations exist?',
      [A('Distinct combinations', e3.lp.nunique(), formula=f'=ROWS(UNIQUE({LOC3}&"-"&{PL3}))')], ['unique identifiers', 'text functions'],
      diag=[D(0, e3.plant.nunique(), 'That is the number of distinct PlantIDs; plants are numbered from 1 in every country.')], source=SRC + ' 3', secs=150, level=3)
excel('E3-04', 'etl', 'etl3', 'Case 3: control total – what is the sum of all extracted EmpIDs (numbers between the location code and the hyphen)?',
      [A('Sum of EmpIDs', int(e3.emp.sum()), formula=f'=SUM({EMP3})')], ['text functions', 'control totals'], source=SRC + ' 3', secs=150, level=3,
      diag=[D(0, sum(range(1, 598)), 'Close: EmpIDs are 1–597 but check that your extraction did not drop or duplicate any.')])

# ================================================================ Case 4: joining data
j = df('etl4', 'JELineItems')
coa = df('etl4', 'ChartOfAccounts')
bu = df('etl4', 'BusinessUnits')
pi = df('etl4', 'PreparerInfo')
src = df('etl4', 'Source')
nj = len(j) + 1
J = {c: f'JELineItems!${c}$2:${c}${nj}' for c in 'ABCDEFGHIJ'}
COA = {c: f'ChartOfAccounts!${c}$2:${c}${len(coa) + 1}' for c in 'ABCD'}
m = j.merge(coa, on='GLAccountNumber', how='left').merge(bu, on='BusinessUnitID', how='left').merge(src, on='SourceID', how='left')
pi['PName'] = pi.PreparerName.str.split('|').str[0].str.strip()
m = m.merge(pi[['PreparerID', 'BusinessUnitID', 'PName']], on=['PreparerID', 'BusinessUnitID'], how='left')
excel('E4-01', 'etl', 'etl4', 'Case 4 control total: what is the sum of the Amount column across all journal entry lines? What should it be?',
      [A('Sum of Amount', round(float(j.Amount.sum()), 2), dp=2, formula=f'=ROUND(SUM({J["J"]}),2)')], ['control totals'], source=SRC + ' 4', secs=30,
      explain='Debits equal credits in double-entry bookkeeping, so the signed amounts must sum to zero. A non-zero total after an ETL step means lines were lost or duplicated.')
excel('E4-02', 'etl', 'etl4', 'How many journal entries (distinct JENumber) are there, and how many lines?',
      [A('Journal entries', j.JENumber.nunique(), formula=f'=ROWS(UNIQUE({J["A"]}))'), A('Lines', len(j), formula=f'=ROWS({J["A"]})')], ['unique identifiers', 'UNIQUE'], source=SRC + ' 4', secs=45)
for t in ['Revenue', 'Expenses', 'Assets']:
    s = m[m.AccountType == t]
    excel(f'E4-T{t[:3]}', 'etl', 'etl4', f'Join JELineItems to ChartOfAccounts. What is the total debit amount posted to {t} accounts, and how many lines hit {t}?',
          [A('Total debits', round(float(s.Debit.fillna(0).sum()), 2), dp=2, formula=f'=SUMPRODUCT((XLOOKUP({J["B"]},{COA["B"]},{COA["C"]})="{t}")*{J["H"]})'),
           A('Lines', len(s), formula=f'=SUM(--(XLOOKUP({J["B"]},{COA["B"]},{COA["C"]})="{t}"))')],
          ['joins', 'XLOOKUP', 'INDEX/MATCH'], source=SRC + ' 4', secs=120, level=2, group='E4T')
for b in ['FOOD SERVICE', 'HOTEL', 'HOUSEKEEPING']:
    s = m[m.BusinessUnit == b]
    bid = int(bu[bu.BusinessUnit == b].BusinessUnitID.iloc[0])
    excel(f'E4-B{bid}', 'etl', 'etl4', f'How many journal-entry lines belong to business unit "{b}", and what is their total credit amount?',
          [A('Lines', len(s), formula=f'=SUM(--(XLOOKUP({J["C"]},BusinessUnits!$A$2:$A$9,BusinessUnits!$B$2:$B$9)="{b}"))'),
           A('Total credits', round(float(s.Credit.fillna(0).sum()), 2), dp=2, formula=f'=SUMPRODUCT((XLOOKUP({J["C"]},BusinessUnits!$A$2:$A$9,BusinessUnits!$B$2:$B$9)="{b}")*{J["I"]})')],
          ['joins', 'XLOOKUP'], source=SRC + ' 4', secs=90, group='E4B')
for name in ['Carolyn Slater', 'Elizabeth Rees', 'Victoria Simpson']:
    row = pi[pi.PName == name].iloc[0]
    s = m[m.PName == name]
    excel(f'E4-P{name.split()[0][:3]}', 'etl', 'etl4', f'PreparerID is only unique together with BusinessUnitID. How many lines did {name} prepare?',
          [A('Lines', len(s), formula=f'=COUNTIFS({J["D"]},{int(row.PreparerID)},{J["C"]},{int(row.BusinessUnitID)})')], ['joins', 'composite keys', 'COUNTIFS'],
          diag=[D(0, int((j.PreparerID == row.PreparerID).sum()), f'You matched on PreparerID only. ID {int(row.PreparerID)} is used in several business units – join on PreparerID and BusinessUnitID.')],
          hint='Look up the preparer in PreparerInfo first – you need both the ID and the business unit.', source=SRC + ' 4', secs=90, group='E4P')
sysl = m[m.PName.isin(['POS', 'GUESTSYS'])]
excel('E4-03', 'etl', 'etl4', 'How many lines were recorded by a subsystem (POS or GUESTSYS) rather than an employee?',
      [A('Subsystem lines', len(sysl), formula=f'=COUNTIFS({J["D"]},102,{J["C"]},3)+COUNTIFS({J["D"]},104,{J["C"]},2)')], ['joins', 'composite keys'], source=SRC + ' 4', secs=120, level=2)
cls = m.groupby('AccountClass').Debit.sum().sort_values(ascending=False)
excel('E4-04', 'etl', 'etl4', 'Which AccountClass received the largest total debits, and how much?',
      [A('AccountClass', cls.index[0], formula=f'=LET(c,XLOOKUP({J["B"]},{COA["B"]},{COA["D"]}),u,UNIQUE(c),INDEX(SORTBY(u,MAP(u,LAMBDA(x,SUMPRODUCT((c=x)*{J["H"]}))),-1),1))'),
       A('Total debits', round(float(cls.iloc[0]), 2), dp=2, formula=f'=LET(c,XLOOKUP({J["B"]},{COA["B"]},{COA["D"]}),u,UNIQUE(c),MAX(MAP(u,LAMBDA(x,SUMPRODUCT((c=x)*{J["H"]})))))')],
      ['joins', 'pivot / summary'], source=SRC + ' 4', secs=150, level=3)
pc = m[m.Source == 'PURCHASE CARD']
excel('E4-05', 'etl', 'etl4', 'What is the total debit amount of lines whose Source is PURCHASE CARD?',
      [A('Total debits', round(float(pc.Debit.fillna(0).sum()), 2), dp=2, formula=f'=SUMIFS({J["H"]},{J["E"]},XLOOKUP("PURCHASE CARD",Source!$B$2:$B$9,Source!$A$2:$A$9))')], ['joins', 'SUMIFS'], source=SRC + ' 4', secs=60)
