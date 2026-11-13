-- ============================================================
-- Capaciteitstool Arnhemse Boys — wedstrijden (versie 1)
--
-- Na capaciteit-migratie.sql draaien. Mag opnieuw uitgevoerd worden.
-- Voegt toe:
--   - cap_matches: wedstrijden per datum, met veld(en), kleedkamers en status
--   - cap_settings.duur: bezettingsduur per leeftijd in minuten
--     (speeltijd + rust + wisselen), in de tool aan te passen
-- ============================================================

create table if not exists public.cap_matches (
  id          text primary key default gen_random_uuid()::text,
  datum       date not null,
  start_time  time not null,
  end_time    time not null,
  thuis       text not null,
  uit         text not null,
  team_id     text,                       -- ons team (cap_teams.id), leeg bij wedstrijden van andere clubs
  leeftijd    smallint,                   -- 7 = O7 ... 19 = O19, 99 = senioren
  units       text[] not null,            -- kwarten, bv. {KG2-A1} of {HV-A1,HV-A2,HV-B1,HV-B2}
  deel        numeric not null default 1  -- 0.5 = deelt een kwart met een tweede wedstrijd (O7)
              check (deel > 0 and deel <= 1),
  kk_thuis    smallint check (kk_thuis between 1 and 99),
  kk_uit      smallint check (kk_uit between 1 and 99),
  status      text not null default 'concept' check (status in ('concept','akkoord')),
  wedstrijdnr text,
  bron        text,
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  constraint cap_matches_tijd  check (end_time > start_time),
  constraint cap_matches_kwart check (cardinality(units) between 1 and 12)
);
create index if not exists cap_matches_datum on public.cap_matches (datum);

drop trigger if exists cap_matches_touch on public.cap_matches;
create trigger cap_matches_touch before insert or update on public.cap_matches
  for each row execute function public.cap_touch();

alter table public.cap_matches enable row level security;
drop policy if exists cap_matches_lezen on public.cap_matches;
create policy cap_matches_lezen on public.cap_matches for select to anon, authenticated using (true);
drop policy if exists cap_matches_schrijven on public.cap_matches;
create policy cap_matches_schrijven on public.cap_matches for all to authenticated
  using (public.cap_is_editor()) with check (public.cap_is_editor());
grant select on public.cap_matches to anon, authenticated;
grant insert, update, delete on public.cap_matches to authenticated;

-- Bezettingsduur per leeftijd (minuten). Startwaarden; controleren met het wedstrijdsecretariaat.
alter table public.cap_settings add column if not exists duur jsonb;
update public.cap_settings set duur = coalesce(duur, '{
  "7": 20, "8": 60, "9": 60, "10": 75, "11": 75, "12": 90, "13": 90,
  "14": 105, "15": 105, "16": 120, "17": 120, "19": 135, "99": 135
}'::jsonb) where id = 1;

-- Controle:
--   select count(*) from public.cap_matches;
