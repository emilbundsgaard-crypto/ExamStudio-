"""Run every Excel reference formula through GridCraft (gridcraft-cli eval) and compare with the verified answers.
Needs tools/export_xlsx.py output and GRIDCRAFT_CLI pointing at a gridcraft-cli binary."""
import json, subprocess, sys, re, time, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
G=os.environ.get('GRIDCRAFT_CLI', 'gridcraft-cli')
Q=json.load(open('src/data/questions.json'))
def usdate(s):
    m=re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?',s)
    if not m: return None
    import datetime as dt
    d=dt.datetime(int(m[3]),int(m[1]),int(m[2]),int(m[4] or 0),int(m[5] or 0))
    return (d-dt.datetime(1899,12,30)).total_seconds()/86400
ok=fail=err=0; fails=[]
t0=time.time()
for q in Q:
    if q['tool']!='excel': continue
    for i,a in enumerate(q['answers']):
        try:
            r=subprocess.run([G,'eval',a['formula'],'--in',f"tools/cache/xlsx/{q['wb']}.xlsx",'--sheet','Work'],capture_output=True,text=True,timeout=120)
            out=(r.stdout.strip() or r.stderr.strip()).splitlines()[-1] if (r.stdout.strip() or r.stderr.strip()) else ''
        except subprocess.TimeoutExpired:
            out='TIMEOUT'
        good=False
        if a['kind']=='text': good=out.strip().strip('"').lower()==str(a['value']).lower()
        else:
            try: v=float(out)
            except: v=usdate(out)
            if v is not None:
                tol=1/1440 if a['kind'] in('datetime','date') else max(1e-6,abs(a['value'])*1e-9)
                good=abs(v-a['value'])<=tol
        if good: ok+=1
        else: fail+=1; fails.append((q['id'],i,a['value'],out[:80],a['formula'][:90]))
print(f'GridCraft: {ok} ok, {fail} wrong/failed of {ok+fail}  ({time.time()-t0:.0f}s)')
for f in fails: print(' ',f)
