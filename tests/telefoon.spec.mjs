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
  await expect(page.locator('a.telbtn:not(.deelteam)')).toHaveCount(0);
  // de deelknop bevat geen nummer: de teamleider kiest zelf de groep
  for (const h of await page.locator('a.deelteam').evaluateAll((els) => els.map((e) => e.getAttribute('href'))))
    expect(h).toMatch(/^https:\/\/wa\.me\/\?text=/);
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
  await expect(page.locator('#content .card:not(#importKaart):not(#roosterRonde) h3')).toHaveText(['Coördinatoren', 'Vaste krachten', 'Teamleiders']);

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

test('import: teamleiders gaan naar hun team, ook als het team als O10-1 in de Excel staat', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: [
    { kind: 'team', ref_id: 't1', naam: 'JO10-1', telefoon: '', knvb: '', bron: '' },
    { kind: 'team', ref_id: 't2', naam: 'JO10-2', telefoon: '+31699999999', knvb: '', bron: 'app' },
    { kind: 'team', ref_id: 't3', naam: 'MO10-1', telefoon: '', knvb: '', bron: '' },
    { kind: 'staff', ref_id: 'p1', naam: 'Kees Phielix', telefoon: '', knvb: '', bron: '' },
  ] });
  const csv = [
    'Team;Rol;Roepnaam;Tussenvoegsel;Achternaam;Telefoon;KNVB bondsnummer',
    'O10-1;teamleider;Marcel;;Remak;06-11111111;THVG79Y',
    'O10-1;teamleider;Tweede;;Leider;06-22222222;',
    'JO10-2;TL;Oktay;;Özcan;06-33333333;',
    'O10-9;teamleider;Nergens;;Team;06-44444444;',
    'JO11-3;Barvrijwilliger;Kees;;Phielix;06-55555555;',   // team-kolom, maar geen teamleider
  ].join('\n');
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  await page.locator('#importKaart input[type=file]').setInputFiles({ name: 'tl.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.locator('#importKaart').getByRole('button', { name: 'Inlezen' }).click();

  await expect(rij(page, 2)).toContainText('→ teamleider JO10-1');
  await expect(rij(page, 2).locator('input[type=checkbox]')).toBeChecked();
  await expect(rij(page, 3)).toHaveAttribute('data-status', 'overslaan');      // tweede TL
  await expect(rij(page, 4).locator('input[type=checkbox]')).not.toBeChecked(); // zelf ingevuld
  await expect(rij(page, 5)).toHaveAttribute('data-status', 'geen');
  await expect(rij(page, 5).locator('input[type=checkbox]')).toHaveCount(0);   // geen "toevoegen als vaste kracht"
  await expect(rij(page, 6)).toContainText('Kees Phielix');
  await page.getByRole('button', { name: 'Opslaan (2)' }).click();
  await expect.poll(() => s.rpc.filter((r) => r.fn === 'contact_import').length).toBe(1);
  expect(s.rpc.find((r) => r.fn === 'contact_import').body.p_rows).toEqual([
    { kind: 'team', ref_id: 't1', telefoon: '+31611111111', knvb: 'THVG79Y' },
    { kind: 'staff', ref_id: 'p1', telefoon: '+31655555555', knvb: '' },
  ]);
});

test('import: een bestand op het vak slepen leest het meteen in', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  await page.evaluate((csv) => {
    const dt = new DataTransfer();
    dt.items.add(new File([csv], 'gesleept.csv', { type: 'text/csv' }));
    const zone = document.querySelector('#importZone');
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, CSV);
  await expect(page.locator('#content')).toContainText('Overzicht: gesleept.csv');
  await expect(page.locator('#content')).toContainText('5 gekoppeld');
});

test('import: een ander soort bestand slepen wordt geweigerd', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: IMPORT_CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'foto.jpg', { type: 'image/jpeg' }));
    document.querySelector('#importZone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#saving')).toContainText('Alleen Excel');
  await expect(page.locator('#importKaart')).toBeVisible();
});

test('teamleider: "Deel in de teamapp" zet de open plekken automatisch in het bericht', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);
  const knop = page.locator('a.deelteam').first();
  const bericht = async () => decodeURIComponent((await knop.getAttribute('href')).split('text=')[1]);
  await expect(knop).toBeVisible();
  expect(await knop.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);   // geen nummer: zelf de groep kiezen

  let t = (await bericht()).split('\n');
  expect(t[0]).toMatch(/hebben wij \(JO11-1\) kantinedienst\.$/);
  expect(t).toContain('Nog open:');
  expect(t).toContain('• Blok 1 (08:00–11:00): bar');
  expect(t).toContain('• Blok 2 (11:00–14:00): bar');
  expect(t).toContain('Extra hulp is welkom in Blok 1 en Blok 2.');
  expect(t.at(-1)).toBe('Wie kan? Laat het me weten, dan zet ik je erin.');

  // verplichte plek in blok 1 ingevuld: blok 1 staat niet meer in de lijst
  await page.locator('.sat .block').first().locator('input[type=checkbox]').first().check();
  t = (await bericht()).split('\n');
  expect(t.some((r) => r.startsWith('• Blok 1'))).toBe(false);
  expect(t).toContain('• Blok 2 (11:00–14:00): bar');

  // optionele plek in blok 1 ook gevuld: extra hulp alleen nog in blok 2
  await page.locator('.sat .block').first().locator('input[type=checkbox]').nth(1).check();
  expect((await bericht()).split('\n')).toContain('Extra hulp is welkom in Blok 2.');

  // alle verplichte plekken gevuld: de knop verdwijnt
  await page.locator('.sat .block').nth(1).locator('input[type=checkbox]').first().check();
  await expect(knop).toBeHidden();
});

// ---------- Barrooster delen met vaste krachten ----------

function roosterStand(extra = {}) {
  return stand({
    rol: 'barco',
    contacts: [
      { kind: 'staff', ref_id: 'p1', naam: 'Wito', telefoon: '', knvb: '', bron: '' },
      { kind: 'staff', ref_id: 'p2', naam: 'Els Bakker', telefoon: '+31687654321', knvb: '', bron: 'excel' },
    ],
    saturdays: [
      { id: 's0', date: dag(-7), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null },
      { id: 's1', date: dag(7), team_id: 't2', team_status: {}, label: '', blocks: null, bar_shifts: null },
      { id: 's2', date: dag(14), team_id: 't3', team_status: {}, label: 'Toernooi', blocks: null, bar_shifts: null },
      { id: 's9', date: dag(70), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null },
    ],
    barAssignments: [
      { saturday_id: 's0', shift_id: 'v1', staff_id: 'p2' },   // al geweest
      { saturday_id: 's1', shift_id: 'v1', staff_id: 'p2' },
      { saturday_id: 's2', shift_id: 'v2', staff_id: 'p2' },
      { saturday_id: 's2', shift_id: 'v1', staff_id: 'p1' },
      { saturday_id: 's9', shift_id: 'v1', staff_id: 'p2' },   // verder dan 4 weken
    ],
    ...extra,
  });
}

test('rooster: een vaste kracht krijgt zijn komende diensten via WhatsApp', async ({ page }) => {
  const s = roosterStand();
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  const knop = page.locator('.list-item[data-ref="p2"] a.roosterbtn');
  await expect(knop).toHaveText('📅 Stuur rooster (3)');
  const href = await knop.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/31687654321\?text=/);
  const t = decodeURIComponent(href.split('text=')[1]).split('\n');
  expect(t[0]).toBe('Hoi Els, je staat ingedeeld voor de bar:');
  expect(t.filter((r) => r.startsWith('• '))).toHaveLength(3);          // de afgelopen dienst niet
  expect(t[1]).toContain('Ochtend 07:30–12:00');
  expect(t[2]).toContain('(Toernooi) — Middag 12:00–16:00');
  // zonder nummer: knop uit
  await expect(page.locator('.list-item[data-ref="p1"] a.roosterbtn')).toHaveClass(/uit/);
});

test('rooster: iedereen na elkaar zijn rooster sturen', async ({ page }) => {
  const s = roosterStand({ contacts: [
    { kind: 'staff', ref_id: 'p1', naam: 'Wito', telefoon: '+31611111111', knvb: '', bron: '' },
    { kind: 'staff', ref_id: 'p2', naam: 'Els Bakker', telefoon: '+31687654321', knvb: '', bron: '' },
  ] });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  const kaart = page.locator('#roosterRonde');
  await expect(kaart).toContainText('2 vaste krachten met een nummer');
  await kaart.getByRole('button', { name: 'Stuur iedereen zijn rooster' }).click();
  await expect(kaart).toContainText('1 van 2: Els Bakker');
  expect(await kaart.getByRole('link', { name: 'Open WhatsApp' }).getAttribute('href')).toMatch(/wa\.me\/31687654321/);
  await kaart.getByRole('button', { name: 'Overslaan' }).click();
  await expect(kaart).toContainText('2 van 2: Wito');
  await kaart.getByRole('button', { name: 'Overslaan' }).click();
  await expect(kaart).toContainText('Klaar');
});

test('rooster: het barrooster van de komende 4 weken delen in de groep', async ({ page }) => {
  const s = roosterStand();
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'overzicht');
  const knop = page.locator('a.deelrooster');
  await expect(knop).toBeVisible();
  const href = await knop.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const t = decodeURIComponent(href.split('text=')[1]);
  expect(t).toContain('Barrooster komende 4 weken:');
  expect(t).toContain('• Ochtend 07:30–12:00: Els Bakker');
  expect(t).toContain('• Ochtend 07:30–12:00: Wito');
  expect(t).toContain('— Toernooi*');
  expect(t).toContain('• Middag 12:00–16:00: nog open');
  expect(t).toContain('Nog 1 dienst open.');
  expect(t.match(/^\*/gm)).toHaveLength(2);   // twee zaterdagen: geen verleden, niets na 4 weken
});

test('rooster: een vaste kracht ziet de deelknop voor het barrooster niet', async ({ page }) => {
  const s = roosterStand({ rol: 'vast' });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'overzicht');
  await expect(page.locator('a.deelrooster')).toHaveCount(0);
});

// ---------- Rooster JO10 t/m JO16 en noodoproep ----------

test('rotatie: alleen JO10 t/m JO16, lichtingen gemengd zoals de SQL', async ({ page }) => {
  await page.goto('/');
  const volgorde = await page.evaluate(() => rotatieTeams([
    'JO7-1', 'JO9-2', 'JO10-1', 'JO10-2', 'JO11-1', 'JO12-1', 'JO13-1', 'JO14-1', 'JO15-1', 'JO16-1', 'JO16-2',
    'JO17-1', 'JO19-1', 'MO13-1', 'MO15-1', 'Zaterdag 1', 'JO 12-2',
  ].map((name, i) => ({ id: 'x' + i, name }))).map((t) => t.name));
  expect(volgorde).toEqual([
    // ronde 1: JO10, JO16, JO11, JO15, JO12, JO14, JO13
    'JO10-1', 'JO16-1', 'JO11-1', 'JO15-1', 'JO12-1', 'JO14-1', 'JO13-1',
    // ronde 2: alleen lichtingen met een tweede team
    'JO10-2', 'JO16-2', 'JO 12-2',
  ]);
});

test('noodoproep: teamleiders buiten het rooster één voor één, met wat er open is', async ({ page }) => {
  const s = stand({
    rol: 'barco',
    teams: [{ id: 'a', name: 'JO12-1', sort: 1 }, { id: 'j9', name: 'JO9-1', sort: 2 }, { id: 'j17', name: 'JO17-1', sort: 3 }, { id: 'm', name: 'MO13-1', sort: 4 }],
    saturdays: [{ id: 's1', date: dag(7), team_id: 'a', team_status: { b1: [{ done: true, name: 'A' }, { done: false, name: '' }] }, label: '', blocks: null, bar_shifts: null }],
    contacts: [
      { kind: 'team', ref_id: 'a', naam: 'JO12-1', telefoon: '+31611111111', knvb: '', bron: '' },   // in het rooster: niet
      { kind: 'team', ref_id: 'j9', naam: 'JO9-1', telefoon: '+31622222222', knvb: '', bron: '' },
      { kind: 'team', ref_id: 'j17', naam: 'JO17-1', telefoon: '+31633333333', knvb: '', bron: '' },
      { kind: 'team', ref_id: 'm', naam: 'MO13-1', telefoon: '', knvb: '', bron: '' },               // geen nummer: niet
    ],
  });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await page.locator('.sathead').first().click();
  await page.getByRole('button', { name: '🚨 Noodoproep aan andere teams' }).click();

  const kaart = page.locator('#roosterRonde');
  await expect(page.locator('#navbar button[data-tab="contact"]')).toHaveClass(/on/);
  await expect(kaart).toContainText('Noodoproep');
  await expect(kaart).toContainText('1 van 2: teamleider JO9-1');
  const t = decodeURIComponent((await kaart.getByRole('link', { name: 'Open WhatsApp' }).getAttribute('href')).split('text=')[1]);
  expect(t).toContain('noodoproep voor de kantine');
  expect(t).toContain('• Blok 2 (11:00–14:00): bar');
  expect(t).not.toContain('Blok 1');                       // blok 1 is al ingevuld
  await kaart.getByRole('button', { name: 'Overslaan' }).click();
  await expect(kaart).toContainText('2 van 2: teamleider JO17-1');
});

// ---------- Berichtteksten (vastgesteld 13-11-2026) ----------

test('berichten: coördinator naar teamleider, met open plekken, adres en afzender', async ({ page }) => {
  const s = stand({ rol: 'barco', contacts: CONTACTEN,
    saturdays: [{ id: 's1', date: dag(7), team_id: 't1', team_status: { b1: [{ done: true, name: 'A' }, { done: false, name: '' }] }, label: '', blocks: null, bar_shifts: null }] });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await page.locator('.sathead').first().click();
  const t = decodeURIComponent((await page.locator('.contactrij a.telbtn.wa').getAttribute('href')).split('text=')[1]).split('\n');
  expect(t[0]).toMatch(/^Hoi! .+ heeft JO11-1 kantinedienst en er staat nog open:$/);
  expect(t).toContain('• Blok 2 (11:00–14:00): bar');
  expect(t.some((r) => r.startsWith('• Blok 1'))).toBe(false);
  expect(t).toContain('Wil je de namen in de app zetten? 127.0.0.1:4173');
  expect(t.at(-1)).toBe('Groet, Wito — barcoördinator Arnhemse Boys');
});

test('berichten: algemeen bericht uit Contact, en de beheerder tekent als kantinecommissie', async ({ page }) => {
  const s = stand({ rol: 'admin', contacts: CONTACTEN });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'contact');
  const staff = decodeURIComponent((await page.locator('.list-item[data-ref="p2"] a.telbtn.wa').first().getAttribute('href')).split('text=')[1]);
  expect(staff).toBe('Hoi Els, met Wito, kantinecommissie van Arnhemse Boys. ');
  const team = decodeURIComponent((await page.locator('.list-item[data-ref="t1"] a.telbtn.wa').first().getAttribute('href')).split('text=')[1]);
  expect(team).toBe('Hoi, met Wito, kantinecommissie van Arnhemse Boys. ');
});

test('berichten: persoonlijk rooster en noodoproep eindigen met de afzender', async ({ page }) => {
  await page.goto('/');
  const [rooster, nood] = await page.evaluate(() => {
    session = { kind: 'account', role: 'barco', name: 'Leonne Wiekstra' };
    config = { blocks: [{ id: 'b1', label: 'Blok 1', start: '08:00', end: '11:00', tasks: ['Bar (verplicht)'] }], bar_shifts: [{ id: 'v1', label: 'Ochtend', start: '07:30', end: '12:00' }] };
    const d = new Date(); d.setDate(d.getDate() + 7);
    const iso = d.toISOString().slice(0, 10);
    data = { saturdays: [{ id: 's1', date: iso, team_status: {}, bar: { v1: ['p2'] } }], barStaff: [], teams: [] };
    return [berichtRooster('p2', 'Els Bakker'), berichtNoodoproep(data.saturdays[0])];
  });
  expect(rooster.split('\n').at(-1)).toBe('Groet, Leonne — barcoördinator Arnhemse Boys');
  expect(rooster.split('\n')[0]).toBe('Hoi Els, je staat ingedeeld voor de bar:');
  expect(nood.split('\n').at(-1)).toBe('Groet, Leonne — barcoördinator Arnhemse Boys');
  expect(nood).toContain('• Blok 1 (08:00–11:00): bar');
});
