-- ============================================================
-- Kantinediensten Arnhemse Boys — rooster voor de pilot
-- Opgesteld 3 november 2026. Vervangt rooster-najaar-2026.sql,
-- waarvan de datums inmiddels in het verleden lagen.
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
--
-- WAT DIT SCRIPT DOET
--   1. Wist ALLE bestaande dienstdagen, inclusief ingevulde namen,
--      ingedeelde bar-krachten en ruilverzoeken. Niet terug te draaien.
--   2. Maakt de zaterdagen aan van 7 november tot en met 12 december 2026.
--   3. Wijst ze om de beurt toe aan de teams JO10 t/m JO15 en MO10 t/m MO15,
--      gemengd over de lichtingen: eerst het jongste team, dan het oudste,
--      dan het op één na jongste, enzovoort.
--
-- VOER EERST ALLEEN DEEL A UIT. Dan zie je welke teams meedoen en wat er
-- weggegooid wordt, zonder dat er iets verandert. Ben je akkoord, voer dan
-- het hele script uit.
--
-- AANPASSEN
--   De instellingen staan hieronder in het blok "instellingen", op één plek.
--   Wil je verder dan 12 december? Zet dan eind_datum op bijvoorbeeld
--   2027-03-27 en vul de winterstop-zaterdagen aan in overslaan.
-- ============================================================


-- ============================================================
-- DEEL A — VOORBESCHOUWING (verandert niets)
-- ============================================================

-- A1. Welke teams doen mee, en in welke volgorde?
with instellingen as (
  select '^(jo|mo) ?(10|11|12|13|14|15)([^0-9]|$)'::text as teampatroon
),
teamlijst as (
  select t.id, t.name,
         (regexp_match(t.name, '^[JjMm][Oo] ?(\d+)'))[1]::int as leeftijd
  from public.teams t, instellingen i
  where t.name ~* i.teampatroon
),
per_lichting as (
  select tl.*, row_number() over (partition by tl.leeftijd order by tl.name) as nr_in_lichting
  from teamlijst tl
),
lichtingen as (
  select leeftijd,
         row_number() over (order by leeftijd) as opl,
         count(*) over () as aantal
  from (select distinct leeftijd from teamlijst) x
),
lichting_volgorde as (
  select leeftijd,
         case when opl <= (aantal + 1) / 2 then opl * 2 - 1
              else (aantal - opl + 1) * 2 end as volgorde
  from lichtingen
)
select row_number() over (order by p.nr_in_lichting, lv.volgorde) as beurt,
       p.name as team,
       p.leeftijd
from per_lichting p
join lichting_volgorde lv on lv.leeftijd = p.leeftijd
order by beurt;

-- A2. Welke zaterdagen komen erin?
select d::date as zaterdag
from generate_series(date '2026-11-07', date '2026-12-12', interval '7 days') d
where d::date <> all (array[]::date[])
order by 1;

-- A3. Wat wordt er weggegooid?
select (select count(*) from public.saturdays)        as dienstdagen_nu,
       (select count(*) from public.bar_assignments)  as bar_indelingen_nu,
       (select count(*) from public.swap_requests)    as ruilverzoeken_nu;

-- A4. Welke teams vallen er juist buiten? Loop deze lijst even na.
select name
from public.teams
where name !~* '^(jo|mo) ?(10|11|12|13|14|15)([^0-9]|$)'
order by name;


-- ============================================================
-- DEEL B — LEEGMAKEN
-- ============================================================

delete from public.bar_assignments;
delete from public.swap_requests;
delete from public.saturdays;


-- ============================================================
-- DEEL C — OPNIEUW VULLEN
-- ============================================================

with instellingen as (
  select '^(jo|mo) ?(10|11|12|13|14|15)([^0-9]|$)'::text as teampatroon,
         date '2026-11-07'          as start_datum,
         date '2026-12-12'          as eind_datum,
         array[]::date[]            as overslaan   -- bijv. array[date '2026-12-19', date '2026-12-26']
),
teamlijst as (
  select t.id, t.name,
         (regexp_match(t.name, '^[JjMm][Oo] ?(\d+)'))[1]::int as leeftijd
  from public.teams t, instellingen i
  where t.name ~* i.teampatroon
),
per_lichting as (
  select tl.*, row_number() over (partition by tl.leeftijd order by tl.name) as nr_in_lichting
  from teamlijst tl
),
lichtingen as (
  select leeftijd,
         row_number() over (order by leeftijd) as opl,
         count(*) over () as aantal
  from (select distinct leeftijd from teamlijst) x
),
lichting_volgorde as (
  select leeftijd,
         case when opl <= (aantal + 1) / 2 then opl * 2 - 1
              else (aantal - opl + 1) * 2 end as volgorde
  from lichtingen
),
teams_op_volgorde as (
  select p.id,
         row_number() over (order by p.nr_in_lichting, lv.volgorde) - 1 as beurt,
         count(*) over () as aantal_teams
  from per_lichting p
  join lichting_volgorde lv on lv.leeftijd = p.leeftijd
),
zaterdagen as (
  select d::date as datum,
         row_number() over (order by d) - 1 as nr
  from instellingen i,
       generate_series(i.start_datum, i.eind_datum, interval '7 days') d
  where d::date <> all (i.overslaan)
)
insert into public.saturdays (id, date, team_id, team_status)
select gen_random_uuid()::text, z.datum, t.id, '{}'
from zaterdagen z
join teams_op_volgorde t
  on t.beurt = z.nr % t.aantal_teams;


-- ============================================================
-- DEEL D — CONTROLE
-- ============================================================

select s.date as zaterdag, t.name as team
from public.saturdays s
left join public.teams t on t.id::text = s.team_id::text
order by s.date;

-- Kwam er een dag zonder team uit? Dan zijn er geen teams gevonden die aan
-- het naampatroon voldoen — controleer met:  select name from public.teams order by name;
