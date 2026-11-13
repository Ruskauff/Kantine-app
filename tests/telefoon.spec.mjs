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
  await expect(page.locator('#content h3')).toHaveText(['Coördinatoren', 'Vaste krachten', 'Teamleiders']);

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
