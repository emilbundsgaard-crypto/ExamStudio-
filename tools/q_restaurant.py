from qlib import excel, A, D
from common import df, todt
import numpy as np

SRC = 'Restaurant regression case'
s = df('restaurant', 'salesData')
w = df('restaurant', 'weatherData')
g = df('restaurant', 'gameData')
ns, nw, ng = len(s) + 1, len(w) + 1, len(g) + 1
S = {c: f'salesData!${c}$2:${c}${ns}' for c in 'ABCDEFGHIJKLMNOPQRST'}
W = {c: f'weatherData!${c}$2:${c}${nw}' for c in 'ABCDE'}
G = {c: f'gameData!${c}$2:${c}${ng}' for c in 'ABCDE'}
day = s.groupby('date').agg(y=('netTotal', 'sum'), y364=('netTotal_364', 'sum'), y7=('netTotal_7', 'sum'), q=('quantity', 'sum')).reset_index()
day = day.merge(w, on='date', how='left').merge(g[['date', 'gameDay']], on='date', how='left')
day['gameDay'] = day.gameDay.fillna(0)
DAYS = f'UNIQUE({S["A"]})'
Y = f'SUMIFS({S["F"]},{S["A"]},d)'

excel('R-01', 'restaurant', 'restaurant', 'salesData has one row per menu item per day. How many distinct days are there, and what is the last date with data?',
      [A('Days with sales', len(day), formula=f'=ROWS({DAYS})'), A('Last date', float(day.date.max()), kind='date', formula=f'=MAX({S["A"]})')],
      ['unique identifiers', 'dates'], diag=[D(0, len(s), 'That is the number of rows (item-days), not days.'), D(0, 365, 'The restaurant was not open every day – count the dates that actually occur.')],
      source=SRC + ' – ETL', secs=60)
best = day.sort_values('y', ascending=False).iloc[0]
excel('R-02', 'restaurant', 'restaurant', 'Aggregate sales to one row per day (sum of netTotal over all menu items). Which date had the highest total sales, and how much?',
      [A('Date', float(best.date), kind='date', formula=f'=LET(d,{DAYS},INDEX(SORTBY(d,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),-1),1))'),
       A('Total netTotal', float(best.y), formula=f'=LET(d,{DAYS},MAX(MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x)))))')],
      ['pivot / summary', 'aggregation'], diag=[D(1, float(s.netTotal.max()), 'That is the best single menu-item row. Sum all items per day first.')], source=SRC + ' – ETL', secs=120, level=2)
gm = day.groupby('gameDay').y.mean()
excel('R-03', 'restaurant', 'restaurant', 'Merge gameData into the daily sales table (days not in gameData are non-game days). What is the average daily sales on game days and on non-game days?',
      [A('Game days', float(gm[1]), dp=2, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),gd,ISNUMBER(XMATCH(d,{G["A"]})),AVERAGE(FILTER(y,gd)))'),
       A('Non-game days', float(gm[0]), dp=2, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),gd,ISNUMBER(XMATCH(d,{G["A"]})),AVERAGE(FILTER(y,NOT(gd))))')],
      ['joins', 'XMATCH', 'aggregation'], diag=[D(0, float(s[s.date.isin(g.date)].netTotal.mean()), 'You averaged item rows, not daily totals.')], source=SRC + ' – ETL', secs=180, level=3)
c = float(np.corrcoef(day.y, day.tmax)[0, 1])
excel('R-04', 'restaurant', 'restaurant', 'Merge the maximum temperature (tmax) onto each sales day. What is the correlation between daily total sales and tmax?',
      [A('Correlation', c, dp=4, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),t,XLOOKUP(d,{W["A"]},{W["D"]}),CORREL(y,t))')],
      ['joins', 'XLOOKUP', 'CORREL'], source=SRC + ' – ETL', secs=150, level=3)
b1, b0 = np.polyfit(day.tmax, day.y, 1)
excel('R-05', 'restaurant', 'restaurant', 'Regress daily total sales on tmax (LINEST or the Analysis ToolPak). Report the slope and the intercept.',
      [A('Slope (per °F)', float(b1), dp=4, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),t,XLOOKUP(d,{W["A"]},{W["D"]}),INDEX(LINEST(y,t),1,1))'),
       A('Intercept', float(b0), dp=2, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),t,XLOOKUP(d,{W["A"]},{W["D"]}),INDEX(LINEST(y,t),1,2))')],
      ['regression', 'LINEST', 'joins'], diag=[D(0, float(np.polyfit(s.merge(w, on='date').tmax, s.merge(w, on='date').netTotal, 1)[0]), 'You ran the regression on item-level rows. The question is about total daily sales.')],
      source=SRC + ' – Analysis', secs=180, level=3)
k7 = np.polyfit(day.y7, day.y, 1)
last = day.sort_values('date').iloc[-1]
excel('R-06', 'restaurant', 'restaurant', 'Bob wants a prediction 7 days after the last day of data. Regress daily sales on sales 7 days earlier (netTotal_7 summed per day), then predict using the last day\'s total sales.',
      [A('Slope', float(k7[0]), dp=4, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),lag,MAP(d,LAMBDA(x,SUMIFS({S["T"]},{S["A"]},x))),INDEX(LINEST(y,lag),1,1))'),
       A('Prediction', float(k7[1] + k7[0] * last.y), dp=2, formula=f'=LET(d,{DAYS},y,MAP(d,LAMBDA(x,SUMIFS({S["F"]},{S["A"]},x))),lag,MAP(d,LAMBDA(x,SUMIFS({S["T"]},{S["A"]},x))),INTERCEPT(y,lag)+SLOPE(y,lag)*SUMIFS({S["F"]},{S["A"]},MAX(d)))')],
      ['regression', 'prediction', 'LINEST'],
      explain='To forecast 7 days ahead you can only use predictors that are known today – sales 7 days before the target date is the last observed day.', source=SRC + ' – Analysis', secs=240, level=3)
items = s.groupby('LineItem').quantity.sum().sort_values(ascending=False)
excel('R-07', 'restaurant', 'restaurant', 'Which menu item sold the largest total quantity in 2018, and how many units?',
      [A('Menu item', items.index[0], formula=f'=LET(u,UNIQUE({S["B"]}),INDEX(SORTBY(u,SUMIFS({S["C"]},{S["B"]},u),-1),1))'),
       A('Units', int(items.iloc[0]), formula=f'=LET(u,UNIQUE({S["B"]}),MAX(SUMIFS({S["C"]},{S["B"]},u)))')], ['pivot / summary'], source=SRC + ' – ETL', secs=90)
miss = int((~w.date.isin(day.date)).sum())
excel('R-08', 'restaurant', 'restaurant', 'How many days in weatherData have no sales at all (the restaurant was closed)?',
      [A('Closed days', miss, formula=f'=SUM(--ISNA(XMATCH({W["A"]},{S["A"]})))')], ['joins', 'XMATCH', 'data completeness'], source=SRC + ' – ETL', secs=90, level=2)
