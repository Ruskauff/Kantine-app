"""Zet de voetbal.nl-export (accommodatieprogramma Sportpark De Schuytgraaf) om naar SQL voor cap_matches."""
import re, sys, json
src, out = sys.argv[1], sys.argv[2]
YEAR = '2026'
DUUR = {7:20,8:60,9:60,10:75,11:75,12:90,13:90,14:105,15:105,16:120,17:120,19:135,99:135}
TEAMS35 = {'35+1':'35+1','35+2':'35+2'}
def full(n): return n.replace('§','Arnhemse Boys Schuytgraaf ').replace('¤','Arnhemse Boys ')
def ours(n, dow):
    if not n.startswith(('§','¤')): return None
    t = n[1:]
    m = re.match(r'(O\d+-\d+)(JM)?$', t)
    if m: return m.group(1)
    if t in TEAMS35: return TEAMS35[t]
    if t == '1': return 'Zat1'
    if t == '2': return 'Zon2' if dow == 7 else 'Zat2'
    return None
def age(a, b):
    for n in (a, b):
        m = re.search(r'O(\d+)-', n)
        if m: return int(m.group(1))
    return 99
def units(v):
    if not v: return []
    f = v.split('-', 1)[1].split(' ')
    if len(f) == 1: return [f"{f[0]}-{q}" for q in ('A1','A2','B1','B2')]
    s = f[1]
    return [f"{f[0]}-{s}"] if len(s) == 2 else [f"{f[0]}-{s}1", f"{f[0]}-{s}2"]
import datetime
t2m = lambda t: int(t[:2])*60+int(t[3:])
m2t = lambda m: f"{m//60:02d}:{m%60:02d}"
rows = []
for line in open(src, encoding='utf-8'):
    md, tijd, th, ui, _a, veld, kt, ku, nr, *_ = line.rstrip('\n').split('|')
    datum = f"{YEAR}-{md}"
    dow = datetime.date.fromisoformat(datum).isoweekday()
    a = age(th, ui)
    is35 = '35+' in th or '35+' in ui
    dur = 30 if is35 else DUUR[a]
    rows.append(dict(datum=datum, start=tijd, end=m2t(t2m(tijd)+dur), thuis=full(th), uit=full(ui),
        team_id=ours(th, dow) or ours(ui, dow), leeftijd=a, units=units(veld), deel=0.5 if a == 7 else 1,
        kk_thuis=int(kt) if kt else None, kk_uit=int(ku) if ku else None, nr=nr or None, note=None))
# O7 zonder veld: zelfde kwart als de andere O7-wedstrijden die dag
for r in rows:
    if r['leeftijd'] == 7 and not r['units']:
        known = [x['units'] for x in rows if x['datum'] == r['datum'] and x['leeftijd'] == 7 and x['units']]
        r['units'] = known[0] if known else ['HV-A1']
        r['note'] = 'Veld niet bekend op voetbal.nl; aangenomen ' + r['units'][0]
q = lambda s: 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
arr = lambda xs: "array[" + ", ".join(q(x) for x in xs) + "]::text[]"
dates = sorted({r['datum'] for r in rows})
L = [f"-- Wedstrijden op Sportpark De Schuytgraaf, {dates[0]} t/m {dates[-1]} (bron: voetbal.nl accommodatieprogramma, opgehaald 13-11-2026)",
     "-- Vervangt eerder ingelezen voetbal.nl-wedstrijden vanaf de eerste datum; wedstrijden die in de tool zijn aangemaakt blijven staan.",
     "alter table public.cap_matches drop constraint if exists cap_matches_kwart;",
     "alter table public.cap_matches add constraint cap_matches_kwart check (cardinality(units) between 0 and 12);",
     "begin;",
     f"delete from public.cap_matches where bron = 'voetbal.nl' and datum >= '{dates[0]}';",
     "insert into public.cap_matches (datum,start_time,end_time,thuis,uit,team_id,leeftijd,units,deel,kk_thuis,kk_uit,status,wedstrijdnr,bron,note) values"]
L.append(",\n".join(f"  ('{r['datum']}','{r['start']}','{r['end']}',{q(r['thuis'])},{q(r['uit'])},{q(r['team_id'])},{r['leeftijd']},{arr(r['units'])},{r['deel']},{q(r['kk_thuis'])},{q(r['kk_uit'])},'akkoord',{q(r['nr'])},'voetbal.nl',{q(r['note'])})" for r in rows) + ";")
L.append("commit;")
L.append(f"select datum, count(*) as wedstrijden, count(*) filter (where cardinality(units)=0) as zonder_veld from public.cap_matches where datum >= '{dates[0]}' group by datum order by datum;")
open(out, 'w', encoding='utf-8').write("\n".join(L) + "\n")
json.dump(rows, open(out.replace('.sql', '.json'), 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(rows), Counter(r['datum'] for r in rows))
print('zonder veld:', [(r['datum'], r['start'], r['thuis'][-12:]) for r in rows if not r['units']])
print('geen team:', sum(1 for r in rows if not r['team_id']), [ (r['thuis'],r['uit']) for r in rows if not r['team_id'] and ('Arnhemse' in r['thuis'] or 'Arnhemse' in r['uit'])])
