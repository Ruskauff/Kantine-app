# Velden & planning (capaciteitstool)

Dagbord van de drie kunstgrasvelden op Sportpark De Schuytgraaf (HV, KG2, KG3, elk in
vier kwarten) met alle trainingen en wedstrijden. Iedereen kan meekijken; het
wedstrijdsecretariaat logt in en plant. Gebruikt hetzelfde Supabase-project als de
kantine-app, met eigen tabellen (`cap_…`). De kantine-app wordt niet aangeraakt.

Live: <https://velden-arnhemseboys.r-ruskauff.workers.dev> — direct naar een datum met
`?datum=2026-11-21`.

## Wat staat waar

| Map | Wat erin zit |
| --- | --- |
| `site/` | De tool zelf: `index.html`, `logo.png`, `_headers`, `robots.txt`. Dit is wat online staat. |
| `sql/` | Scripts voor Supabase, in deze volgorde gedraaid: `capaciteit-migratie.sql` (tabellen + rechten), `capaciteit-import.sql` (teams + trainingsrooster), `capaciteit-wedstrijden.sql` (wedstrijden + bezettingsduur), daarna de wedstrijddata (`…-7nov.sql`, `…-voetbalnl.sql`). |
| `tools/` | `maak-import.py` maakt de trainingsimport uit het seizoensbestand (leest alleen het tabblad Trainingsschema en de teamnamen, geen spelersgegevens). `maak-sql-voetbalnl.py` zet een export van het voetbal.nl-accommodatieprogramma om naar SQL. |
| `tests/` | Playwright-controles tegen een nagebootste backend: `python3 tests/browsertest-wedstrijden.py` enz. |

## Online zetten

Eigen Cloudflare-project **`velden-arnhemseboys`** (niet het project van de kantine-app):
Workers & Pages → velden-arnhemseboys → Deployments → New deployment → **alleen de
inhoud van `capaciteit/site`** slepen → Deploy.

## Bewerkrechten

Lezen mag iedereen. Bewerken: de beheerder van de kantine-app (`profiles.role = 'admin'`)
en wie in `cap_editors` staat (op user-id of e-mailadres):

```sql
insert into public.cap_editors (user_id, naam) values ('naam@voorbeeld.nl', 'Naam')
on conflict (user_id) do nothing;
```

Account aanmaken: Supabase → Authentication → Users → Add user → Send invitation.

## Afspraken in de tool

- Eenheid is een kwart veld (A1/A2/B1/B2); half veld = A of B, heel veld = alle vier.
- Kleedkamers: 12. Trainingen: vaste claim vanaf O14, t/m O13 alleen als er ruimte is.
  Delen bij wedstrijden: t/m O9 max. 4 teams per kamer, t/m O13 max. 2, vanaf O14 eigen kamer.
- Bezettingsduur per leeftijd (in te stellen in het tabblad Teams): O7 20, O8–O9 60,
  O10–O11 75, O12–O13 90, O14–O15 105, O16–O17 120, O19/senioren 135 minuten.
- O7 speelt om en om bij de verenigingen: het accommodatieprogramma is de bron voor wat
  er op het eigen park ligt; twee O7-wedstrijden kunnen één kwart delen.
- Wedstrijden zonder veld staan onder "Nog in te delen"; met "Plek zoeken" verplaats je ze.
- Een reservering "Wedstrijden" botst niet met een echte wedstrijd, wel met een training.
