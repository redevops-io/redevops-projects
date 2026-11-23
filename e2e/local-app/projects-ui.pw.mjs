// Playwright checks for the Projects UI served by the sidekick image (public-demo mode, sample provider), run against
// a LOCAL app only (APP_URL, default http://127.0.0.1:8292, base path /projects). Synthetic data; no credentials.
//   needs: @playwright/test, @axe-core/playwright (npm i -D) and a running app, e.g. the one built by
//          agentic-os-enterprise with PROJECTS_PUBLIC_DEMO=1 PROJECTS_PROVIDER=sample PUBLIC_BASE_PATH=/projects
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP = process.env.APP_URL || 'http://127.0.0.1:8292';
const URL = `${APP}/projects/`;
const SHOTS = process.env.SHOTS_DIR || 'test-results';
const API = '**/projects/api/**';
const primary = (page, name) => page.locator('nav[aria-label=Primary]').getByRole('button', { name });
const badge = (page) => page.locator('header.topbar .pill');

async function open(page, hash = '') {
  await page.goto(URL + hash);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /need(s)? your decision/ })).toBeVisible();
}

test.describe('failure states: offline and HTTP 500', () => {
  const modes = {
    offline: (r) => r.abort('connectionrefused'),
    'HTTP 500': (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }),
  };
  for (const [name, fail] of Object.entries(modes)) {
    test(`a screen that cannot load shows an error and a retry, never "Loading…" or "Healthy" (${name})`, async ({ page }) => {
      await open(page);
      await expect(badge(page)).toContainText('Healthy');                        // sanity: it starts healthy (sample)
      await page.route(API, fail);
      await primary(page, /^Activity/).click();
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expect(page.locator('main')).not.toContainText('Loading…');
      await expect(badge(page)).not.toContainText('Healthy');
      await expect(badge(page)).toContainText("Can't reach runtime");
      await expect(page).toHaveTitle("Can't reach runtime · Activity · ReDevOps");   // no stale "(12) Today"
      await page.screenshot({ path: `${SHOTS}/err-${name.replace(/\W/g, '')}-1280.png` });
      // recovery: the runtime comes back, "Try again" works, the badge returns to healthy and the title to the section
      await page.unroute(API);
      await alert.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(badge(page)).toContainText('Healthy');
      await expect(page).toHaveTitle(/^(\(\d+\) )?Activity · ReDevOps$/);
    });

    test(`the first load failing is an error state too (${name})`, async ({ page }) => {
      await page.route(API, fail);
      await page.goto(URL);
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible();
      await expect(badge(page)).toContainText("Can't reach runtime");
      await expect(badge(page)).not.toContainText('Healthy');
      await expect(page.locator('header.topbar .proj')).not.toContainText('Loading…');
      await expect(page).toHaveTitle("Can't reach runtime · Today · ReDevOps");
      for (const tab of [/^Work/, /^Automations/, /^Connections/]) {            // (Settings > General is static example text, no read)
        await primary(page, tab).click();
        await expect(page.getByRole('alert').first()).toBeVisible();
        await expect(page.locator('main')).not.toContainText('Loading…');
      }
    });
  }

  test('a route this deployment does not serve is described as such, not as an outage', async ({ page }) => {
    await open(page);
    await page.route('**/projects/api/projects/*/deployment-inspection', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' }));
    await primary(page, /^Connections/).click();
    await page.locator('nav.subnav').getByRole('button', { name: 'Deployment health' }).click();
    await expect(page.getByText("Deployment health isn't available on this deployment")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });
});

test.describe('document title and badge on a healthy app', () => {
  test('title follows the section; badge says the data is sample', async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle(/^\(\d+\) Today · ReDevOps$/);
    await primary(page, /^Activity/).click();
    await expect(page).toHaveTitle(/^\(\d+\) Activity · ReDevOps$/);
    await expect(badge(page)).toHaveText(/Healthy \(sample\)/);
  });
});

test.describe('notifications never cover the content', () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 375, height: 800 }]) {
    test(`toasts are in the page flow and "Open in Attention" / "Technical details" receive clicks (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await open(page);
      const toasts = page.getByRole('status', { name: 'New items that need you' });
      await expect(toasts).toBeVisible();
      const tb = await toasts.boundingBox(), mb = await page.locator('main').boundingBox();
      expect(await toasts.evaluate((e) => getComputedStyle(e).position)).not.toBe('fixed');
      expect(tb.y + tb.height).toBeLessThanOrEqual(mb.y + 1);                         // entirely above <main>: no overlap
      // select a live-signal item (it has "Open in Attention") and click both controls at their right-hand ends
      const signal = page.locator('.trow', { hasText: /milestone at risk|thread \(P0 lead\)/ }).first();
      await signal.click();
      const open_ = page.getByRole('button', { name: 'Open in Attention' });
      await expect(open_).toBeVisible();
      for (const target of [open_, page.locator('details.tech summary')]) {
        await target.scrollIntoViewIfNeeded();
        const b = await target.boundingBox();
        for (const fx of [0.1, 0.5, 0.95]) {
          const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !e.closest('.toasts'); }, [b.x + b.width * fx, b.y + b.height / 2]);
          expect(hit, `a toast is over ${await target.innerText()} at ${fx}`).toBe(true);
        }
      }
      await open_.click();                                                            // not intercepted: lands on Attention
      await expect(page.getByRole('heading', { level: 1, name: 'Attention' })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/toasts-${vp.width}.png` });
    });
  }
});

test.describe('honest labelling', () => {
  test('sample data is labelled at the top of every screen, with no mock/standalone/execution claims', async ({ page }) => {
    await open(page);
    await expect(page.locator('.banner').first()).toContainText('Sample data — actions here are simulated; nothing leaves this app.');
    const sections = [['Work', null], ['Work', 'Summary'], ['Activity', null], ['Automations', null], ['Connections', null],
      ['Connections', 'Data sources'], ['Settings', null], ['Settings', 'Sidekick']];
    for (const [dest, tab] of sections) {
      await primary(page, new RegExp('^' + dest)).or(page.locator('nav[aria-label=Settings]').getByRole('button', { name: new RegExp('^' + dest) })).click();
      if (tab) await page.locator('nav.subnav').getByRole('button', { name: tab }).click();
      const note = page.getByRole('note');
      await expect(note).toContainText('Public demo with synthetic sample data.');
      await expect(note).toContainText('nothing is connected to a real system, sent or executed');
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/mock Projects API client|standalone build/i);
    }
  });

  test('the demo Mission control does not claim to run anything; workflow Run/Pause are disabled', async ({ page }) => {
    await open(page);
    await primary(page, /^Connections/).click();
    await page.getByRole('button', { name: 'Show demo Mission (simulated)' }).click();
    await expect(page.getByText('Nothing was started')).toBeVisible();
    await expect(page.getByText('Running demo Mission')).toHaveCount(0);
    await primary(page, /^Automations/).click();
    for (const b of await page.getByRole('button', { name: /^(Run now|Pause)$/ }).all()) await expect(b).toBeDisabled();
  });
});

test.describe('accessibility', () => {
  const screens = [['Today', /^Today/, null], ['Work', /^Work/, null], ['Activity', /^Activity/, null], ['Automations', /^Automations/, null], ['Connections', /^Connections/, null]];
  for (const [name, btn] of screens.map((s) => [s[0], s[1]])) {
    test(`no serious or critical axe violations on ${name}; one <main>; nav name carries its visible text`, async ({ page }) => {
      await open(page);
      await primary(page, btn).click();
      await expect(page.locator('main')).toHaveCount(1);
      const res = await new AxeBuilder({ page }).analyze();
      const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
  test('the Today nav button name starts with its visible text and carries the count', async ({ page }) => {
    await open(page);
    const today = primary(page, /^Today/);
    await expect(today).toHaveAccessibleName(/^Today \d+ need you$/);
    await expect(today).not.toHaveAttribute('aria-label', /.+/);
  });
  test('keyboard: Tab reaches the skip link, navigation and the content; Enter activates a nav button', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    const seen = new Set();
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); seen.add(await page.evaluate(() => document.activeElement?.closest('nav')?.getAttribute('aria-label') ?? (document.activeElement?.closest('main') ? 'main' : 'other'))); }
    expect([...seen]).toEqual(expect.arrayContaining(['Primary', 'main']));
    await primary(page, /^Activity/).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();
  });
});

test.describe('375px', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const [name, btn] of [['Today', /^Today/], ['Work', /^Work/], ['Activity', /^Activity/], ['Automations', /^Automations/], ['Connections', /^Connections/]]) {
    test(`no horizontal overflow and no clipped text on ${name}`, async ({ page }) => {
      await open(page);
      await primary(page, btn).click();
      if (name === 'Today') { await page.locator('.trow').first().click(); await page.locator('details.tech summary').click(); }
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const clipped = [...document.querySelectorAll('span.mono, .mono')].filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => e.textContent.slice(0, 40));
        return { sw: document.documentElement.scrollWidth, vw, clipped };
      });
      expect(r.sw).toBeLessThanOrEqual(r.vw);
      expect(r.clipped).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/w375-${name}.png` });
    });
  }
});
