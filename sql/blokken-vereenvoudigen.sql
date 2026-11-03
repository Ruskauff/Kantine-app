-- ============================================================
-- Kantinediensten Arnhemse Boys — blokken vereenvoudigen
--
-- Per blok nog één soort dienst ("Bar") met twee plekken, waarvan alleen
-- de eerste verplicht is. De keukentaken verdwijnen uit het rooster.
--
-- Dit kan NIET in de app: het scherm "Kantine-blokken · taken" in Beheer
-- hoort bij de kaart "Losse dienstdag" en geldt alleen voor die ene extra
-- dag. De clubbrede blokken staan in de tabel settings en worden nergens
-- door de app weggeschreven.
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
--
-- De id's b1, b2 en b3 blijven ongewijzigd. Dat is belangrijk: de
-- ingevulde namen per dienstdag hangen aan die id's. Verander je ze, dan
-- raakt alles wat al ingevuld is los.
-- ============================================================


-- ------------------------------------------------------------
-- DEEL A — EERST KIJKEN (verandert niets)
-- ------------------------------------------------------------

select jsonb_pretty(blocks)     as blokken_nu,
       jsonb_pretty(bar_shifts) as bar_diensten_nu,
       jsonb_pretty(task_info)  as uitleg_nu
from public.settings
where id = 1;


-- ------------------------------------------------------------
-- DEEL B — DE BLOKKEN OMZETTEN
-- ------------------------------------------------------------

update public.settings
set blocks = '[
  {"id":"b1","label":"Blok 1","start":"08:00","end":"11:00","tasks":["Bar (verplicht)","Bar (optioneel)"]},
  {"id":"b2","label":"Blok 2","start":"11:00","end":"14:00","tasks":["Bar (verplicht)","Bar (optioneel)"]},
  {"id":"b3","label":"Blok 3","start":"14:00","end":"17:00","tasks":["Bar (verplicht)","Bar (optioneel)"]}
]'::jsonb
where id = 1;


-- ------------------------------------------------------------
-- DEEL C — DE UITLEG MEE VERHUIZEN
--
-- De uitleg hangt aan de taaknaam. De oude namen bestaan straks niet meer,
-- dus zonder deze stap is de tekst onvindbaar (hij blijft wel bewaard).
-- Vul de tekst hieronder aan voordat je hem uitvoert — wat er nu staat is
-- grotendeels nog een aanzet.
-- ------------------------------------------------------------

update public.settings
set task_info = task_info || jsonb_build_object(
  'Bar (verplicht)',
  E'Jij bent dit blok de vaste kracht achter de bar.\n\n'
  'BAR\n'
  '- Hoe we omgaan met klanten en met teams, leiders en scheidsrechters: [aanvullen]\n\n'
  'KEUKEN\n'
  '- Tosti''s: [aanvullen]\n'
  '- Frituur: we werken met bestelbonnetjes vanuit de bar, zodat alles op '
  'volgorde gemaakt wordt. Let op de veiligheid.\n\n'
  'LAATSTE BLOK\n'
  '- Schoonmaak aan het eind van de dag: [aanvullen]',

  'Bar (optioneel)',
  E'Extra hulp in dit blok. Niet verplicht, maar bij drukke zaterdagen '
  'is twee man achter de bar een stuk prettiger werken.\n\n'
  'Je doet hetzelfde als de vaste kracht; zie de uitleg daar.'
)
where id = 1;


-- ------------------------------------------------------------
-- DEEL D — CONTROLE
-- ------------------------------------------------------------

select jsonb_pretty(blocks)    as blokken_na,
       jsonb_pretty(task_info) as uitleg_na
from public.settings
where id = 1;

-- Daarna in de app: uitloggen en opnieuw inloggen, of de pagina verversen.
-- De instellingen worden alleen bij het opstarten opgehaald.
