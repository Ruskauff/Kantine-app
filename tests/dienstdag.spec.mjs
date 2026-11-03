// De dienstdag zoals hij er sinds november 2026 uitziet:
// per blok één soort dienst met twee plekken, waarvan alleen de eerste
// verplicht is. Een dag is rond zodra per blok die eerste plek gevuld is.
// De vaste bar-krachten zijn er nog wel, maar het kaderlid ziet ze niet.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInAlsTeam, logInMetAccount, komendeZaterdag, dag } from './helpers/app.mjs';

const BLOK = (n) => `#content .block:nth-of-type(${n})`;

/** Vinkt in elk blok de plek met het opgegeven nummer aan (1 = verplicht). */
async function vink(page, plek) {
  const blokken = page.locator('#content .block');
  const n = await blokken.count();
  for (let i = 0; i < n; i++) {
    await blokken.nth(i).locator('input[type=checkbox]').nth(plek - 1).check();
  }
}

test('de verplichte plek maakt de dag rond, de optionele niet', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const kaart = page.locator('#content .sat').first();
  await expect(kaart).toHaveClass(/nogopen/);
  await expect(page.locator('.prlabel').first()).toContainText('0/2 verplichte plekken');

  // alleen de optionele plekken: dat mag de dag niet groen maken
  await vink(page, 2);
  await expect(kaart).toHaveClass(/nogopen/);
  await expect(page.locator('.prlabel').first()).toContainText('0/2 verplichte plekken');

  // nu de verplichte erbij
  await vink(page, 1);
  await expect(kaart).toHaveClass(/rond/);
  await expect(page.locator('.prlabel').first()).toContainText('Rond');
});

test('het blok telt alleen zijn verplichte plekken', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const eerste = page.locator('#content .block').first();
  await expect(eerste.locator('.pill')).toHaveText('0/1');

  await eerste.locator('input[type=checkbox]').first().check();
  await expect(eerste.locator('.pill')).toHaveText('Rond ✓');
  await expect(eerste).toHaveClass(/rond/);
});

test('de optionele plek is als zodanig herkenbaar', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const taken = page.locator('#content .block').first().locator('.task');
  await expect(taken.nth(0)).not.toHaveClass(/optioneel/);
  await expect(taken.nth(1)).toHaveClass(/optioneel/);
  await expect(taken.nth(1)).toContainText('optioneel');
});

test('het kaderlid ziet de vaste bar-kracht niet, de coördinator wel', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);
  await expect(page.locator('#content .barsec')).toHaveCount(0);
  await page.close();
});

test('bij de coördinator staat de vaste bar-kracht er nog gewoon', async ({ page }) => {
  const s = stand({
    rol: 'barco',
    saturdays: [{ id: 's1', date: komendeZaterdag(), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null }],
  });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await page.locator('.sathead').first().click();
  await expect(page.locator('.satbody .barsec')).toHaveCount(1);
  await expect(page.locator('.satbody .barsec')).toContainText('Vaste bar-kracht');
});

test('Ruilen en Aanbieden staan boven de blokken', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const volgorde = await page.evaluate(() => {
    const kaart = document.querySelector('#content .sat');
    const kinderen = Array.from(kaart.children);
    return {
      balk: kinderen.findIndex((k) => k.classList.contains('swapbar')),
      blok: kinderen.findIndex((k) => k.classList.contains('block')),
    };
  });
  expect(volgorde.balk).toBeGreaterThanOrEqual(0);
  expect(volgorde.balk).toBeLessThan(volgorde.blok);
});

test('de eerstvolgende zaterdag krijgt een markering, de latere niet', async ({ page }) => {
  const s = stand({
    teamSaturdays: [
      { id: 'sv', date: dag(-7), team_status: {}, bar: {}, label: '', blocks: null, bar_shifts: null },
      { id: 's1', date: komendeZaterdag(), team_status: {}, bar: {}, label: '', blocks: null, bar_shifts: null },
      { id: 's2', date: dag(21), team_status: {}, bar: {}, label: '', blocks: null, bar_shifts: null },
    ],
  });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const kaarten = page.locator('#content .sat');
  await expect(kaarten).toHaveCount(3);
  await expect(kaarten.nth(0)).not.toHaveClass(/eerstvolgend/);   // afgelopen
  await expect(kaarten.nth(1)).toHaveClass(/eerstvolgend/);
  await expect(kaarten.nth(2)).not.toHaveClass(/eerstvolgend/);
  await expect(kaarten.nth(1)).toContainText('Eerstvolgende');
});

test('zonder optionele plekken telt alles gewoon mee', async ({ page }) => {
  // belangrijk: clubs die de instelling niet aanpassen mogen niets merken
  const s = stand({
    teamSaturdays: [{
      id: 's1', date: komendeZaterdag(), team_status: {}, bar: {}, label: '',
      blocks: [{ id: 'b1', label: 'Blok 1', start: '08:00', end: '11:00', tasks: ['Bar', 'Keuken'] }],
      bar_shifts: null,
    }],
  });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const blok = page.locator('#content .block').first();
  await expect(blok.locator('.pill')).toHaveText('0/2');
  await blok.locator('input[type=checkbox]').first().check();
  await expect(blok.locator('.pill')).toHaveText('1/2');
  await blok.locator('input[type=checkbox]').nth(1).check();
  await expect(blok.locator('.pill')).toHaveText('Rond ✓');
});

test('de achtergrond is licht en de tekst heeft genoeg contrast', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const r = await page.evaluate(() => {
    const lum = (kleur) => {
      const [r, g, b] = kleur.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const body = getComputedStyle(document.body);
    const muted = getComputedStyle(document.querySelector('.prlabel'));
    const contrast = (a, b) => {
      const l1 = Math.max(lum(a), lum(b)), l2 = Math.min(lum(a), lum(b));
      return (l1 + 0.05) / (l2 + 0.05);
    };
    return {
      achtergrond: lum(body.backgroundColor),
      tekst: contrast(body.color, body.backgroundColor),
      grijzeTekst: contrast(muted.color, body.backgroundColor),
    };
  });

  expect(r.achtergrond).toBeGreaterThan(0.5);        // licht, niet donker
  expect(r.tekst).toBeGreaterThan(7);                // ruim boven de norm
  expect(r.grijzeTekst).toBeGreaterThan(4.5);        // ook de bijschriften
});
