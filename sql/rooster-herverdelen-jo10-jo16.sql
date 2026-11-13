-- ============================================================
-- Kantinediensten Arnhemse Boys — komende dienstdagen opnieuw verdelen
-- over JO10 t/m JO16
--
-- Besluit commissie 13 november 2026: kantinedienst draaien alleen de teams
-- JO10 t/m JO16. Jongere en oudere teams en de MO-teams doen niet mee in het
-- rooster; die benader je alleen bij nood (knop "Noodoproep" in de app).
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query.
--
-- WAT DIT SCRIPT DOET
--   * Verdeelt alle dienstdagen vanaf de datum in het blok "instellingen"
--     om de beurt over JO10 t/m JO16, de lichtingen gemengd (jongste,
--     oudste, op één na jongste, ...). Dezelfde volgorde als de app gebruikt
--     bij "Zaterdagen genereren".
--   * Krijgt een dienstdag een ander team, dan worden de ingevulde namen van
--     die dag gewist (die horen bij het oude team). Blijft het team gelijk,
--     dan blijven de namen staan.
--   * Lopende ruilverzoeken voor dagen die van team wisselen worden
--     ingetrokken.
--   * De vaste bar-krachten blijven staan. Dagen vóór de startdatum blijven
--     ongewijzigd.
--
-- VOER EERST ALLEEN DEEL A UIT en kijk het overzicht na. Pas de startdatum
-- aan in ALLE DRIE de delen als je een andere wilt (zoek op 2026-11-21).
-- ============================================================


-- ============================================================
-- DEEL A — VOORBESCHOUWING (verandert niets)
-- ============================================================

with instellingen as (
  select date '2026-11-21' as vanaf,
         '^jo ?(10|11|12|13|14|15|16)([^0-9]|$)'::text as teampatroon
),
teamlijst as (
  select t.id::text as id, t.name,
         (regexp_match(t.name, '(\d+)'))[1]::int as leeftijd,
         coalesce((regexp_match(t.name, '-\s*(\d+)'))[1]::int, 0) as teamnr
  from public.teams t, instellingen i
  where btrim(t.name) ~* i.teampatroon
),
per_lichting as (
  select tl.*, row_number() over (partition by tl.leeftijd order by tl.teamnr, replace(tl.name,' ','')) as nr_in_lichting
  from teamlijst tl
),
lichtingen as (
  select leeftijd, row_number() over (order by leeftijd) as opl, count(*) over () as aantal
  from (select distinct leeftijd from teamlijst) x
),
lichting_volgorde as (
  select leeftijd,
         case when opl <= (aantal + 1) / 2 then opl * 2 - 1 else (aantal - opl + 1) * 2 end as volgorde
  from lichtingen
),
rotatie as (
  select p.id, p.name,
         row_number() over (order by p.nr_in_lichting, lv.volgorde) - 1 as pos,
         count(*) over () as n
  from per_lichting p join lichting_volgorde lv on lv.leeftijd = p.leeftijd
),
dagen as (
  select s.id::text as id, s.date::date as datum, coalesce(s.label,'') as label,
         s.team_id::text as team_nu, coalesce(s.team_status,'{}'::jsonb) as status,
         row_number() over (order by s.date::date, s.id::text) - 1 as pos
  from public.saturdays s, instellingen i
  where s.date::date >= i.vanaf
)
select d.datum, d.label,
       coalesce(tn.name, '— geen —') as team_nu,
       r.name as team_nieuw,
       case when d.team_nu is distinct from r.id
            then case when d.status <> '{}'::jsonb then 'WISSELT — ingevulde namen gaan weg' else 'wisselt' end
            else 'blijft' end as gevolg,
       (select count(*) from public.swap_requests q
         where q.status in ('open','wacht_barco')
           and (q.from_saturday = d.id or q.to_saturday = d.id)) as lopende_ruilverzoeken
from dagen d
join rotatie r on r.pos = d.pos % r.n
left join public.teams tn on tn.id::text = d.team_nu
order by d.datum;

-- Welke teams doen mee, in welke volgorde? (hoort JO10 t/m JO16 te zijn, geen MO)
--   Staat hier een team dat er niet bij hoort, of mist er een, stop dan.


-- ============================================================
-- DEEL B — ECHT VERDELEN
-- Eén enkele opdracht: alles gebeurt in één keer, of helemaal niet.
-- Selecteer van hier tot DEEL C en klik Run.
-- ============================================================

with instellingen as (
  select date '2026-11-21' as vanaf,
         '^jo ?(10|11|12|13|14|15|16)([^0-9]|$)'::text as teampatroon
),
teamlijst as (
  select t.id::text as id, t.name,
         (regexp_match(t.name, '(\d+)'))[1]::int as leeftijd,
         coalesce((regexp_match(t.name, '-\s*(\d+)'))[1]::int, 0) as teamnr
  from public.teams t, instellingen i
  where btrim(t.name) ~* i.teampatroon
),
per_lichting as (
  select tl.*, row_number() over (partition by tl.leeftijd order by tl.teamnr, replace(tl.name,' ','')) as nr_in_lichting
  from teamlijst tl
),
lichtingen as (
  select leeftijd, row_number() over (order by leeftijd) as opl, count(*) over () as aantal
  from (select distinct leeftijd from teamlijst) x
),
lichting_volgorde as (
  select leeftijd,
         case when opl <= (aantal + 1) / 2 then opl * 2 - 1 else (aantal - opl + 1) * 2 end as volgorde
  from lichtingen
),
rotatie as (
  select p.id, row_number() over (order by p.nr_in_lichting, lv.volgorde) - 1 as pos, count(*) over () as n
  from per_lichting p join lichting_volgorde lv on lv.leeftijd = p.leeftijd
),
dagen as (
  select s.id::text as id, s.team_id::text as team_nu,
         row_number() over (order by s.date::date, s.id::text) - 1 as pos
  from public.saturdays s, instellingen i
  where s.date::date >= i.vanaf
),
herverdeling as (
  select d.id as saturday_id, r.id as team_nieuw, (d.team_nu is distinct from r.id) as wisselt
  from dagen d join rotatie r on r.pos = d.pos % r.n
),
-- ruilverzoeken voor dagen die van team wisselen intrekken
ingetrokken as (
  update public.swap_requests q
     set status = 'ingetrokken',
         barco_note = 'Rooster opnieuw verdeeld over JO10 t/m JO16',
         decided_at = now()
   where q.status in ('open','wacht_barco')
     and exists (select 1 from herverdeling h
                 where h.wisselt and (h.saturday_id = q.from_saturday or h.saturday_id = q.to_saturday))
  returning 1
),
-- nieuw team; namen alleen wissen als het team echt wisselt
bijgewerkt as (
  update public.saturdays s
     set team_id = h.team_nieuw, team_status = '{}'::jsonb
    from herverdeling h
   where s.id::text = h.saturday_id and h.wisselt
  returning 1
)
select (select count(*) from bijgewerkt)                          as dagen_gewisseld,
       (select count(*) from herverdeling where not wisselt)      as dagen_ongewijzigd,
       (select count(*) from ingetrokken)                         as ruilverzoeken_ingetrokken;


-- ============================================================
-- DEEL C — CONTROLE
-- ============================================================

select s.date::date as datum, t.name as team
from public.saturdays s
left join public.teams t on t.id::text = s.team_id::text
where s.date::date >= date '2026-11-21'
order by 1;

-- Daarna in de app: de pagina verversen.
