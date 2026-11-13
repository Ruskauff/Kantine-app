-- ============================================================
-- Kantinediensten Arnhemse Boys — telefoonnummers (fase 1)
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
-- Het script mag opnieuw uitgevoerd worden (idempotent).
--
-- Wat het doet:
--   * Een aparte tabel `contacts` voor telefoonnummers van teamleiders,
--     vaste krachten en coordinatoren. Bewust NIET als kolom in teams,
--     bar_staff of profiles: die tabellen leest iedereen met een account
--     (ook de rol 'vast') rechtstreeks uit. Een kolom daarin zou alle
--     nummers voor alle vaste krachten zichtbaar maken.
--   * RLS aan zonder policies: rechtstreekse REST-toegang is dicht.
--     Alles loopt via de functies hieronder.
--   * Teamleider: alleen het EIGEN nummer lezen en zetten (teamcode = sleutel).
--   * Coordinator/beheerder: alle nummers lezen en wijzigen.
--
-- Nummers worden opgeslagen in internationale vorm: +31612345678.
-- 06-12345678, 0612 345 678, 0031612345678 en +31 6 1234 5678 worden
-- allemaal omgezet. Een nummer dat niet klopt wordt geweigerd.
--
-- Vereist: sql/ruilen-migratie.sql is eerder gedraaid (voor de
-- hulpfuncties swap_team_for_code en swap_is_coord).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Tabel ----------
create table if not exists public.contacts (
  kind        text not null check (kind in ('team','staff','profile')),
  ref_id      text not null,               -- teams.id / bar_staff.id / profiles.id, als text
  telefoon    text not null default '',    -- altijd +31... of leeg
  knvb        text not null default '',    -- KNVB-bondsnummer, sleutel voor Sportlink later
  bron        text not null default 'app' check (bron in ('app','excel','sportlink')),
  updated_at  timestamptz not null default now(),
  primary key (kind, ref_id)
);

alter table public.contacts enable row level security;
-- geen policies: anon en authenticated kunnen er niet rechtstreeks bij


-- ---------- 2. Nummer omzetten naar +31... ----------
-- Geeft '' bij lege invoer, null bij een ongeldig nummer.
create or replace function public.norm_telefoon(p text)
returns text
language plpgsql immutable set search_path = public as $$
declare
  s text := coalesce(p,'');
  d text;
begin
  s := btrim(s);
  if s = '' then return ''; end if;
  -- alleen cijfers en een eventuele + aan het begin bewaren
  d := regexp_replace(s, '[^0-9]', '', 'g');
  if left(s,1) = '+' then
    d := '+' || d;
  elsif left(d,2) = '00' then
    d := '+' || substr(d,3);
  elsif left(d,1) = '0' then
    d := '+31' || substr(d,2);          -- Nederlands nummer: 06..., 026...
  elsif length(d) = 9 and left(d,1) = '6' then
    d := '+31' || d;                    -- 612345678 (nul vergeten)
  else
    return null;
  end if;
  -- Nederlandse nummers: precies 9 cijfers na +31
  if left(d,3) = '+31' then
    if length(d) <> 12 then return null; end if;
  elsif length(d) < 9 or length(d) > 16 then
    return null;                        -- buitenlands: grof controleren
  end if;
  return d;
end $$;
grant execute on function public.norm_telefoon(text) to anon, authenticated;


-- ---------- 3. Teamleider: eigen nummer ----------
create or replace function public.team_get_phone(p_code text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_team text;
begin
  v_team := public.swap_team_for_code(p_code);
  if v_team is null then raise exception 'Onbekende teamcode'; end if;
  return coalesce((select c.telefoon from public.contacts c
                   where c.kind = 'team' and c.ref_id = v_team), '');
end $$;

create or replace function public.team_set_phone(p_code text, p_phone text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_team text;
  v_tel  text;
begin
  v_team := public.swap_team_for_code(p_code);
  if v_team is null then raise exception 'Onbekende teamcode'; end if;
  v_tel := public.norm_telefoon(p_phone);
  if v_tel is null then raise exception 'Dit telefoonnummer klopt niet'; end if;

  insert into public.contacts(kind, ref_id, telefoon, bron, updated_at)
  values ('team', v_team, v_tel, 'app', now())
  on conflict (kind, ref_id) do update
    set telefoon = excluded.telefoon, bron = 'app', updated_at = now();
  return v_tel;
end $$;


-- ---------- 4. Coordinator: het hele contactoverzicht ----------
-- Teamleiders (per team), vaste krachten (bar_staff) en coordinatoren
-- (profiles met rol admin of barco). Wie nog geen nummer heeft staat er
-- ook in, met een leeg nummer — zo zie je wat er ontbreekt.
create or replace function public.contact_list()
returns table(kind text, ref_id text, naam text, groep text, telefoon text, knvb text, bron text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.swap_is_coord() then
    raise exception 'Alleen de kantinecoordinator of beheerder mag telefoonnummers bekijken';
  end if;

  return query
    select 'team'::text, t.id::text, t.name::text, 'Teamleider'::text,
           coalesce(c.telefoon,''), coalesce(c.knvb,''), coalesce(c.bron,'')
    from public.teams t
    left join public.contacts c on c.kind = 'team' and c.ref_id = t.id::text
  union all
    select 'staff', b.id::text, b.name::text, 'Vaste kracht',
           coalesce(c.telefoon,''), coalesce(c.knvb,''), coalesce(c.bron,'')
    from public.bar_staff b
    left join public.contacts c on c.kind = 'staff' and c.ref_id = b.id::text
  union all
    select 'profile', p.id::text, p.name::text,
           case p.role when 'admin' then 'Beheerder' else 'Coördinator' end,
           coalesce(c.telefoon,''), coalesce(c.knvb,''), coalesce(c.bron,'')
    from public.profiles p
    left join public.contacts c on c.kind = 'profile' and c.ref_id = p.id::text
    where p.role in ('admin','barco')
  order by 4, 3;
end $$;

-- ---------- 5. Coordinator: nummer zetten of wissen ----------
create or replace function public.contact_set(p_kind text, p_ref_id text, p_phone text, p_knvb text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_tel text;
begin
  if not public.swap_is_coord() then
    raise exception 'Alleen de kantinecoordinator of beheerder mag telefoonnummers wijzigen';
  end if;
  if p_kind not in ('team','staff','profile') then raise exception 'Onbekend soort contact'; end if;
  v_tel := public.norm_telefoon(p_phone);
  if v_tel is null then raise exception 'Dit telefoonnummer klopt niet'; end if;

  insert into public.contacts(kind, ref_id, telefoon, knvb, bron, updated_at)
  values (p_kind, p_ref_id, v_tel, coalesce(p_knvb,''), 'app', now())
  on conflict (kind, ref_id) do update
    set telefoon   = excluded.telefoon,
        knvb       = coalesce(p_knvb, public.contacts.knvb),
        bron       = 'app',
        updated_at = now();
  return v_tel;
end $$;


-- ---------- 6. Rechten ----------
revoke execute on function public.team_get_phone(text)                   from public;
revoke execute on function public.team_set_phone(text,text)              from public;
revoke execute on function public.contact_list()                         from public;
revoke execute on function public.contact_set(text,text,text,text)       from public;
grant  execute on function public.team_get_phone(text)                   to anon, authenticated;
grant  execute on function public.team_set_phone(text,text)              to anon, authenticated;
grant  execute on function public.contact_list()                         to authenticated;
grant  execute on function public.contact_set(text,text,text,text)       to authenticated;


-- ---------- 7. Controle ----------
-- Hoort +31612345678, +31612345678, +31263512345, '' en null te geven:
--   select public.norm_telefoon('06-12345678'), public.norm_telefoon('+31 6 1234 5678'),
--          public.norm_telefoon('026 351 2345'), public.norm_telefoon(''),
--          public.norm_telefoon('12345');
--
-- Als anon hoort dit een fout (permission denied) te geven:
--   set role anon; select * from public.contacts; reset role;

-- ---------- 8. Opruimen (alleen draaien als je wilt) ----------
-- Contacten van verwijderde teams, vaste krachten of accounts:
--   delete from public.contacts c where
--     (c.kind='team'    and not exists (select 1 from public.teams t     where t.id::text=c.ref_id)) or
--     (c.kind='staff'   and not exists (select 1 from public.bar_staff b where b.id::text=c.ref_id)) or
--     (c.kind='profile' and not exists (select 1 from public.profiles p  where p.id::text=c.ref_id));
