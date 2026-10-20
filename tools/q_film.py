from qlib import excel, A, D
from common import df, todt
import datetime as dt
import pandas as pd

S = 'NYC_Film_Permits'
N = 33503  # last data row
C = {c: f'{S}!${c}$2:${c}${N}' for c in 'ABCDEFGHIJKLMN'}
CASE = 'film'
d = df('film', S)
d['start'] = d.StartDateTime.map(todt)
d['year'] = d.start.map(lambda x: x.year)
d['dur_h'] = (d.EndDateTime - d.StartDateTime) * 24
d['lead_d'] = d.StartDateTime - d.EnteredOn
d['wd'] = d.start.map(lambda x: x.strftime('%A'))
sp = d[d.EventType == 'Shooting Permit']
SPc = f'{C["B"]},"Shooting Permit"'
SRC = 'PWC Excel assignment'

# ---------------------------------------------------------------- original assignment (20)
excel('F01', CASE, 'film', 'How many records does the table have?',
      [A('Records', len(d), formula=f'=COUNTA({C["A"]})')], ['counting'],
      diag=[D(0, len(d) + 1, 'You counted the header row too. Records exclude the header.')],
      hint='COUNTA over one column, minus the header – or ROWS.', source=SRC + ' Q1', secs=30)
excel('F02', CASE, 'film', 'How many columns does the table have?',
      [A('Columns', 14, formula=f'=COUNTA({S}!A1:Z1)')], ['counting'], source=SRC + ' Q2', secs=30)
zip_na = int((d.ZipCode == 'N/A').sum())
excel('F03', CASE, 'film', 'How many records have a missing value for zip code? (Look carefully at how "missing" is recorded.)',
      [A('Missing zip codes', zip_na, formula=f'=COUNTIF({C["N"]},"N/A")+COUNTBLANK({C["N"]})')], ['data quality', 'COUNTIF'],
      diag=[D(0, 0, 'COUNTBLANK finds nothing here: missing zip codes are stored as the text "N/A", not as empty cells.')],
      explain='Missing values are written as the text N/A. A blank-count misses them – a classic ETL veracity issue.', source=SRC + ' Q3', secs=60)
z = d.ZipCode[d.ZipCode != 'N/A']
inv = int((~z.astype(str).str.fullmatch(r'\d{5}')).sum())
excel('F04', CASE, 'film', 'How many records have an invalid (non-missing) value for zip code? A valid US zip code has five digits.',
      [A('Invalid zip codes', inv, formula=f'=SUMPRODUCT(--ISNUMBER({C["N"]}),--(LEN({C["N"]})<>5))')], ['data quality', 'SUMPRODUCT', 'LEN'],
      diag=[D(0, inv + zip_na, 'You included the "N/A" records – those are missing, not invalid.')],
      hint='Numbers whose length is not 5.', source=SRC + ' Q4', secs=90)
excel('F05', CASE, 'film', 'Which column has the same value for each record? Provide the exact column name.',
      [A('Column name', 'EventAgency', formula=f'=INDEX({S}!A1:N1,MATCH(1,BYCOL({S}!A2:N{N},LAMBDA(c,ROWS(UNIQUE(c)))),0))')], ['data profiling', 'UNIQUE'],
      hint='Count distinct values per column, e.g. ROWS(UNIQUE(range)).', source=SRC + ' Q5', secs=60)
excel('F06', CASE, 'film', "What is the oldest 'EnteredOn' value? Provide the complete date/time.",
      [A('Oldest EnteredOn', float(d.EnteredOn.min()), kind='datetime', formula=f'=MIN({C["E"]})')], ['MIN', 'dates'], source=SRC + ' Q6', secs=45)
excel('F07', CASE, 'film', "What is the newest 'EnteredOn' value? Provide the complete date/time.",
      [A('Newest EnteredOn', float(d.EnteredOn.max()), kind='datetime', formula=f'=MAX({C["E"]})')], ['MAX', 'dates'], source=SRC + ' Q7', secs=45)
excel('F08', CASE, 'film', 'How many different event types are there?',
      [A('Event types', d.EventType.nunique(), formula=f'=ROWS(UNIQUE({C["B"]}))')], ['UNIQUE', 'counting'], source=SRC + ' Q8', secs=45)
vc = d.EventType.value_counts()
excel('F09', CASE, 'film', 'What is the most common event type, and how many records does it have?',
      [A('Event type', vc.index[0], formula=f'=INDEX(SORTBY(UNIQUE({C["B"]}),COUNTIF({C["B"]},UNIQUE({C["B"]})),-1),1)'),
       A('Records', int(vc.iloc[0]), formula=f'=MAX(COUNTIF({C["B"]},UNIQUE({C["B"]})))')],
      ['pivot / summary', 'COUNTIF', 'ranking'], source=SRC + ' Q9', secs=60,
      explain='From here on the assignment considers only Shooting Permits.')
cat = sp.Category.value_counts()
excel('F10', CASE, 'film', 'What is the most common category of shooting permit?',
      [A('Category', cat.index[0], formula=f'=INDEX(SORTBY(UNIQUE(FILTER({C["K"]},{C["B"]}="Shooting Permit")),COUNTIFS({C["K"]},UNIQUE(FILTER({C["K"]},{C["B"]}="Shooting Permit")),{SPc}),-1),1)')],
      ['pivot / summary', 'COUNTIFS'], diag=[D(0, d.Category.value_counts().index[0], 'That is the most common category across all event types – filter to Shooting Permit first.')],
      source=SRC + ' Q10', secs=60)
excel('F11', CASE, 'film', 'How many shooting permits have been granted for student films?',
      [A('Student film permits', int((sp.Category == 'Student').sum()), formula=f'=COUNTIFS({C["K"]},"Student",{SPc})')], ['COUNTIFS'],
      diag=[D(0, int((d.Category == 'Student').sum()), 'You counted student films across all event types, not only shooting permits.')],
      source=SRC + ' Q11', secs=45)
multi = sp['CommunityBoard(s)'].astype(str).str.contains(',')
excel('F12', CASE, 'film', 'What percentage of shooting permits required approval by more than one Community Board? (Several boards are listed with commas.)',
      [A('Share', float(multi.mean()), kind='pct', dp=4, formula=f'=COUNTIFS({C["I"]},"*,*",{SPc})/COUNTIFS({SPc})')], ['COUNTIFS', 'wildcards', 'percentages'],
      diag=[D(0, float(d['CommunityBoard(s)'].astype(str).str.contains(',').mean()), 'Your denominator or numerator includes all event types – restrict both to shooting permits.')],
      hint='Wildcard "*,*" finds text that contains a comma.', source=SRC + ' Q12', secs=90)
ct = pd.crosstab(sp.year, sp.Borough)
yr = int(ct[(ct.Brooklyn > ct.Manhattan) & (ct.index < 2018)].index[0])
excel('F13', CASE, 'film', 'In what (full) year did the total number of shoots in Brooklyn first outnumber shoots in Manhattan? Use the start date.',
      [A('Year', yr, formula=f'=MIN(FILTER(SEQUENCE(7,1,2012),COUNTIFS({C["H"]},"Brooklyn",{SPc},{C["C"]},">="&DATE(SEQUENCE(7,1,2012),1,1),{C["C"]},"<"&DATE(SEQUENCE(7,1,2013),1,1))>COUNTIFS({C["H"]},"Manhattan",{SPc},{C["C"]},">="&DATE(SEQUENCE(7,1,2012),1,1),{C["C"]},"<"&DATE(SEQUENCE(7,1,2013),1,1))))')],
      ['pivot / summary', 'dates', 'COUNTIFS'], hint='Pivot: rows = year of StartDateTime, columns = Borough.', source=SRC + ' Q13', secs=120, level=2)
man = sp[sp.Borough == 'Manhattan']
bw = float(man.ParkingHeld.str.upper().str.contains('BROADWAY').mean())
excel('F14', CASE, 'film', 'What percentage of shoots in Manhattan take place on or near Broadway (BROADWAY appears in ParkingHeld)? Give the exact share.',
      [A('Share', bw, kind='pct', dp=4, formula=f'=COUNTIFS({C["H"]},"Manhattan",{SPc},{C["G"]},"*BROADWAY*")/COUNTIFS({C["H"]},"Manhattan",{SPc})')],
      ['COUNTIFS', 'wildcards', 'text search'],
      diag=[D(0, float(man.ParkingHeld.str.upper().str.contains('BROADWAY').sum() / len(sp)), 'Your denominator is all shooting permits – it should be Manhattan shooting permits only.')],
      source=SRC + ' Q14', secs=90)
ent = sp.EnteredOn.map(todt)
fo = int(((sp.Country != 'United States of America') & (ent >= dt.datetime(2013, 1, 1))).sum())
excel('F15', CASE, 'film', 'How many shooting permit applications since 1 January 2013 (EnteredOn) have been submitted from a foreign country?',
      [A('Foreign applications', fo, formula=f'=COUNTIFS({C["M"]},"<>United States of America",{C["E"]},">="&DATE(2013,1,1),{SPc})')],
      ['COUNTIFS', 'dates'], diag=[D(0, int((sp.Country != 'United States of America').sum()), 'You did not apply the 2013 date condition.')],
      source=SRC + ' Q15', secs=90)
excel('F16', CASE, 'film', 'What is the average duration of a shooting permit, in hours?',
      [A('Average hours', float(sp.dur_h.mean()), dp=2, formula=f'=AVERAGE(FILTER(({C["D"]}-{C["C"]})*24,{C["B"]}="Shooting Permit"))')],
      ['date arithmetic', 'FILTER', 'AVERAGE'],
      diag=[D(0, float(sp.dur_h.mean() / 24), 'That is the duration in days. Excel stores date-times as days – multiply by 24 for hours.'),
            D(0, float(d.dur_h.mean()), 'You averaged all event types, not only shooting permits.')],
      hint='End − Start gives days; × 24 gives hours.', explain='The assignment asks to round to the nearest half hour: 17.', source=SRC + ' Q16', secs=90)
excel('F17', CASE, 'film', 'What was the duration of the shortest shoot, in minutes?',
      [A('Minutes', round(float(sp.dur_h.min() * 60), 6), dp=0, formula=f'=ROUND(MIN(FILTER(({C["D"]}-{C["C"]})*24*60,{C["B"]}="Shooting Permit")),6)')],
      ['date arithmetic', 'MIN'], source=SRC + ' Q17', secs=60)
excel('F18', CASE, 'film', 'What is the average lead time in days between entering the permit (EnteredOn) and the start of a shooting permit?',
      [A('Average lead time (days)', float(sp.lead_d.mean()), dp=2, formula=f'=AVERAGE(FILTER({C["C"]}-{C["E"]},{C["B"]}="Shooting Permit"))')],
      ['date arithmetic', 'FILTER'], diag=[D(0, float(-sp.lead_d.mean()), 'Sign flipped: lead time is Start − EnteredOn.')],
      explain='Rounded to the nearest day the assignment answer is 5.', source=SRC + ' Q18', secs=60)
wd = sp.wd.value_counts()
excel('F19', CASE, 'film', 'What is the most common day of the week for a shooting permit to start? Give the full day name.',
      [A('Day', wd.index[0], formula=f'=LET(x,TEXT(FILTER({C["C"]},{C["B"]}="Shooting Permit"),"dddd"),u,UNIQUE(x),INDEX(SORTBY(u,MAP(u,LAMBDA(d,SUM(--(x=d)))),-1),1))')],
      ['dates', 'TEXT', 'pivot / summary'], hint='Helper column =TEXT(StartDateTime,"dddd"), then a pivot or COUNTIF.', source=SRC + ' Q19', secs=90)


def has_friday(r):
    s = todt(r.StartDateTime).date(); e = todt(r.EndDateTime).date(); k = s
    while k <= e:
        if k.weekday() == 4:
            return True
        k += dt.timedelta(days=1)
    return False


fri = float(sp.apply(has_friday, axis=1).mean())
excel('F20', CASE, 'film', 'What percentage of shooting permits include shooting at least a partial day on a Friday?',
      [A('Share', fri, kind='pct', dp=4, formula=f'=SUMPRODUCT(({C["B"]}="Shooting Permit")*((INT({C["D"]})-INT({C["C"]}))>=MOD(6-WEEKDAY({C["C"]}),7)))/COUNTIFS({SPc})')],
      ['dates', 'WEEKDAY', 'SUMPRODUCT'], level=3, secs=180,
      diag=[D(0, float((sp.wd == 'Friday').mean()), 'You only counted permits that start on a Friday. A permit starting Thursday and ending Saturday also covers a Friday.')],
      hint='A permit covers a Friday if the number of days from its start to the next Friday ≤ its length in calendar days.', source=SRC + ' Q20')

# ---------------------------------------------------------------- variants per borough
boroughs = ['Brooklyn', 'Manhattan', 'Queens', 'Bronx', 'Staten Island']
streets = {'Brooklyn': 'BEDFORD', 'Manhattan': 'BROADWAY', 'Queens': 'QUEENS BOULEVARD', 'Bronx': 'GRAND CONCOURSE', 'Staten Island': 'RICHMOND'}
for i, b in enumerate(boroughs, start=1):
    bb = sp[sp.Borough == b]
    allb = d[d.Borough == b]
    Bc = f'{C["H"]},"{b}"'
    g = f'B{i}'
    excel(f'FB{i}1', CASE, 'film', f'How many shooting permits were issued in {b}, and how many other (non-shooting) permits are there in {b}?',
          [A('Shooting permits', len(bb), formula=f'=COUNTIFS({Bc},{SPc})'), A('Other permits', len(allb) - len(bb), formula=f'=COUNTIFS({Bc},{C["B"]},"<>Shooting Permit")')],
          ['COUNTIFS'], diag=[D(0, len(allb), f'That is every permit in {b}. Add the EventType condition.'), D(1, len(allb), 'That includes the shooting permits.')], group=g, secs=60)
    excel(f'FB{i}2', CASE, 'film', f'What is the average duration in hours of shooting permits in {b}?',
          [A('Average hours', float(bb.dur_h.mean()), dp=2, formula=f'=AVERAGE(FILTER(({C["D"]}-{C["C"]})*24,({C["H"]}="{b}")*({C["B"]}="Shooting Permit")))')],
          ['date arithmetic', 'FILTER'], diag=[D(0, float(bb.dur_h.mean() / 24), 'That is days, not hours (× 24).'), D(0, float(allb.dur_h.mean()), 'You included all event types.')],
          hint='AVERAGEIFS cannot average a calculation – use a helper column (End−Start)*24 or FILTER.', group=g, secs=90)
    st = streets[b]
    cnt = int(bb.ParkingHeld.str.upper().str.contains(st, regex=False).sum())
    excel(f'FB{i}3', CASE, 'film', f'How many shooting permits in {b} have {st} anywhere in ParkingHeld (ignore upper/lower case)?',
          [A('Permits', cnt, formula=f'=COUNTIFS({Bc},{SPc},{C["G"]},"*{st}*")')], ['COUNTIFS', 'wildcards', 'text search'],
          diag=[D(0, int((bb.ParkingHeld == st).sum()), f'Without wildcards COUNTIFS only matches cells that are exactly "{st}". Use "*{st}*".')], group=g, secs=60)
    cc = bb.Category.value_counts()
    excel(f'FB{i}4', CASE, 'film', f'Which Category has the most shooting permits in {b}, and how many?',
          [A('Category', cc.index[0], formula=f'=INDEX(SORTBY(UNIQUE({C["K"]}),COUNTIFS({C["K"]},UNIQUE({C["K"]}),{Bc},{SPc}),-1),1)'),
           A('Permits', int(cc.iloc[0]), formula=f'=MAX(COUNTIFS({C["K"]},UNIQUE({C["K"]}),{Bc},{SPc}))')],
          ['pivot / summary', 'COUNTIFS', 'ranking'], diag=[D(1, int(allb.Category.value_counts().iloc[0]), 'Your count includes non-shooting permits.')], group=g, secs=90)
    yc = bb.year.value_counts()
    excel(f'FB{i}5', CASE, 'film', f'In which year (by StartDateTime) were the most shooting permits issued in {b}, and how many?',
          [A('Year', int(yc.index[0]), formula=f'=INDEX(SORTBY(UNIQUE(YEAR({C["C"]})),COUNTIFS({Bc},{SPc},{C["C"]},">="&DATE(UNIQUE(YEAR({C["C"]})),1,1),{C["C"]},"<"&DATE(UNIQUE(YEAR({C["C"]}))+1,1,1)),-1),1)'),
           A('Permits', int(yc.iloc[0]), formula=f'=MAX(COUNTIFS({Bc},{SPc},{C["C"]},">="&DATE(UNIQUE(YEAR({C["C"]})),1,1),{C["C"]},"<"&DATE(UNIQUE(YEAR({C["C"]}))+1,1,1)))')],
          ['dates', 'pivot / summary'], hint='Helper column =YEAR(StartDateTime), then pivot or COUNTIFS.', group=g, secs=120, level=2)
    tv = float((bb.Category == 'Television').mean())
    excel(f'FB{i}6', CASE, 'film', f'What share of the shooting permits in {b} are in the Television category?',
          [A('Share', tv, kind='pct', dp=4, formula=f'=COUNTIFS({Bc},{SPc},{C["K"]},"Television")/COUNTIFS({Bc},{SPc})')], ['COUNTIFS', 'percentages'],
          diag=[D(0, float((bb.Category == 'Television').sum() / len(sp)), f'Denominator should be shooting permits in {b}, not all shooting permits.')], group=g, secs=60)
    top = bb.sort_values(['dur_h', 'EventID'], ascending=[False, True]).iloc[0]
    excel(f'FB{i}7', CASE, 'film', f'Which shooting permit in {b} lasted longest? Give its EventID and its duration in hours.',
          [A('EventID', int(top.EventID), formula=f'=INDEX(SORTBY(FILTER({C["A"]},({C["H"]}="{b}")*({C["B"]}="Shooting Permit")),FILTER({C["D"]}-{C["C"]},({C["H"]}="{b}")*({C["B"]}="Shooting Permit")),-1),1)'),
           A('Hours', float(top.dur_h), dp=2, formula=f'=MAX(FILTER(({C["D"]}-{C["C"]})*24,({C["H"]}="{b}")*({C["B"]}="Shooting Permit")))')],
          ['date arithmetic', 'sorting', 'lookup'], group=g, secs=120, level=2)
    gt24 = int((bb.dur_h > 24).sum())
    excel(f'FB{i}8', CASE, 'film', f'How many shooting permits in {b} lasted longer than 24 hours?',
          [A('Permits', gt24, formula=f'=SUMPRODUCT(({C["H"]}="{b}")*({C["B"]}="Shooting Permit")*(({C["D"]}-{C["C"]})*24>24))')],
          ['date arithmetic', 'SUMPRODUCT'], diag=[D(0, int((bb.dur_h >= 24).sum()), 'You included permits of exactly 24 hours – the question says longer than.')], group=g, secs=90)
    we = int(bb.wd.isin(['Saturday', 'Sunday']).sum())
    excel(f'FB{i}9', CASE, 'film', f'How many shooting permits in {b} started on a weekend (Saturday or Sunday)?',
          [A('Permits', we, formula=f'=SUMPRODUCT(({C["H"]}="{b}")*({C["B"]}="Shooting Permit")*(WEEKDAY({C["C"]},2)>5))')],
          ['dates', 'WEEKDAY', 'SUMPRODUCT'], diag=[D(0, int(bb.wd.isin(['Friday', 'Saturday']).sum()), 'WEEKDAY numbering: with return type 1 Sunday = 1 and Saturday = 7. Check which numbers you treated as the weekend.')],
          group=g, secs=90)

# ---------------------------------------------------------------- variants per year
for y in range(2012, 2018):
    yy = sp[sp.year == y]
    g = f'Y{y}'
    dfrom, dto = f'">="&DATE({y},1,1)', f'"<"&DATE({y + 1},1,1)'
    excel(f'F{y}A', CASE, 'film', f'How many shooting permits started in {y}?',
          [A('Permits', len(yy), formula=f'=COUNTIFS({SPc},{C["C"]},{dfrom},{C["C"]},{dto})')], ['dates', 'COUNTIFS'],
          diag=[D(0, int((d.year == y).sum()), 'You counted every event type that started that year.'),
                D(0, int((sp.EnteredOn.map(todt).map(lambda x: x.year) == y).sum()), 'You used EnteredOn instead of StartDateTime.')], group=g, secs=60)
    excel(f'F{y}B', CASE, 'film', f'What is the average lead time in days between EnteredOn and StartDateTime for shooting permits starting in {y}?',
          [A('Average lead time (days)', float(yy.lead_d.mean()), dp=2, formula=f'=AVERAGE(FILTER({C["C"]}-{C["E"]},({C["B"]}="Shooting Permit")*(YEAR({C["C"]})={y})))')],
          ['date arithmetic', 'FILTER'], group=g, secs=90)
    bc = yy.Borough.value_counts()
    excel(f'F{y}C', CASE, 'film', f'Which borough had the most shooting permits starting in {y}, and how many did the second-ranked borough have?',
          [A('Top borough', bc.index[0], formula=f'=INDEX(SORTBY(UNIQUE({C["H"]}),COUNTIFS({C["H"]},UNIQUE({C["H"]}),{SPc},{C["C"]},{dfrom},{C["C"]},{dto}),-1),1)'),
           A('Second borough permits', int(bc.iloc[1]), formula=f'=LARGE(COUNTIFS({C["H"]},UNIQUE({C["H"]}),{SPc},{C["C"]},{dfrom},{C["C"]},{dto}),2)')],
          ['pivot / summary', 'ranking'], group=g, secs=120, level=2)

# ---------------------------------------------------------------- whole-file extras
for et in ['Theater Load in and Load Outs', 'Rigging Permit', 'DCAS Prep/Shoot/Wrap Permit']:
    k = {'Theater Load in and Load Outs': 'TH', 'Rigging Permit': 'RG', 'DCAS Prep/Shoot/Wrap Permit': 'DC'}[et]
    e = d[d.EventType == et]
    excel(f'FX{k}', CASE, 'film', f'For "{et}" events: how many records are there, and what is their average duration in hours?',
          [A('Records', len(e), formula=f'=COUNTIF({C["B"]},"{et}")'),
           A('Average hours', float(e.dur_h.mean()), dp=2, formula=f'=AVERAGE(FILTER(({C["D"]}-{C["C"]})*24,{C["B"]}="{et}"))')],
          ['COUNTIF', 'date arithmetic'], group='X', secs=90)
sub = sp.SubCategoryName.nunique()
excel('FXSC', CASE, 'film', 'How many distinct SubCategoryName values occur among shooting permits?',
      [A('Distinct subcategories', sub, formula=f'=ROWS(UNIQUE(FILTER({C["L"]},{C["B"]}="Shooting Permit")))')], ['UNIQUE', 'FILTER'],
      diag=[D(0, d.SubCategoryName.nunique(), 'You counted subcategories across all event types.')], group='X', secs=60)
tvf = sp[sp.Category.isin(['Television', 'Film'])].groupby('Category').dur_h.mean()
excel('FXTF', CASE, 'film', 'How much longer (in hours) is the average Television shooting permit than the average Film shooting permit? (Television minus Film.)',
      [A('Difference in hours', float(tvf['Television'] - tvf['Film']), dp=2,
         formula=f'=AVERAGE(FILTER(({C["D"]}-{C["C"]})*24,({C["B"]}="Shooting Permit")*({C["K"]}="Television")))-AVERAGE(FILTER(({C["D"]}-{C["C"]})*24,({C["B"]}="Shooting Permit")*({C["K"]}="Film")))')],
      ['date arithmetic', 'FILTER'], group='X', secs=120, level=2)
pp = sp.groupby('PolicePrecinct(s)').size().sort_values(ascending=False)
excel('FXPP', CASE, 'film', 'Which PolicePrecinct(s) value appears most often among shooting permits, and how many times?',
      [A('PolicePrecinct(s)', pp.index[0], formula=f'=INDEX(SORTBY(UNIQUE({C["J"]}),COUNTIFS({C["J"]},UNIQUE({C["J"]}),{SPc}),-1),1)', kind='text' if isinstance(pp.index[0], str) else None),
       A('Permits', int(pp.iloc[0]), formula=f'=MAX(COUNTIFS({C["J"]},UNIQUE({C["J"]}),{SPc}))')],
      ['pivot / summary'], group='X', secs=90)
