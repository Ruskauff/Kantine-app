// Telefoonnummers: teamleiders, vaste krachten en coördinatoren appen of sms'en.
// Fase 1: de app opent WhatsApp of sms met een kant-en-klaar bericht; de
// coördinator verstuurt het zelf. Nummers zijn alleen voor coördinator en
// beheerder zichtbaar — dat dwingt de database af, maar de app mag ze ook
// nergens anders laten zien.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInAlsTeam, logInMetAccount, naarTab, dag } from './helpers/app.mjs';

const CONTACTEN = [
  { kind: 'team', ref_id: 't1', naam: 'JO11-1', groep: 'Teamleider', telefoon: '+31612345678', knvb: '', bron: 'app' },
  { kind: 'team', ref_id: 't2', naam: 'JO11-2', groep: 'Teamleider', telefoon: '', knvb: '', bron: '' },
  { kind: 'team', ref_id: 't3', naam: 'JO13-1', groep: 'Teamleider', telefoon: '', knvb: '', bron: '' },
  { kind: 'staff', ref_id: 'p2', naam: 'Els Bakker', groep: 'Vaste kracht', telefoon: '+31687654321', knvb: '', bron: 'excel' },
  { kind: 'profile', ref_id: 'u1', naam: 'Wito', groep: 'Beheerder', telefoon: '', knvb: '', bron: '' },
];

test('nummers worden omgezet naar +31-vorm, ongeldige worden geweigerd', async ({ page }) => {
  await page.goto('/');
  const uit = await page.evaluate(() => [
    '06-12345678', '06 1234 5678', '+31 6 1234 5678', '0031612345678', '612345678',
    '026 351 2345', '', '12345', '06-1234567', '+49 151 12345678',
  ].map(normTel));
  expect(uit).toEqual([
    '+31612345678', '+31612345678', '+31612345678', '+31612345678', '+31612345678',
    '+31263512345', '', null, null, '+4915112345678',
  ]);
  expect(await page.evaluate(() => fmtTel('+31612345678'))).toBe('06 1234 5678');
});

test('de WhatsApp- en sms-link bevatten nummer en bericht', async ({ page }) => {
  await page.goto('/');
  const [wa, sms] = await page.evaluate(() => [waLink('+31612345678', 'Hoi & tot zaterdag'), smsLink('+31612345678', 'Hoi')]);
  expect(wa).toBe('https://wa.me/31612345678?text=Hoi%20%26%20tot%20zaterdag');
  expect(sms).toBe('sms:+31612345678?&body=Hoi');
});

test('een teamleider vult zijn eigen nummer in', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const kaart = page.locator('#teamTel');
  await expect(kaart).toContainText('Je telefoonnummer');
  await kaart.locator('input').fill('06-1234567');          // één cijfer te weinig
  await kaart.getByRole('button', { name: 'Opslaan' }).click();
  await expect(kaart.locator('input')).toHaveClass(/fout/);
  expect(s.rpc.filter((r) => r.fn === 'team_set_phone')).toHaveLength(0);

  await kaart.locator('input').fill('06-12345678');
  await kaart.getByRole('button', { name: 'Opslaan' }).click();
  await expect.poll(() => s.rpc.filter((r) => r.fn === 'team_set_phone').length).toBe(1);
  const verzoek = s.rpc.find((r) => r.fn === 'team_set_phone').body;
  expect(verzoek).toEqual({ p_code: 'aaaaa', p_phone: '+31612345678' });
  await expect(kaart).toContainText('06 1234 5678');
});

test('een teamleider ziet nooit de nummers van anderen', async ({ page }) => {
  const s = stand({ teamTel: '+31611112222' });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  await expect(page.locator('#teamTel')).toContainText('06 1111 2222');
  // geen overzicht van anderen, geen app-knoppen, geen tabblad Contact
  expect(s.rpc.filter((r) => r.fn === 'contact_list')).toHaveLength(0);
  await expect(page.locator('a.telbtn')).toHaveCount(0);
  await expect(page.locator('#navbar')).toBeHidden();
});

test('zonder de nieuwe database-functies werkt de teamleider-weergave gewoon door', async ({ page }) => {
  const s = stand({ geenTelefoonMigratie: true });
  await nepDatabase(page, s);
  await logInAlsTeam(page);
  await expect(page.locator('#content .block').first()).toBeVisible();
  await expect(page.locator('#teamTel')).toHaveCount(0);
});

test('de coördinator kan bij een open dienstdag de teamleider appen', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: CONTACTEN,
    saturdays: [{ id: 's1', date: dag(7), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null }] });
  await nepDatabase(page, s);
  await logInMetAccount(page);

  await page.locator('.sathead').first().click();
  const rij = page.locator('.contactrij');
  await expect(rij).toContainText('Teamleider JO11-1');
  const href = await rij.locator('a.telbtn.wa').getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/31612345678\?text=/);
  expect(decodeURIComponent(href.split('text=')[1])).toContain('JO11-1');
  expect(await rij.locator('a.telbtn.sms').getAttribute('href')).toMatch(/^sms:\+31612345678\?&body=/);
});

test('zonder nummer zijn de knoppen uitgeschakeld en staat er waar je het invult', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: CONTACTEN,
    saturdays: [{ id: 's1', date: dag(7), team_id: 't2', team_status: {}, label: '', blocks: null, bar_shifts: null }] });
  await nepDatabase(page, s);
  await logInMetAccount(page);

  await page.locator('.sathead').first().click();
  const rij = page.locator('.contactrij');
  await expect(rij).toContainText('nog geen telefoonnummer');
  await expect(rij.locator('a.telbtn.wa')).toHaveClass(/uit/);
  expect(await rij.locator('a.telbtn.wa').getAttribute('href')).toBeNull();
});

test('een volledig ingevulde dienstdag krijgt geen app-knoppen', async ({ page }) => {
  const vol = { b1: [{ done: true, name: 'A' }, { done: false, name: '' }], b2: [{ done: true, name: 'B' }, { done: false, name: '' }] };
  const s = stand({ rol: 'barco', contacts: CONTACTEN,
    saturdays: [{ id: 's1', date: dag(7), team_id: 't1', team_status: vol, label: '', blocks: null, bar_shifts: null }] });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await page.locator('.sathead').first().click();
  await expect(page.locator('.satbody').first()).toBeVisible();
  await expect(page.locator('.contactrij')).toHaveCount(0);
});

test('het tabblad Contact toont iedereen, met wie nog geen nummer heeft', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');

  await expect(page.locator('#content')).toContainText('2 van 5 hebben een nummer');
  await expect(page.locator('#content .card:not(#importKaart) h3')).toHaveText(['Coördinatoren', 'Vaste krachten', 'Teamleiders']);

  await page.getByText('Alleen wie nog geen nummer heeft').click();
  await expect(page.locator('#content .list-item')).toHaveCount(3);

  await page.getByText('Alleen wie nog geen nummer heeft').click();
  await page.getByPlaceholder('naam of team').fill('els');
  await expect(page.locator('#content .list-item')).toHaveCount(1);
  await expect(page.locator('#content .list-item')).toContainText('Els Bakker');
});

test('de coördinator vult in Contact een nummer in', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: CONTACTEN.map((c) => ({ ...c })) });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');

  const rij = page.locator('.list-item[data-kind="team"][data-ref="t2"]');
  await rij.locator('input').fill('0687 65 43 21');
  await rij.locator('input').blur();
  await expect.poll(() => s.rpc.filter((r) => r.fn === 'contact_set').length).toBe(1);
  expect(s.rpc.find((r) => r.fn === 'contact_set').body)
    .toEqual({ p_kind: 'team', p_ref_id: 't2', p_phone: '+31687654321' });
  const nieuw = page.locator('.list-item[data-kind="team"][data-ref="t2"]');
  await expect(nieuw.locator('a.telbtn.wa')).not.toHaveClass(/uit/);
});

test('een vaste kracht ziet geen tabblad Contact en vraagt geen nummers op', async ({ page }) => {
  const s = stand({ rol: 'vast', contacts: CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await expect(page.locator('#navbar button[data-tab="contact"]')).toBeHidden();
  expect(s.rpc.filter((r) => r.fn === 'contact_list')).toHaveLength(0);
});

test('zonder de nieuwe database-functies meldt Contact wat er ontbreekt', async ({ page }) => {
  const s = stand({ rol: 'admin', geenTelefoonMigratie: true });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  await expect(page.locator('#content')).toContainText('telefoon-migratie.sql');
});

// ---------- Nummers bijwerken uit Excel (in het tabblad Contact) ----------

const IMPORT_CONTACTEN = [
  { kind: 'staff', ref_id: 'p1', naam: 'Leonne Wiekstra', groep: 'Vaste kracht', telefoon: '', knvb: '', bron: '' },
  { kind: 'staff', ref_id: 'p2', naam: 'Inge', groep: 'Vaste kracht', telefoon: '', knvb: '', bron: '' },
  { kind: 'staff', ref_id: 'p3', naam: 'Kees Phielix', groep: 'Vaste kracht', telefoon: '+31600000000', knvb: '', bron: 'app' },
  { kind: 'staff', ref_id: 'p4', naam: 'Sanne Wiekstra', groep: 'Vaste kracht', telefoon: '', knvb: '', bron: '' },
  { kind: 'staff', ref_id: 'p5', naam: 'Dolf', groep: 'Vaste kracht', telefoon: '', knvb: '', bron: '' },
  { kind: 'profile', ref_id: 'u1', naam: 'Charlene Ripassa', groep: 'Beheerder', telefoon: '+31622222222', knvb: '', bron: 'excel' },
];

// Zelfde kolommen als "Barvrijwilligers 2026-2027.xlsx", als CSV met puntkomma's
const CSV = [
  'Groep;Commissie;Functie;Roepnaam;Tv;Achternaam;Telefoon;KNVB bondsnummer;KNVB Bondsnummer kind;Jaar;Team;E-Mail;inzetbaar',
  ';;Bar coordinator;Leonne;;Wiekstra;06-11111111;;;;;;Flexkracht',          // volledige naam
  ';;Barvrijwilliger;Inge;;;06-22222222;;;;;;Zaterdag',                       // alleen roepnaam, app heeft "Inge"
  ';;Barvrijwilliger;Kees;;Phielix;06-33333333;;;;;;Flexkracht',             // in app zelf ingevuld
  ';;Jeugdpoule ;Sanne;;Wiekstra;06-44444444;;;;;;Zaterdag',                 // jeugdpoule
  ';;Barvrijwilliger;Dolf;;Heebing;06-55555555;KNVB9;;;;;Flexkracht',        // op roepnaam
  ';;Bar coordinator;Charlene;;Ripassa;06-22222222;;;;;;nvt',                // al gelijk
  ';;Barvrijwilliger;Nieuwe;;Vrijwilliger;06-66666666;;;;;;zaterdag',        // niet gevonden
  ';;Barvrijwilliger;Rick;;Schonis;06-77777777;;;;;;niet meer actief',       // overslaan
  ';;Barvrijwilliger;Femke;;Heuvel;;;;;;;?',                                 // geen nummer
].join('\n');

async function leesIn(page) {
  await naarTab(page, 'contact');
  await page.locator('#importKaart input[type=file]').setInputFiles({ name: 'vrijwilligers.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await page.locator('#importKaart').getByRole('button', { name: 'Inlezen' }).click();
  await expect(page.locator('#content')).toContainText('Overzicht: vrijwilligers.csv');
}
const rij = (page, n) => page.locator(`.imprij[data-rij="${n}"]`);

test('import: het overzicht koppelt, slaat over en laat twijfelgevallen uit staan', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await leesIn(page);

  await expect(page.locator('#content')).toContainText('5 gekoppeld · 1 al gelijk · 1 niet gevonden · 2 overgeslagen');
  await expect(rij(page, 2)).toHaveAttribute('data-status', 'koppel');
  await expect(rij(page, 2).locator('input[type=checkbox]')).toBeChecked();
  await expect(rij(page, 3).locator('input[type=checkbox]')).toBeChecked();     // Inge op roepnaam
  await expect(rij(page, 4).locator('input[type=checkbox]')).not.toBeChecked(); // Kees: in app ingevuld
  await expect(rij(page, 4)).toContainText('in de app ingevuld');
  await expect(rij(page, 5).locator('input[type=checkbox]')).not.toBeChecked(); // jeugdpoule
  await expect(rij(page, 6)).toContainText('→ Dolf (op roepnaam)');
  await expect(rij(page, 7)).toHaveAttribute('data-status', 'gelijk');
  await expect(rij(page, 8)).toHaveAttribute('data-status', 'geen');
  await expect(rij(page, 9)).toContainText('niet meer actief');
  await expect(rij(page, 10)).toContainText('geen telefoonnummer');
  // een coördinator mag geen vaste krachten toevoegen
  await expect(rij(page, 8).locator('input[type=checkbox]')).toHaveCount(0);
  // er is nog niets opgeslagen
  expect(s.rpc.filter((r) => r.fn === 'contact_import')).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Opslaan (3)' })).toBeVisible();
});

test('import: opslaan stuurt alleen de aangevinkte regels, in +31-vorm', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await leesIn(page);

  await rij(page, 5).locator('input[type=checkbox]').check();   // jeugdpoule toch meenemen
  await rij(page, 2).locator('input[type=checkbox]').uncheck(); // Leonne niet
  await page.getByRole('button', { name: 'Opslaan (3)' }).click();

  await expect.poll(() => s.rpc.filter((r) => r.fn === 'contact_import').length).toBe(1);
  const rows = s.rpc.find((r) => r.fn === 'contact_import').body.p_rows;
  expect(rows).toEqual([
    { kind: 'staff', ref_id: 'p2', telefoon: '+31622222222', knvb: '' },
    { kind: 'staff', ref_id: 'p4', telefoon: '+31644444444', knvb: '' },
    { kind: 'staff', ref_id: 'p5', telefoon: '+31655555555', knvb: 'KNVB9' },
  ]);
  // terug naar de gewone lijst, die opnieuw is opgehaald
  await expect(page.locator('#content')).not.toContainText('Overzicht:');
  expect(s.rpc.filter((r) => r.fn === 'contact_list').length).toBeGreaterThan(1);
});

test('import: annuleren slaat niets op', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await leesIn(page);
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(page.locator('#importKaart')).toBeVisible();
  expect(s.rpc.filter((r) => r.fn === 'contact_import')).toHaveLength(0);
});

test('import: de beheerder kan iemand die niet gevonden is als vaste kracht toevoegen', async ({ page }) => {
  const s = stand({ rol: 'admin', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await leesIn(page);

  for (const n of [2, 3, 6]) await rij(page, n).locator('input[type=checkbox]').uncheck();
  await rij(page, 8).locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Opslaan (1)' }).click();

  await expect.poll(() => s.rpc.filter((r) => r.fn === 'contact_import').length).toBe(1);
  expect(s.posts.filter((p) => p.tabel === 'bar_staff').map((p) => p.body)).toEqual([{ name: 'Nieuwe Vrijwilliger' }]);
  const rows = s.rpc.find((r) => r.fn === 'contact_import').body.p_rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: 'staff', telefoon: '+31666666666' });
});

test('import: iemand die zowel vaste kracht als coördinator is, krijgt het nummer in beide rollen', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: [
    { kind: 'staff', ref_id: 'p1', naam: 'Leonne Wiekstra', telefoon: '', knvb: '', bron: '' },
    { kind: 'profile', ref_id: 'u7', naam: 'Leonne Wiekstra', telefoon: '', knvb: '', bron: '' },
  ] });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await leesIn(page);
  await expect(rij(page, 2)).toHaveAttribute('data-status', 'koppel');
  await page.getByRole('button', { name: /^Opslaan/ }).click();
  await expect.poll(() => s.rpc.filter((r) => r.fn === 'contact_import').length).toBe(1);
  expect(s.rpc.find((r) => r.fn === 'contact_import').body.p_rows.filter((r) => r.telefoon === '+31611111111'))
    .toEqual([
      { kind: 'staff', ref_id: 'p1', telefoon: '+31611111111', knvb: '' },
      { kind: 'profile', ref_id: 'u7', telefoon: '+31611111111', knvb: '' },
    ]);
});

test('import: alles aanvinken werkt per groep', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await leesIn(page);
  const gekoppeld = page.locator('.card', { hasText: 'Gekoppeld (5)' });
  await gekoppeld.getByRole('button', { name: 'Alles aanvinken' }).click();
  await expect(page.getByRole('button', { name: 'Opslaan (5)' })).toBeVisible();
  await gekoppeld.getByRole('button', { name: 'Alles uitvinken' }).click();
  await expect(page.getByRole('button', { name: 'Niets geselecteerd' })).toBeDisabled();
});
