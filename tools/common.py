import json, os, datetime as dt
import pandas as pd
CACHE = os.path.join(os.path.dirname(__file__), 'cache')
EPOCH = dt.datetime(1899, 12, 30)
def wb(wid):
    return json.load(open(os.path.join(CACHE, wid + '.json')))
def df(wid, sheet, header_row=0):
    w = wb(wid)
    s = next(x for x in w['sheets'] if x['name'] == sheet)
    rows = s['rows']
    hdr = rows[header_row]
    n = len(hdr)
    data = [ (r + [None]*(n-len(r)))[:n] for r in rows[header_row+1:]]
    d = pd.DataFrame(data, columns=hdr)
    return d
def todt(x): return EPOCH + dt.timedelta(days=x)
