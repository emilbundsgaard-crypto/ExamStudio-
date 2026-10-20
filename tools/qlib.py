"""Tiny DSL for writing verified practice questions.

Every Excel question carries
  * the expected answer(s), computed independently in pandas, and
  * a reference formula per answer, which tools/verify.mjs evaluates in the
    in-browser spreadsheet engine and compares with the pandas value.
Every SQL question carries a reference query; expected results are produced by
SQLite here and re-checked with sql.js (the browser engine) by verify.mjs.
Known wrong approaches are executed too, so the site can recognise them.
"""
import json, math, os, re, sqlite3

QUESTIONS = []
MAT = os.environ.get('MAT', '/home/claude/work/mat')
DBFILES = {
    'songs': 'songs.db', 'movies': 'movies.db', 'chinook': 'Chinook_Sqlite.sqlite',
    'pcards': 'pcards.db', 'fiftyville': 'fiftyville.db',
}
_conns = {}


def conn(db):
    if db not in _conns:
        _conns[db] = sqlite3.connect(f"file:{os.path.join(MAT, DBFILES[db])}?mode=ro", uri=True)
    return _conns[db]


def _clean(v):
    if isinstance(v, float):
        if math.isnan(v):
            return None
        return float(v)
    if hasattr(v, 'item'):
        return v.item()
    return v


def A(label, value, kind=None, dp=None, accept=None, formula=None, tol=None):
    """One answer field. kind: int | num | pct | text | datetime | date"""
    value = _clean(value)
    if kind is None:
        if isinstance(value, str):
            kind = 'text'
        elif isinstance(value, int) or (isinstance(value, float) and float(value).is_integer() and dp is None):
            kind = 'int'
            value = int(value)
        else:
            kind = 'num'
    a = {'label': label, 'value': value, 'kind': kind}
    if dp is not None:
        a['dp'] = dp
    if accept:
        a['accept'] = accept
    if tol is not None:
        a['tol'] = tol
    if formula:
        a['formula'] = formula
    return a


def D(answer_index, value, msg):
    """Diagnostic: if answer #answer_index equals value, show msg."""
    return {'a': answer_index, 'value': _clean(value), 'msg': msg}


def excel(qid, case, wb, prompt, answers, skills, diag=(), hint=None, explain=None,
          source=None, level=1, secs=90, group=None):
    for a in answers:
        assert 'formula' in a, f'{qid}: every Excel answer needs a reference formula'
    # drop diagnostics that coincide with the right answer
    good = []
    for d in diag:
        a = answers[d['a']]
        if d['value'] is None:
            continue
        if a['kind'] in ('text',):
            if str(d['value']).strip().lower() == str(a['value']).strip().lower():
                continue
        else:
            try:
                if abs(float(d['value']) - float(a['value'])) < 1e-9:
                    continue
            except Exception:
                continue
        good.append(d)
    QUESTIONS.append(dict(id=qid, case=case, tool='excel', wb=wb, prompt=prompt, answers=answers,
                          skills=list(skills), diag=good, hint=hint, explain=explain, source=source,
                          level=level, secs=secs, group=group))


def _sig(rows, ncols):
    sums = []
    for j in range(ncols):
        col = [r[j] for r in rows if r[j] is not None]
        if col and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in col):
            sums.append(round(sum(col), 2))
        else:
            sums.append(None)
    return {'rows': len(rows), 'cols': ncols, 'sums': sums}


def run(db, q):
    cur = conn(db).execute(q)
    cols = [c[0] for c in cur.description]
    rows = [list(r) for r in cur.fetchall()]
    return cols, rows


def sql(qid, case, db, prompt, ref, skills, order=None, variants=(), hint=None, explain=None,
        source=None, level=1, secs=120, group=None, answer=None):
    """order: list of column indexes whose sequence must match (None = any order)."""
    cols, rows = run(db, ref)
    sig = _sig(rows, len(cols))
    vs = []
    for vq, msg in variants:
        try:
            vc, vr = run(db, vq)
        except Exception as e:  # a variant that errors is useless as a diagnostic
            print('  variant error', qid, e)
            continue
        s = _sig(vr, len(vc))
        if s == sig and sorted(map(str, vr)) == sorted(map(str, rows)):
            print('  WARN variant equals reference', qid, msg[:40])
            continue
        vs.append({'sig': s, 'msg': msg})
    preview = rows[:8]
    QUESTIONS.append(dict(id=qid, case=case, tool='sql', db=db, prompt=prompt, ref=ref.strip(),
                          skills=list(skills), order=order, sig=sig, cols=cols, preview=preview,
                          variants=vs, hint=hint, explain=explain, source=source, level=level,
                          secs=secs, group=group, answer=answer))
    return cols, rows


def save(path):
    ids = [q['id'] for q in QUESTIONS]
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, dup
    json.dump(QUESTIONS, open(path, 'w'), indent=0, default=str)
    print('saved', len(QUESTIONS), 'questions')
