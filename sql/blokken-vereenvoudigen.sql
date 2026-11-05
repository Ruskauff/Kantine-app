-- ============================================================
-- Kantinediensten Arnhemse Boys — blokken vereenvoudigen
--
-- Per blok nog één soort dienst ("Bar") met twee plekken, waarvan alleen
-- de eerste verplicht is. De keukentaken verdwijnen uit het rooster, niet
-- uit de kantine: wie de bardienst draait doet ook de keuken. Daarom staat
-- dat allemaal in één uitleg bij "Bar (verplicht)".
--
-- Dit kan NIET in de app: het scherm "Kantine-blokken · taken" in Beheer
-- hoort bij de kaart "Losse dienstdag" en geldt alleen voor die ene extra
-- dag. De clubbrede blokken staan in de tabel settings en worden nergens
-- door de app weggeschreven.
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
--
-- De id's b1, b2 en b3 blijven ongewijzigd. Dat is belangrijk: de
-- ingevulde namen per dienstdag hangen aan die id's.
--
-- LET OP: in deel C staan nog zes plekken gemarkeerd met ‹vul in: ...›.
-- Zoek daarop en vervang ze voordat je dit uitvoert. Onderaan staat een
-- controlequery die waarschuwt als er eentje blijft staan.
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
-- DEEL C — DE UITLEG
--
-- De uitleg hangt aan de taaknaam, dus die moet mee naar de nieuwe namen.
-- De oude teksten blijven bewaard onder hun oude naam; ze zijn alleen niet
-- meer zichtbaar in de app.
-- ------------------------------------------------------------

update public.settings
set task_info = task_info || jsonb_build_object(

'Bar (verplicht)', $tekst$Jij staat dit blok achter de bar. Lees dit een keer door voordat je begint, dan weet je genoeg.

VOOR JE BEGINT
Kom een kwartier op tijd voor je blok, dan kan de vorige ploeg je bijpraten: wat er nog staat, wat op is, en of er iets bijzonders speelt. Ben je de eerste van de dag, dan ligt de sleutel ‹vul in: waar de sleutel ligt›.

ACHTER DE BAR
Je bedient spelers, ouders, tegenstanders en scheidsrechters. Blijf achter de bar staan ook als het rustig is — er komt altijd net iemand aan als je weg bent.
Afrekenen gaat via de kassa. Bij de bar ligt een instructie hoe die werkt.
Leiders en scheidsrechters ‹vul in: wat zij krijgen en hoe je dat aantekent›.

ALCOHOL
Je mag alleen alcohol schenken als je ouder bent dan 18 én de instructie Verantwoord alcohol schenken hebt gevolgd. Dat is wettelijk verplicht voor barvrijwilligers en het is een gratis e-learning van een half uur. Heb je hem niet, laat het schenken dan aan iemand die hem wel heeft en vraag de barcoördinator om de link.
Geen alcohol aan iemand onder de 18. Vraag om een ID bij iedereen die jonger dan 25 lijkt; dat is niet onbeleefd, dat is je werk.
We schenken alleen drank met minder dan 15% alcohol — bier en wijn dus. Sterke drank schenken we niet.
Bier en wijn schenken we vanaf ‹vul in: tijdstip›.

KEUKEN
In de keuken worden de tosti's gemaakt, staan de ballen gehakt en wordt er gefrituurd. Bij de bar en in de keuken ligt hiervoor een aparte instructie. We werken volgens de regels van de Nederlandse Voedsel- en Warenautoriteit.
Tosti's: ‹vul in: hoe het apparaat werkt en hoe lang ze erin moeten›.
Frituur: bestellingen komen via bonnetjes vanuit de bar, zodat alles op volgorde gaat. Werk rustig en laat de frituur nooit onbeheerd staan. Aan- en uitzetten: ‹vul in: hoe en op welke stand›.
Zet nooit iets nats in de hete olie en vul nooit bij als hij aan staat.

OVERDRAGEN
Aan het eind van je blok draag je over aan de volgende ploeg. Vertel wat op is, wat er nog in de frituur zit en of er iets gebeurd is.

HET LAATSTE BLOK: AFSLUITEN
- De kassa opmaken.
- De bar helemaal schoon, inclusief de glazen. Vul de voorraad aan waar dat kan.
- De keuken helemaal schoon. Frituur uit en de stoppen eruit.
- De vaatwasser uit elkaar en schoongemaakt.
- Al het eten en drinken terug in de koel- en voorraadkasten.
- Lichten uit, alle deuren gecontroleerd en op slot.
- Bij het verlaten van het pand ook de deur naar het hoofdveld beneden sluiten.

ER IS IETS AAN DE HAND
Bij een ongeval, een lastige klant of iets wat je niet alleen oplost: bel de barcoördinator op ‹vul in: telefoonnummer›. Liever één keer te vaak gebeld dan te laat.$tekst$,

'Bar (optioneel)', $tekst$Extra hulp in dit blok. Niet verplicht, maar op een drukke zaterdag is twee man achter de bar een stuk prettiger werken — en dan kan er ook eens iemand naar het veld kijken.

Je doet hetzelfde als de vaste kracht; de uitleg daar geldt ook voor jou. Dat geldt ook voor de regels over alcohol: schenken mag alleen als je ouder bent dan 18 en de instructie Verantwoord alcohol schenken hebt gevolgd.$tekst$

)
where id = 1;


-- ------------------------------------------------------------
-- DEEL D — CONTROLE
-- ------------------------------------------------------------

select jsonb_pretty(blocks) as blokken_na
from public.settings
where id = 1;

select key as taaknaam, length(value) as tekens
from public.settings, jsonb_each_text(task_info)
where id = 1
order by key;

-- Staat er nog ergens "vul in"? Dan is er een plek vergeten.
select key as taaknaam
from public.settings, jsonb_each_text(task_info)
where id = 1 and value like '%vul in:%';

-- Daarna in de app: de pagina verversen. De instellingen worden alleen bij
-- het opstarten opgehaald.
