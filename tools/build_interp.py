"""Data-interpretation exams built from regressions estimated on the course's own datasets.
Each exam = one context with four questions (predict, slope, quadratic term, interaction),
mirroring the structure of the oral exam's data-interpretation part. Numeric parts are auto-checked."""
import json, os, sys, re, sqlite3
import numpy as np
import pandas as pd
from scipy import stats
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import df, todt
from qlib import MAT


def ols(y, cols, names):
    y = np.asarray(y, float)
    X = np.column_stack([np.ones(len(y))] + [np.asarray(c, float) for c in cols])
    b = np.linalg.lstsq(X, y, rcond=None)[0]
    e = y - X @ b
    n, k = X.shape
    s2 = e @ e / (n - k)
    se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X)))
    t = b / se
    p = 2 * stats.t.sf(np.abs(t), n - k)
    r2 = 1 - (e @ e) / ((y - y.mean()) @ (y - y.mean()))
    return {'terms': ['Intercept'] + names, 'b': [float(v) for v in b], 'se': [float(v) for v in se], 'p': [float(v) for v in p], 'r2': float(r2), 'n': int(n)}


def sig_round(v, s=4):
    if v == 0:
        return 0.0
    from math import log10, floor
    return round(v, -int(floor(log10(abs(v)))) + (s - 1))


def fmt(v):
    a = abs(v)
    if a >= 100:
        return f'{v:,.1f}'
    if a >= 1:
        return f'{v:,.3f}'
    return f'{v:.4g}'


def pf(v):
    return '< 0.001' if v < 0.001 else f'= {v:.3f}'


CONTEXTS = []

# ---------- data
s = df('restaurant', 'salesData'); w = df('restaurant', 'weatherData'); g = df('restaurant', 'gameData')
day = s.groupby('date').agg(y=('netTotal', 'sum'), y364=('netTotal_364', 'sum')).reset_index().merge(w, on='date', how='left').merge(g[['date', 'gameDay', 'homeGame']], on='date', how='left').fillna({'gameDay': 0, 'homeGame': 0})
CONTEXTS.append(dict(id='REST-T', case='restaurant', title='Restaurant sales and temperature', data="Larry's Commissary, 312 trading days in 2018 (salesData + weatherData + gameData)",
                     y=('Daily sales', 'total netTotal for the day (USD)'), x=('Max temperature', 'tmax (°F)', day.tmax), d=('Game day', 'university football game that day', day.gameDay, 'no game (reference group)', 'game day'),
                     Y=day.y, xp=60, dp=1, step=10))
CONTEXTS.append(dict(id='REST-L', case='restaurant', title='Restaurant sales vs. last year', data="Larry's Commissary daily sales; netTotal_364 = sales on the same weekday 52 weeks earlier",
                     y=('Daily sales', 'total netTotal for the day (USD)'), x=('Sales a year ago', 'netTotal_364 summed per day (USD)', day.y364), d=('Game day', 'university football game that day', day.gameDay, 'no game (reference group)', 'game day'),
                     Y=day.y, xp=3500, dp=1, step=100))
p15 = df('integrate', '2015Data')
p15 = p15[p15.Reg_Hrs > 0].copy()
p15['S'] = p15.Job.astype(str).str.match(r'^\d\dS').astype(int)
CONTEXTS.append(dict(id='PAY-H', case='integrate', title='IntegrateCo regular pay and hours', data='IntegrateCo 2015 payroll rows with regular hours > 0 (one row per employee, pay date and job)',
                     y=('Regular pay', 'Reg_Pay for the row (USD)'), x=('Regular hours', 'Reg_Hrs', p15.Reg_Hrs), d=('S department', 'Job code contains the S department identifier', p15.S, 'other jobs (reference group)', 'S-department job'),
                     Y=p15.Reg_Pay, xp=20, dp=1, step=1))
f = df('film', 'NYC_Film_Permits')
f = f[f.EventType == 'Shooting Permit'].copy()
f['dur'] = (f.EndDateTime - f.StartDateTime) * 24
f['lead'] = f.StartDateTime - f.EnteredOn
f['tv'] = (f.Category == 'Television').astype(int)
f = f[(f.dur > 0) & (f.dur <= 72) & (f.lead >= 0) & (f.lead <= 30)]
CONTEXTS.append(dict(id='FILM-D', case='film', title='Film permit duration', data='NYC shooting permits lasting up to 72 hours with lead time up to 30 days',
                     y=('Permit duration', 'hours from StartDateTime to EndDateTime'), x=('Lead time', 'days between EnteredOn and StartDateTime', f.lead), d=('Television', 'Category = Television', f.tv, 'other categories (reference group)', 'Television'),
                     Y=f.dur, xp=5, dp=1, step=1))
con = sqlite3.connect(f"file:{os.path.join(MAT, 'songs.db')}?mode=ro", uri=True)
so = pd.read_sql('SELECT * FROM songs', con)
so['feat'] = so.name.str.contains('feat.', regex=False).astype(int)
CONTEXTS.append(dict(id='SONG-E', case='songs', title='Song energy and loudness', data='CS50 songs.db, 100 songs',
                     y=('Energy', 'energy score (0–1)'), x=('Loudness', 'loudness (dB, negative numbers; closer to 0 = louder)', so.loudness), d=('Featuring', 'song name contains "feat."', so.feat, 'solo songs (reference group)', 'songs featuring another artist'),
                     Y=so.energy, xp=-6, dp=1, step=1))
con = sqlite3.connect(f"file:{os.path.join(MAT, 'movies.db')}?mode=ro", uri=True)
mv = pd.read_sql('SELECT m.year, r.rating, r.votes FROM movies m JOIN ratings r ON r.movie_id = m.id WHERE m.year BETWEEN 1990 AND 2019 AND r.votes >= 1000', con)
mv['kv'] = mv.votes / 1000
mv['new'] = (mv.year >= 2010).astype(int)
mv = mv[mv.kv <= 200]
CONTEXTS.append(dict(id='MOV-R', case='movies', title='Movie ratings and popularity', data='CS50 movies.db, movies from 1990–2019 with 1,000–200,000 votes',
                     y=('Rating', 'IMDb rating (1–10)'), x=('Votes', 'thousands of votes', mv.kv), d=('Released 2010+', 'movie released in 2010 or later', mv.new, 'released 1990–2009 (reference group)', 'released 2010 or later'),
                     Y=mv.rating, xp=50, dp=1, step=10))
pc = sqlite3.connect(f"file:{os.path.join(MAT, 'pcards.db')}?mode=ro", uri=True)
pm = pd.read_sql("SELECT FullName, COUNT(*) AS n, SUM(Amount) AS amt, SUM(Vendor LIKE '%amazon%') AS amz FROM pcards WHERE Year = 2014 AND Amount > 0 GROUP BY FullName HAVING COUNT(*) BETWEEN 5 AND 400", pc)
pm['amzd'] = (pm.amz > 0).astype(int)
CONTEXTS.append(dict(id='PC-S', case='pcards', title='P-card spending per cardholder', data='OSU P-card purchases in 2014, aggregated per cardholder (5–400 purchases)',
                     y=('Annual spending', 'total purchase amount per cardholder in 2014 (USD)'), x=('Purchases', 'number of purchases in 2014', pm.n), d=('Uses Amazon', 'cardholder bought from an Amazon vendor in 2014', pm.amzd, 'no Amazon purchases (reference group)', 'Amazon user'),
                     Y=pm.amt, xp=100, dp=1, step=10))
c = sqlite3.connect(f"file:{os.path.join(MAT, 'Chinook_Sqlite.sqlite')}?mode=ro", uri=True)
tr = pd.read_sql("SELECT t.Milliseconds/60000.0 AS mins, t.Bytes/1048576.0 AS mb, (t.MediaTypeId = 3) AS video FROM Track t", c)
CONTEXTS.append(dict(id='CHI-B', case='chinook', title='Chinook track file size', data='Chinook Track table, 3,503 tracks',
                     y=('File size', 'megabytes (Bytes / 1,048,576)'), x=('Length', 'track length in minutes', tr.mins), d=('Video', 'MediaType = Protected MPEG-4 video file', tr.video, 'audio tracks (reference group)', 'video tracks'),
                     Y=tr.mb, xp=4, dp=1, step=1))

exams = []
for ctx in CONTEXTS:
    yname, yunit = ctx['y']
    xname, xunit, x = ctx['x']
    dname, ddesc, d, d0, d1 = ctx['d']
    Y = ctx['Y']
    x = np.asarray(x, float); d = np.asarray(d, float); Yv = np.asarray(Y, float)
    mP = ols(Yv, [x, d], [xname, dname])
    mS = ols(Yv, [x], [xname])
    mQ = ols(Yv, [x, x ** 2], [xname, f'{xname}²'])
    mI = ols(Yv, [x, d, x * d], [xname, dname, f'{xname}×{dname}'])
    xp, dp, step = ctx['xp'], ctx['dp'], ctx['step']
    rng = (float(np.nanmin(x)), float(np.nanmax(x)))
    # rounded coefficients as shown on screen
    for m in (mP, mS, mQ, mI):
        m['show'] = [sig_round(v, 4) for v in m['b']]
        m['pshow'] = [round(v, 3) for v in m['p']]
    bP, bS, bQ, bI = mP['show'], mS['show'], mQ['show'], mI['show']
    pred = bP[0] + bP[1] * xp + bP[2] * dp
    sigS = mS['p'][1] < 0.05
    q = []
    q.append(dict(kind='P', model=mP, prompt=f'Predict {yname.lower()} for an observation with {xname.lower()} = {xp:g} that is in the group "{d1}".',
                  equation=f'Predicted {yname.lower()} = b₀ + b₁[{xname}] + b₂[{dname}]',
                  checks=[dict(label=f'Predicted {yname.lower()}', value=pred, tol=max(abs(pred) * 0.002, 0.01))],
                  answer=[f'Substitute {xname} = {xp:g} and {dname} = {dp} into the model:', f'{fmt(bP[0])} + ({fmt(bP[1])} × {xp:g}) + ({fmt(bP[2])} × {dp}) = {pred:,.4f}.',
                          f'{xname} = {xp:g} is inside the observed range ({rng[0]:,.4g} to {rng[1]:,.4g}), so this is interpolation, not extrapolation.' if rng[0] <= xp <= rng[1] else f'Careful: {xp:g} is outside the observed range – this is extrapolation.']))
    q.append(dict(kind='S', model=mS, prompt=f'Interpret the coefficient on {xname.lower()}. By how much does predicted {yname.lower()} change when {xname.lower()} increases by {step:g}?',
                  equation=f'Predicted {yname.lower()} = a₀ + a₁[{xname}]',
                  checks=[dict(label=f'Change for +{step:g} {xname.lower()}', value=bS[1] * step, tol=max(abs(bS[1] * step) * 0.002, 1e-4)),
                          dict(label='Significant at the 5% level?', value='yes' if sigS else 'no', choices=['yes', 'no'])],
                  answer=[f'a₁ = {fmt(bS[1])}: each one-unit increase in {xname.lower()} ({xunit}) is associated with {"an increase" if bS[1] > 0 else "a decrease"} of {fmt(abs(bS[1]))} in predicted {yname.lower()} ({yunit}).',
                          f'So +{step:g} → {bS[1] * step:+,.4f}.',
                          f'p {pf(mS["p"][1])} {"< 0.05: statistically significant at the 5% level." if sigS else "≥ 0.05: not statistically significant at the 5% level – we cannot rule out that the true slope is zero."}',
                          'Association, not causation: this is observational data, other factors are not held constant in a one-variable model.']))
    sigQ = mQ['p'][2] < 0.05
    q.append(dict(kind='Q', model=mQ, prompt=f'What do you learn from the p-value of the {xname.lower()}-squared term?',
                  equation=f'Predicted {yname.lower()} = c₀ + c₁[{xname}] + c₂[{xname}]²',
                  checks=[dict(label='Is the squared term significant at 5%?', value='yes' if sigQ else 'no', choices=['yes', 'no']),
                          dict(label='Shape implied by the sign of c₂', value='U-shaped (convex)' if bQ[2] > 0 else 'inverted U (concave)', choices=['U-shaped (convex)', 'inverted U (concave)'])],
                  answer=[f'c₂ = {fmt(bQ[2])}, p {pf(mQ["p"][2])}.',
                          ('p < 0.05: there is statistically significant curvature – the effect of ' + xname.lower() + ' on ' + yname.lower() + ' is not constant but ' + ('grows' if bQ[2] > 0 else 'weakens') + ' as ' + xname.lower() + ' increases.') if sigQ
                          else ('p ≥ 0.05: no statistically significant curvature; the data do not support a non-linear relationship beyond the linear term.'),
                          f'A {"positive" if bQ[2] > 0 else "negative"} c₂ means a {"U-shaped (convex)" if bQ[2] > 0 else "inverted-U (concave)"} curve.']))
    slope1 = bI[1] + bI[3]
    gap = bI[2] + bI[3] * xp
    sigI = mI['p'][3] < 0.05
    q.append(dict(kind='I', model=mI, prompt=f'Interpret all coefficients in context: the intercept, {xname.lower()}, {dname.lower()}, and {xname.lower()} × {dname.lower()}.',
                  equation=f'Predicted {yname.lower()} = d₀ + d₁[{xname}] + d₂[{dname}] + d₃([{xname}]×[{dname}])',
                  checks=[dict(label=f'Slope of {xname.lower()} for the group "{d1}"', value=slope1, tol=max(abs(slope1) * 0.002, 1e-4)),
                          dict(label=f'Predicted difference ({d1} minus {d0.split(" (")[0]}) at {xname.lower()} = {xp:g}', value=gap, tol=max(abs(gap) * 0.002, 0.01)),
                          dict(label='Is the interaction significant at 5%?', value='yes' if sigI else 'no', choices=['yes', 'no'])],
                  answer=[f'd₀ = {fmt(bI[0])}: predicted {yname.lower()} for the reference group ({d0.split(" (")[0]}) when {xname.lower()} = 0' + (' – zero may lie outside the data, so it is mainly an anchor.' if not (rng[0] <= 0 <= rng[1]) else '.'),
                          f'd₁ = {fmt(bI[1])}: slope of {xname.lower()} for the reference group.',
                          f'd₂ = {fmt(bI[2])}: difference between {d1} and the reference group when {xname.lower()} = 0.',
                          f'd₃ = {fmt(bI[3])} (p {pf(mI["p"][3])}): how much the slope differs for {d1}. Their slope is d₁ + d₃ = {slope1:,.4f}. ' + ('Significant at 5% – the effect of ' + xname.lower() + ' really differs between the groups.' if sigI else 'Not significant at 5% – no evidence that the slopes differ.'),
                          f'At {xname.lower()} = {xp:g} the predicted gap is d₂ + d₃×{xp:g} = {gap:,.4f}.']))
    exams.append(dict(id=ctx['id'], case=ctx['case'], title=ctx['title'], data=ctx['data'], y=dict(name=yname, unit=yunit), x=dict(name=xname, unit=xunit, range=rng),
                      d=dict(name=dname, desc=ddesc, ref=d0, one=d1), questions=q, seconds=300))
    print(ctx['id'], 'n=', mP['n'], 'P b=', bP, 'S p=', mS['pshow'][1], 'Q p=', mQ['pshow'][2], 'I p=', mI['pshow'][3])
json.dump(exams, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'interp.json'), 'w'), indent=0)
print('saved', len(exams), 'interpretation exams')
