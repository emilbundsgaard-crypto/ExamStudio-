from qlib import excel, A, D
from common import df, todt
import re
import pandas as pd

SRC = 'Analytics mindset – IntegrateCo'
p = df('integrate', '2015Data')
q = df('integrate', '2016Data')
jc = df('integrate', 'JobCodes')
loc = df('integrate', 'P4 Location')
n15, n16 = len(p) + 1, len(q) + 1
P = {c: f"'2015Data'!${c}$2:${c}${n15}" for c in 'ABCDEFGHIJKLMNOP'}
Q = {c: f"'2016Data'!${c}$2:${c}${n16}" for c in 'ABCDEFGHIJK'}


def code(x):
    m = re.match(r'^\d\d[HS]?(\d{3})', str(x))
    return m.group(1) if m else None


p['jc'] = p.Job.map(code)
q['jc'] = q.Project.map(code)
p['gross'] = p.Reg_Pay + p.OT_Pay
p['hrs'] = p.Reg_Hrs + p.OT_Hrs
q['hrs'] = q.Hours + q.OT_Hours
p['name'] = p.First_Name + ' ' + p.Last_Name
p['month'] = p.Pay_Date.map(lambda x: todt(x).month)
JC15 = f'MAP({P["H"]},LAMBDA(x,MID(x,IF(ISNUMBER(--MID(x,3,1)),3,4),3)))'
JC16 = f'MAP({Q["A"]},LAMBDA(x,MID(x,IF(ISNUMBER(--MID(x,3,1)),3,4),3)))'

g15, g16 = p.gross.sum(), q.Gross_Wages.sum()
excel('I-01', 'integrate', 'integrate', 'The CFO says payroll for the first six months of 2016 was about $266,000 higher than in 2015. Compute gross pay for each year and the difference (2016 − 2015).',
      [A('2015 gross pay', round(g15, 2), dp=2, formula=f'=SUM({P["K"]})+SUM({P["L"]})'),
       A('2016 gross pay', round(g16, 2), dp=2, formula=f'=SUM({Q["G"]})'),
       A('Difference', round(g16 - g15, 2), dp=2, formula=f'=SUM({Q["G"]})-SUM({P["K"]})-SUM({P["L"]})')],
      ['control totals', 'SUM'], diag=[D(0, round(p.Reg_Pay.sum(), 2), '2015 has no Gross column: gross pay = Reg_Pay + OT_Pay.'),
                                         D(2, round(g16 - p.Reg_Pay.sum(), 2), 'Your 2015 figure excludes overtime pay.')],
      explain='Reconciling to the CFO\'s figure first proves your data load is complete before you start explaining the difference.', source=SRC + ' Part 2/3', secs=90)
excel('I-02', 'integrate', 'integrate', 'Job codes are embedded in Job (2015) and Project (2016), e.g. 15S002 → 002. How many 2015 rows carry a job code outside the valid range 001–012?',
      [A('Invalid rows', int((~p.jc.isin(jc.Job_Code)).sum()), formula=f'=SUM(--ISNA(XMATCH({JC15},JobCodes!$A$2:$A$13)))'),
       A('The invalid code', sorted(set(p.jc) - set(jc.Job_Code))[0], formula=f'=INDEX(FILTER({JC15},ISNA(XMATCH({JC15},JobCodes!$A$2:$A$13))),1)')],
      ['text functions', 'data quality', 'lookup'], hint='Year = first two digits; an optional H or S follows; then three digits of job code.', source=SRC + ' Part 1', secs=150, level=3)

for code_ in jc.Job_Code:
    a, b = p[p.jc == code_], q[q.jc == code_]
    desc = jc.set_index('Job_Code').Job_Description[code_]
    excel(f'I-J{code_}', 'integrate', 'integrate', f'Job code {code_} ({desc}): total hours (regular + overtime) and gross pay in 2015 and in 2016.',
          [A('2015 hours', round(float(a.hrs.sum()), 2), dp=2, formula=f'=LET(k,{JC15},SUM(FILTER({P["I"]}+{P["J"]},k="{code_}",0)))'),
           A('2015 gross pay', round(float(a.gross.sum()), 2), dp=2, formula=f'=LET(k,{JC15},SUM(FILTER({P["K"]}+{P["L"]},k="{code_}",0)))'),
           A('2016 hours', round(float(b.hrs.sum()), 2), dp=2, formula=f'=LET(k,{JC16},SUM(FILTER({Q["E"]}+{Q["F"]},k="{code_}",0)))'),
           A('2016 gross pay', round(float(b.Gross_Wages.sum()), 2), dp=2, formula=f'=LET(k,{JC16},SUM(FILTER({Q["G"]},k="{code_}",0)))')],
          ['text functions', 'pivot / summary', 'year-over-year'],
          diag=[D(0, round(float(a.Reg_Hrs.sum()), 2), 'You used regular hours only – add OT_Hrs.'), D(1, round(float(a.Reg_Pay.sum()), 2), 'Gross pay 2015 = Reg_Pay + OT_Pay.'),
                D(2, round(float(b.Hours.sum()), 2), 'You used Hours only – add OT_Hours.')],
          source=SRC + ' Part 3 Q1', secs=180, level=2, group='IJ')

ot = p[p.OT_Hrs > 0].groupby(['Emp_No', 'name']).agg(h=('OT_Hrs', 'sum'), pay=('OT_Pay', 'sum')).reset_index().sort_values('pay', ascending=False)
t = ot.iloc[0]
excel('I-03', 'integrate', 'integrate', 'Which employee earned the most overtime pay in the first six months of 2015? Give the name, overtime hours and overtime pay.',
      [A('Employee', t['name'], formula=f'=LET(n,{P["F"]}&" "&{P["G"]},u,UNIQUE(n),INDEX(SORTBY(u,SUMIFS({P["L"]},{P["F"]},TEXTBEFORE(u," "),{P["G"]},TEXTAFTER(u," ")),-1),1))'),
       A('Overtime hours', float(t.h), formula=f'=SUMIFS({P["J"]},{P["C"]},{int(t.Emp_No)})'),
       A('Overtime pay', round(float(t.pay), 2), dp=2, formula=f'=SUMIFS({P["L"]},{P["C"]},{int(t.Emp_No)})')],
      ['pivot / summary', 'SUMIFS', 'ranking'], source=SRC + ' Part 4 Q1', secs=120, level=2)
oj = p[p.jc.isin(jc.Job_Code)].groupby('jc').OT_Pay.sum().sort_values(ascending=False)
excel('I-04', 'integrate', 'integrate', 'Which job code had the most overtime pay in 2015, and how much? (Only job codes in the JobCodes table.)',
      [A('Job code', oj.index[0], formula=f'=LET(k,{JC15},INDEX(SORTBY(JobCodes!$A$2:$A$13,MAP(JobCodes!$A$2:$A$13,LAMBDA(c,SUM(FILTER({P["L"]},k=c,0)))),-1),1))'),
       A('Overtime pay', round(float(oj.iloc[0]), 2), dp=2, formula=f'=LET(k,{JC15},MAX(MAP(JobCodes!$A$2:$A$13,LAMBDA(c,SUM(FILTER({P["L"]},k=c,0))))))')],
      ['text functions', 'pivot / summary'], source=SRC + ' Part 4 Q2', secs=150, level=3)
ph = q[q.Employee_Number.isna()]
excel('I-05', 'integrate', 'integrate', 'The new 2016 system has errors. How many 2016 transactions have no employee number, and what is their total gross wage amount ("phantom" entries)?',
      [A('Transactions', len(ph), formula=f'=COUNTBLANK({Q["C"]})'), A('Gross wages', round(float(ph.Gross_Wages.sum()), 2), dp=2, formula=f'=SUMIFS({Q["G"]},{Q["C"]},"")')],
      ['data quality', 'COUNTBLANK', 'SUMIFS'], source=SRC + ' Part 4 Q3', secs=60)
pd_ = p.groupby(['name', 'Pay_Date']).agg(r=('Reg_Hrs', 'sum'), o=('OT_Hrs', 'sum')).reset_index()
bad = pd_[(pd_.r < 40) & (pd_.o > 0)]
excel('I-06', 'integrate', 'integrate', 'In 2015, how many employee/pay-date combinations show overtime even though fewer than 40 regular hours were worked on that pay date?',
      [A('Combinations', len(bad), formula=f'=LET(k,{P["F"]}&" "&{P["G"]}&"|"&{P["A"]},u,UNIQUE(k),SUM(MAP(u,LAMBDA(x,(SUM(FILTER({P["I"]},k=x))<40)*(SUM(FILTER({P["J"]},k=x))>0)))))')],
      ['pivot / summary', 'internal control'], diag=[D(0, int(((p.Reg_Hrs < 40) & (p.OT_Hrs > 0)).sum()), 'You tested individual rows. Rows are per job code – sum hours per employee and pay date first.')],
      source=SRC + ' Part 4 Q4', secs=240, level=3)
cost = q[['Gross_Wages', 'SocSec_Medicare', 'FUTA', 'SUTA', 'Work_Comp']].sum().sum()
excel('I-07', 'integrate', 'integrate', 'What was the total employee cost for all projects in 2016 (wages + Social Security/Medicare + FUTA + SUTA + workers\' compensation)?',
      [A('Total employee cost', round(float(cost), 2), dp=2, formula=f"=SUM('2016Data'!$G$2:$K${n16})")], ['SUM'],
      diag=[D(0, round(float(g16), 2), 'That is wages only – add the employer taxes and workers\' compensation.')], source=SRC + ' Part 4 Q5', secs=45)
L = loc.set_index('Employee_Name').Location
p['loc'] = p.name.map(L)
q['loc'] = q.Employee_Name.map(L)
for yr, dfy, H, W, NM in [(2015, p, f'{P["I"]}+{P["J"]}', f'{P["K"]}+{P["L"]}', f'{P["F"]}&" "&{P["G"]}'), (2016, q[q.Employee_Number.notna()], f'{Q["E"]}+{Q["F"]}', Q["G"], Q["D"])]:
    wcol = dfy.gross if yr == 2015 else dfy.Gross_Wages
    ans = []
    for lv in (1, 2):
        mask = dfy['loc'] == lv
        ans.append(A(f'Location {lv} hours', round(float(dfy[mask].hrs.sum()), 2), dp=2, formula=f"=LET(l,XLOOKUP({NM},'P4 Location'!$A$2:$A$103,'P4 Location'!$B$2:$B$103,0),SUM(FILTER({H},l={lv},0)))"))
        ans.append(A(f'Location {lv} gross wages', round(float(wcol[mask].sum()), 2), dp=2, formula=f"=LET(l,XLOOKUP({NM},'P4 Location'!$A$2:$A$103,'P4 Location'!$B$2:$B$103,0),SUM(FILTER({W},l={lv},0)))"))
    excel(f'I-L{yr}', 'integrate', 'integrate', f'Join the location file to the {yr} data on employee name. Report total hours (regular + overtime) and gross wages for location 1 and location 2 in {yr}' + (' (exclude phantom entries).' if yr == 2016 else '.'),
          ans, ['joins', 'XLOOKUP', 'pivot / summary'], source=SRC + ' Part 4 Q6', secs=180, level=3, group='IL')
mo = p.groupby('month').gross.sum()
avg = mo.mean()
excel('I-08', 'integrate', 'integrate', 'For 2015, which month had the highest gross wages, and by how much did it exceed the average month (January–June)?',
      [A('Month number', int(mo.idxmax()), formula=f'=LET(m,MONTH({P["A"]}),s,MAP(SEQUENCE(6),LAMBDA(i,SUM(FILTER({P["K"]}+{P["L"]},m=i,0)))),XMATCH(MAX(s),s))'),
       A('Above average by', float(mo.max() - avg), dp=2, formula=f'=LET(m,MONTH({P["A"]}),s,MAP(SEQUENCE(6),LAMBDA(i,SUM(FILTER({P["K"]}+{P["L"]},m=i,0)))),MAX(s)-AVERAGE(s))')],
      ['dates', 'pivot / summary'], source=SRC + ' Part 4 Q8', secs=180, level=2)
share = mo / mo.sum()
excel('I-09', 'integrate', 'integrate', 'Estimate 2016 gross wages for March: apply March\'s share of 2015 (Jan–Jun) gross wages to the 2016 total gross wages.',
      [A('Estimated March 2016', float(share[3] * g16), dp=2, formula=f'=SUM(FILTER({P["K"]}+{P["L"]},MONTH({P["A"]})=3))/(SUM({P["K"]})+SUM({P["L"]}))*SUM({Q["G"]})')],
      ['dates', 'forecasting'], source=SRC + ' Part 4 Q10', secs=120, level=2)
excel('I-10', 'integrate', 'integrate', 'How many distinct employees (by employee number) were paid in 2015 and in 2016?',
      [A('2015 employees', p.Emp_No.nunique(), formula=f'=ROWS(UNIQUE({P["C"]}))'), A('2016 employees', q.Employee_Number.dropna().nunique(), formula=f'=ROWS(UNIQUE(FILTER({Q["C"]},{Q["C"]}<>"")))')],
      ['unique identifiers', 'UNIQUE'], diag=[D(1, q.Employee_Number.dropna().nunique() + 1, 'UNIQUE counted the blank employee number as one more "employee". Filter out blanks first.')], source=SRC + ' Part 3', secs=60)
gr = q[q.jc.isin([f'{i:03d}' for i in range(1, 9)])].groupby('jc').Gross_Wages.sum() / p[p.jc.isin([f'{i:03d}' for i in range(1, 9)])].groupby('jc').gross.sum()
for c_ in ['002', '005']:
    pred = q[q.jc == c_].Gross_Wages.sum() * gr[c_]
    excel(f'I-P{c_}', 'integrate', 'integrate', f'Predict first-half 2017 gross wages for job code {c_}, assuming the 2015→2016 growth rate repeats: 2017 = 2016 × (2016 ÷ 2015).',
          [A('Growth 2015→2016', float(gr[c_] - 1), kind='pct', dp=4, formula=f'=LET(a,{JC15},b,{JC16},SUM(FILTER({Q["G"]},b="{c_}"))/SUM(FILTER({P["K"]}+{P["L"]},a="{c_}"))-1)'),
           A('Predicted 2017', float(pred), dp=2, formula=f'=LET(a,{JC15},b,{JC16},SUM(FILTER({Q["G"]},b="{c_}"))^2/SUM(FILTER({P["K"]}+{P["L"]},a="{c_}")))')],
          ['forecasting', 'text functions'], source=SRC + ' Part 4 Q9', secs=150, level=2, group='IP')
