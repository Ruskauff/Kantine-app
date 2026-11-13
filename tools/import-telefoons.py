#!/usr/bin/env python3
"""
Telefoonnummers uit de Excel met barvrijwilligers klaarzetten voor Supabase.

Gebruik:
    python3 tools/import-telefoons.py "pad/naar/Barvrijwilligers 2026-2027.xlsx"

Dit script schrijft NIETS naar de database. Het maakt een SQL-bestand naast
de Excel (dus niet in de repo: er staan telefoonnummers in) met drie delen:

  DEEL A  zet de regels uit de Excel in een tijdelijke tabel en laat zien wie
          gekoppeld kan worden aan een vaste kracht of coördinator in de app,
          en wie niet. Verandert verder niets.
  DEEL B  zet de nummers echt in de tabel contacts. Pas draaien als het
          overzicht uit deel A klopt.
  DEEL C  ruimt de tijdelijke tabel op.

Koppelen gaat op naam: eerst de volledige naam (roepnaam + tussenvoegsel +
achternaam), en anders alleen de roepnaam als die in de app maar één keer
voorkomt. Wie niet te koppelen is staat in het overzicht van deel A; die kun
je in de app onder Contact met de hand invullen, of eerst als vaste kracht
toevoegen en het script nog een keer draaien.

Overgeslagen: regels zonder (geldig) nummer en regels waarvan 'inzetbaar'
zegt dat iemand niet meer actief is of de club verlaat.

Vereist: openpyxl (pip install openpyxl).
"""
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl ontbreekt: pip install openpyxl")

SKIP_INZETBAAR = re.compile(r"niet meer actief|verlaten|gestopt", re.I)


def norm_telefoon(p):
    """Zelfde regels als public.norm_telefoon in sql/telefoon-migratie.sql."""
    s = str(p or "").strip()
    if not s:
        return ""
    d = re.sub(r"[^0-9]", "", s)
    if s.startswith("+"):
        d = "+" + d
    elif d.startswith("00"):
        d = "+" + d[2:]
    elif d.startswith("0"):
        d = "+31" + d[1:]
    elif len(d) == 9 and d.startswith("6"):
        d = "+31" + d
    else:
        return None
    if d.startswith("+31"):
        return d if len(d) == 12 else None
    return d if 9 <= len(d) <= 16 else None


def schoon(x):
    return re.sub(r"\s+", " ", str(x or "")).strip()


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def lees(pad):
    ws = openpyxl.load_workbook(pad, read_only=True, data_only=True).worksheets[0]
    rijen = list(ws.iter_rows(values_only=True))
    kop = [schoon(h).lower() for h in rijen[0]]

    def kol(naam):
        try:
            return kop.index(naam.lower())
        except ValueError:
            sys.exit(f"Kolom '{naam}' niet gevonden. Kolommen: {rijen[0]}")

    k = {n: kol(n) for n in ["Functie", "Roepnaam", "Tv", "Achternaam", "Telefoon", "KNVB bondsnummer", "inzetbaar"]}
    goed, overgeslagen = [], []
    for i, r in enumerate(rijen[1:], start=2):
        roep = schoon(r[k["Roepnaam"]])
        naam = schoon(" ".join(schoon(r[k[x]]) for x in ["Roepnaam", "Tv", "Achternaam"]))
        if not naam:
            continue
        inzet = schoon(r[k["inzetbaar"]])
        tel = norm_telefoon(r[k["Telefoon"]])
        if SKIP_INZETBAAR.search(inzet):
            overgeslagen.append((i, naam, f"inzetbaar: {inzet}"))
            continue
        if not tel:
            overgeslagen.append((i, naam, "geen of ongeldig telefoonnummer"))
            continue
        goed.append({
            "rij": i, "naam": naam, "roepnaam": roep,
            "functie": schoon(r[k["Functie"]]), "telefoon": tel,
            "knvb": schoon(r[k["KNVB bondsnummer"]]),
        })
    return goed, overgeslagen


def maak_sql(goed, overgeslagen, bron):
    waarden = ",\n".join(
        f"  ({g['rij']}, {sql_str(g['naam'])}, {sql_str(g['roepnaam'])}, {sql_str(g['functie'])}, "
        f"{sql_str(g['telefoon'])}, {sql_str(g['knvb'])})"
        for g in goed
    )
    skip = "\n".join(f"--   rij {r}: {n} — {w}" for r, n, w in overgeslagen) or "--   (geen)"
    return f"""-- ============================================================
-- Telefoonnummers importeren uit {bron}
-- Gemaakt door tools/import-telefoons.py. Bevat persoonsgegevens:
-- niet in de repo zetten, en na gebruik weggooien.
--
-- Vereist: sql/telefoon-migratie.sql is al uitgevoerd.
--
-- Werkwijze in Supabase (SQL Editor):
--   1. Selecteer DEEL A en klik Run. Bekijk het overzicht.
--   2. Klopt het? Selecteer DEEL B en klik Run.
--   3. Selecteer DEEL C en klik Run.
--
-- Overgeslagen bij het inlezen ({len(overgeslagen)}):
{skip}
-- ============================================================


-- ------------------------------------------------------------
-- DEEL A — INLEZEN EN KIJKEN (verandert niets aan de app)
-- ------------------------------------------------------------

drop table if exists public.contacts_import;
create table public.contacts_import (
  rij int, naam text, roepnaam text, functie text, telefoon text, knvb text
);
alter table public.contacts_import enable row level security;  -- niet via de app leesbaar

insert into public.contacts_import(rij, naam, roepnaam, functie, telefoon, knvb) values
{waarden};

-- Koppeling: per Excel-regel de vaste kracht of coördinator in de app.
create or replace view public.contacts_import_koppeling as
with n as (
  select i.*, lower(i.naam) as ln, lower(i.roepnaam) as lr from public.contacts_import i
),
kandidaat as (
  select 'staff'::text as kind, b.id::text as ref_id, b.name as app_naam,
         lower(regexp_replace(btrim(b.name), '\\s+', ' ', 'g')) as ln
  from public.bar_staff b
  union all
  select 'profile', p.id::text, p.name, lower(regexp_replace(btrim(p.name), '\\s+', ' ', 'g'))
  from public.profiles p where p.role in ('admin','barco')
),
vol as (     -- volledige naam
  select n.rij, k.kind, k.ref_id, k.app_naam, 'volledige naam' as hoe
  from n join kandidaat k on k.ln = n.ln
),
roep as (    -- alleen roepnaam, als die in de app én in de Excel uniek is
  select n.rij, k.kind, k.ref_id, k.app_naam, 'alleen roepnaam' as hoe
  from n join kandidaat k on k.ln = n.lr
  where n.lr <> ''
    and not exists (select 1 from vol v where v.rij = n.rij)
    and (select count(*) from kandidaat k2 where k2.ln = n.lr) = 1
    and (select count(*) from n n2 where n2.lr = n.lr) = 1
)
select * from vol union all select * from roep;
revoke all on public.contacts_import_koppeling from anon, authenticated;

-- Het overzicht: wie wordt gekoppeld, en wie niet.
select i.rij, i.naam, i.functie,
       coalesce(k.app_naam, '— niet gevonden —') as in_de_app,
       coalesce(k.kind, '') as soort, coalesce(k.hoe, '') as gekoppeld_op,
       case when (select count(*) from public.contacts_import_koppeling k2 where k2.rij = i.rij) > 1
            then 'LET OP: meerdere mogelijkheden, wordt overgeslagen' else '' end as opmerking
from public.contacts_import i
left join public.contacts_import_koppeling k on k.rij = i.rij
order by (k.rij is null) desc, i.naam;


-- ------------------------------------------------------------
-- DEEL B — NUMMERS ECHT OPSLAAN
-- Bestaande nummers die in de app zijn ingevuld blijven staan; alleen
-- lege nummers en eerder geïmporteerde nummers worden bijgewerkt.
-- ------------------------------------------------------------

insert into public.contacts(kind, ref_id, telefoon, knvb, bron, updated_at)
select k.kind, k.ref_id, i.telefoon, i.knvb, 'excel', now()
from public.contacts_import i
join public.contacts_import_koppeling k on k.rij = i.rij
where (select count(*) from public.contacts_import_koppeling k2 where k2.rij = i.rij) = 1
on conflict (kind, ref_id) do update
  set telefoon   = excluded.telefoon,
      knvb       = case when excluded.knvb <> '' then excluded.knvb else public.contacts.knvb end,
      bron       = 'excel',
      updated_at = now()
  where public.contacts.telefoon = '' or public.contacts.bron = 'excel';

select kind, count(*) as met_nummer from public.contacts where telefoon <> '' group by kind;


-- ------------------------------------------------------------
-- DEEL C — OPRUIMEN
-- ------------------------------------------------------------

drop view  if exists public.contacts_import_koppeling;
drop table if exists public.contacts_import;
"""


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pad = Path(sys.argv[1]).expanduser()
    uit = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else pad.with_name(pad.stem + " - telefoons-import.sql")
    goed, overgeslagen = lees(pad)
    if not goed:
        sys.exit("Geen bruikbare regels gevonden.")
    uit.write_text(maak_sql(goed, overgeslagen, pad.name), encoding="utf-8")
    print(f"{len(goed)} regels met nummer, {len(overgeslagen)} overgeslagen.")
    for r, n, w in overgeslagen:
        print(f"  overgeslagen rij {r}: {n} — {w}")
    print(f"SQL geschreven naar: {uit}")


if __name__ == "__main__":
    main()
