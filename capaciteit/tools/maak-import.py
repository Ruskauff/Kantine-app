"""Leest het tabblad Trainingsschema uit het seizoensbestand en maakt import-SQL.
Alleen teamnamen en trainingstijden; geen persoonsgegevens."""
import openpyxl, re, sys, json
F = sys.argv[1]; OUT = sys.argv[2]
wb = openpyxl.load_workbook(F, data_only=True)
ws = wb['Trainingsschema']
UNITS = ['HV-A1','HV-A2','HV-B1','HV-B2','KG2-A1','KG2-A2','KG2-B1','KG2-B2','KG3-A1','KG3-A2','KG3-B1','KG3-B2']
DAYS = {'Maandag':1,'Dinsdag':2,'Woensdag':3,'Donderdag':4,'Vrijdag':5,'Zaterdag':6,'Zondag':7}

# ---- teams: de teamtabbladen (alles na 'Wijzigingen'), zonder inhoud te lezen
names = wb.sheetnames
team_sheets = [n for n in names[names.index('Wijzigingen')+1:]]
DISPLAY = {'Zat1':'Zaterdag 1','Zat2':'Zaterdag 2','VR30+1':'30+ VR','JO5-JO6':'O5 en O6',
           '35+1':'35+ 1','35+2':'35+ 2'}
def groep(tid):
    m = re.match(r'O(\d+)-', tid)
    if tid == 'JO5-JO6': return 'O5-O9', 5
    if m:
        a = int(m.group(1))
        g = 'O5-O9' if a <= 9 else 'O10-O12' if a <= 12 else 'O13-O15' if a <= 15 else 'O16-O19'
        return g, a
    return 'senioren', 99
teams = []
for i, t in enumerate(team_sheets):
    g, a = groep(t)
    kk = 'indien_ruimte' if a <= 13 else 'vast'
    teams.append(dict(id=t, name=DISPLAY.get(t, t), groep=g, kleedkamer=kk, sort=a*100+i))
teams.sort(key=lambda x: x['sort'])
for i, t in enumerate(teams): t['sort'] = i + 1
byname = {t['name']: t['id'] for t in teams}
byname.update({t['id']: t['id'] for t in teams})
GROUPS = {'O7 1 tm 5': ['O7-1','O7-2','O7-3','O7-4','O7-5'], '35+': ['35+1','35+2']}

# ---- rooster uit het raster (samengevoegde cellen = één blok)
rows = {}; cur = None
for r in range(1, ws.max_row+1):
    a = ws.cell(r, 1).value
    k = a.strip(':').strip() if isinstance(a, str) else None
    if k in DAYS: cur = k; continue
    if cur and isinstance(a, str) and re.match(r'\d\d:\d\d-\d\d:\d\d', a): rows[r] = (cur, a)
merged = {(m.min_row, m.min_col): m for m in ws.merged_cells.ranges}
slots = []
for r, (day, t) in rows.items():
    for c in range(2, 14):
        v = ws.cell(r, c).value
        if v is None or str(v).strip() == '': continue
        v = str(v).strip()
        m = merged.get((r, c)); r2, c2 = (m.max_row, m.max_col) if m else (r, c)
        start = t.split('-')[0]; end = rows[r2][1].split('-')[1]
        tid = byname.get(v)
        tids = [tid] if tid else GROUPS.get(v, [])
        kind = 'reservering' if v == 'Wedstrijden' else 'training'
        slots.append(dict(team_ids=tids, label=None if tid else v, kind=kind, weekday=DAYS[day],
                          start=start, end=end, units=UNITS[c-2:c2-1]))
slots.sort(key=lambda s: (s['weekday'], s['start'], UNITS.index(s['units'][0])))

# ---- controles
def mins(x): return int(x[:2])*60 + int(x[3:])
conf = []
for i, a in enumerate(slots):
    for b in slots[i+1:]:
        if a['weekday']==b['weekday'] and set(a['units'])&set(b['units']) and mins(a['start'])<mins(b['end']) and mins(b['start'])<mins(a['end']):
            conf.append((a, b))
unknown = sorted({s['label'] for s in slots if s['label']})
json.dump(dict(teams=teams, slots=slots), open(OUT.replace('.sql', '.json'), 'w'), indent=1)

arr = lambda xs: "array[" + ', '.join("'" + x.replace("'", "''") + "'" for x in xs) + "]::text[]"
q = lambda s: 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
L = []
L.append(f"""-- ============================================================
-- Capaciteitstool Arnhemse Boys — import trainingsrooster
-- Gemaakt uit: tabblad 'Trainingsschema' van het seizoensbestand 2026-2027
-- Alleen teamnamen en tijden; er zitten GEEN persoonsgegevens in.
--
-- Eerst capaciteit-migratie.sql draaien, daarna dit bestand.
-- Deel A (teams) mag altijd opnieuw. Deel B VERVANGT het hele
-- trainingsrooster: wijzigingen die in de tool zijn gedaan gaan dan verloren.
-- {len(teams)} teams, {len(slots)} blokken ({sum(s['kind']=='reservering' for s in slots)} wedstrijdreserveringen).
-- ============================================================

-- ---------- Deel A: teams ----------
insert into public.cap_teams (id, name, groep, kleedkamer, sort) values""")
L.append(',\n'.join(f"  ({q(t['id'])}, {q(t['name'])}, {q(t['groep'])}, {q(t['kleedkamer'])}, {t['sort']})" for t in teams))
L.append("""on conflict (id) do update set name = excluded.name, groep = excluded.groep, sort = excluded.sort;
-- (kleedkamer wordt bij opnieuw draaien NIET overschreven: die kan in de tool aangepast zijn)

-- ---------- Deel B: trainingsrooster (vervangt alles) ----------
begin;
delete from public.cap_slots;
insert into public.cap_slots (team_ids, label, kind, weekday, start_time, end_time, units) values""")
L.append(',\n'.join(f"  ({arr(s['team_ids'])}, {q(s['label'])}, {q(s['kind'])}, {s['weekday']}, '{s['start']}', '{s['end']}', {arr(s['units'])})" for s in slots) + ';')
L.append("commit;\n\n-- Controle: hoort " + str(len(slots)) + " op te leveren\n--   select count(*) from public.cap_slots;")
open(OUT, 'w').write('\n'.join(L) + '\n')
print(len(teams), 'teams;', len(slots), 'blokken; labels zonder team:', unknown)
print('overlappen:', [(a['team_ids'] or a['label'], b['team_ids'] or b['label'], a['weekday'], a['start']) for a, b in conf])
