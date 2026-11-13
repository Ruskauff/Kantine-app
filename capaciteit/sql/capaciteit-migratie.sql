-- ============================================================
-- Capaciteitstool Arnhemse Boys — tabellen en rechten (versie 1)
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
-- Zelfde project als de kantine-app. Het script raakt GEEN tabellen
-- van de kantine-app aan en mag opnieuw uitgevoerd worden.
--
-- Daarna capaciteit-import.sql draaien voor de teams en het rooster.
--
-- Rechten:
--   - Lezen: iedereen (het rooster bevat alleen teamnamen en tijden).
--   - Bewerken: de beheerder (profiles.role = 'admin') en wie in
--     cap_editors staat (het wedstrijdsecretariaat). Zie deel 6.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Velden: 3 kunstgrasvelden x 4 kwarten ----------
create table if not exists public.cap_units (
  id    text primary key,          -- 'HV-A1'
  field text not null,             -- 'HV', 'KG2', 'KG3'
  half  text not null,             -- 'A' of 'B'
  sort  int  not null
);
insert into public.cap_units (id, field, half, sort) values
  ('HV-A1','HV','A',1),  ('HV-A2','HV','A',2),  ('HV-B1','HV','B',3),  ('HV-B2','HV','B',4),
  ('KG2-A1','KG2','A',5),('KG2-A2','KG2','A',6),('KG2-B1','KG2','B',7),('KG2-B2','KG2','B',8),
  ('KG3-A1','KG3','A',9),('KG3-A2','KG3','A',10),('KG3-B1','KG3','B',11),('KG3-B2','KG3','B',12)
on conflict (id) do nothing;

-- ---------- 2. Teams ----------
-- Los van de tabel teams van de kantine-app: daar staan alleen de teams
-- die kantinediensten draaien. Koppelen kan later via kantine_team_id.
create table if not exists public.cap_teams (
  id              text primary key,  -- naam van het tabblad in het seizoensbestand, bv. 'O12-1'
  name            text not null,     -- weergavenaam, bv. 'Zaterdag 1'
  groep           text not null default 'overig'
                  check (groep in ('O5-O9','O10-O12','O13-O15','O16-O19','senioren','overig')),
  kleedkamer      text not null default 'indien_ruimte'
                  check (kleedkamer in ('vast','indien_ruimte')),
  sort            int  not null default 0,
  actief          boolean not null default true,
  kantine_team_id text
);

-- ---------- 3. Rooster (terugkerend weekpatroon) ----------
create table if not exists public.cap_slots (
  id          text primary key default gen_random_uuid()::text,
  team_ids    text[] not null default '{}',  -- één of meer teams (bv. O7-1 t/m O7-5 samen)
  label       text,                          -- eigen naam: 'Keepers', 'Wedstrijden', 'O7 1 tm 5'
  kind        text not null default 'training' check (kind in ('training','reservering')),
  weekday     smallint not null check (weekday between 1 and 7),  -- 1 = maandag
  start_time  time not null,
  end_time    time not null,
  units       text[] not null,                -- kwarten, bv. {HV-A1,HV-A2}
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  constraint cap_slots_tijd   check (end_time > start_time),
  constraint cap_slots_naam   check (cardinality(team_ids) > 0 or coalesce(label,'') <> ''),
  constraint cap_slots_kwart  check (cardinality(units) between 1 and 12)
);
create index if not exists cap_slots_day on public.cap_slots (weekday);

-- ---------- 4. Instellingen ----------
create table if not exists public.cap_settings (
  id          int primary key default 1 check (id = 1),
  kleedkamers int not null default 12
);
insert into public.cap_settings (id, kleedkamers) values (1, 12) on conflict (id) do nothing;

-- ---------- 5. Wie mag bewerken ----------
create table if not exists public.cap_editors (
  user_id text primary key,   -- auth.users.id of het e-mailadres (kleine letters)
  naam    text,
  added   timestamptz not null default now()
);

create or replace function public.cap_is_editor()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.cap_editors e
           join auth.users u on u.id = auth.uid()
           where e.user_id in (u.id::text, lower(u.email)))
      or exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin');
$$;
revoke execute on function public.cap_is_editor() from public;
grant  execute on function public.cap_is_editor() to anon, authenticated;

-- Wie heeft wat gewijzigd
create or replace function public.cap_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid()::text;
  return new;
end $$;
drop trigger if exists cap_slots_touch on public.cap_slots;
create trigger cap_slots_touch before insert or update on public.cap_slots
  for each row execute function public.cap_touch();

-- ---------- 6. Beveiliging (RLS) ----------
alter table public.cap_units    enable row level security;
alter table public.cap_teams    enable row level security;
alter table public.cap_slots    enable row level security;
alter table public.cap_settings enable row level security;
alter table public.cap_editors  enable row level security;   -- geen policies: alleen via SQL

do $$
declare t text;
begin
  foreach t in array array['cap_units','cap_teams','cap_slots','cap_settings'] loop
    execute format('drop policy if exists %I on public.%I', t||'_lezen', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t||'_lezen', t);
  end loop;
  foreach t in array array['cap_teams','cap_slots','cap_settings'] loop
    execute format('drop policy if exists %I on public.%I', t||'_schrijven', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.cap_is_editor()) with check (public.cap_is_editor())', t||'_schrijven', t);
  end loop;
end $$;

grant select on public.cap_units, public.cap_teams, public.cap_slots, public.cap_settings to anon, authenticated;
grant insert, update, delete on public.cap_teams, public.cap_slots, public.cap_settings to authenticated;

-- ---------- 7. Iemand van het wedstrijdsecretariaat toegang geven ----------
-- Zet het e-mailadres (kleine letters) in cap_editors. Dat mag al vóórdat het
-- account bestaat; het recht gaat in zodra iemand met dat adres inlogt.
--
--   insert into public.cap_editors (user_id, naam)
--   values ('wedstrijdsecretariaat@arnhemseboys.nl', 'Wedstrijdsecretariaat')
--   on conflict (user_id) do nothing;
--
-- Account aanmaken: Supabase -> Authentication -> Users -> Add user -> Send invitation.
-- Iemand weer weghalen:
--   delete from public.cap_editors where user_id = 'naam@voorbeeld.nl';

-- ---------- 8. Controle ----------
--   select count(*) from public.cap_units;   -- 12
--   select public.cap_is_editor();           -- false in de SQL editor, dat is goed
