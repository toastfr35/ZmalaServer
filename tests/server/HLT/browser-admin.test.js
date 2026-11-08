// @test S-HLT-023
// @requirements HLR-SRV-UI-010, HLR-SRV-UI-011
// @environment display
// @plan Run the assembled HTTP application against isolated persistent state and open its actual assets in Chromium, without API mocks. Set a password through the page, navigate six pages at 320 and 1920 pixels, save terminal call volume and confirm its persisted value, create an account, provoke an opening-revision conflict from a second client, and cancel the retained draft. Reload to check the accepted account and sign out to check the session boundary.
// Save from a different terminal section. An invalid field in a collapsed section must reopen it before submission.
// Save USB power and the TV model, then submit TV test outcomes as the enrolled Terminal and verify they render.
// @pass The real service must persist accepted input, reject the stale edit, retain its visible draft, and fit both viewports without page-wide horizontal scrolling. This is browser integration evidence, not a physical touch-device test.

'use strict';
/* global document, innerWidth -- These names are used only inside Chromium callbacks. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { httpFixture } = require('../../support/server/http-fixture');
const { Store } = require('../../../zmala_server/store');
const { version } = require('../../../VERSION.json');

test(
  'phone and desktop browser edits use real authentication, persistence and revision checks',
  { timeout: 30000 },
  async (t) => {
    const fixture = await httpFixture();
    t.after(() => fixture.close());
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(fixture.base);
    await page.getByLabel('Admin password', { exact: true }).fill('browser-fixture-password');
    await page
      .getByLabel('Confirm admin password', { exact: true })
      .fill('browser-fixture-password');
    await page.getByRole('button', { name: 'Set password', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    for (const width of [320, 1920]) {
      await page.setViewportSize({ width, height: 740 });
      for (const [route, heading] of [
        ['/', ''],
        ['/accounts', 'Accounts'],
        ['/groups', 'Groups'],
        ['/terminals', 'Terminals'],
        ['/callbacks', 'Callbacks'],
        ['/activity', 'Activity'],
      ]) {
        t.diagnostic(`Checking ${width} ${route}`);
        await page.goto(fixture.base + route);
        await page.waitForFunction(
          (expected) => document.querySelector('h1')?.textContent === expected,
          heading,
        );
        await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
        assert.equal(await page.locator('h1').innerText(), heading);
        const versionLabel = page.locator('.server-version');
        assert.equal(await versionLabel.innerText(), 'v' + version);
        const versionBox = await versionLabel.boundingBox();
        const themeBox = await page.locator('#theme-toggle').boundingBox();
        assert.ok(
          versionBox.x >= themeBox.x + themeBox.width && versionBox.x + versionBox.width <= width,
        );
        assert.ok(
          Math.abs(versionBox.y + versionBox.height / 2 - themeBox.y - themeBox.height / 2) <= 2,
        );
        if (route === '/')
          await page.getByRole('heading', { name: 'Keep your family connected.' }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${width}: ${route}`,
        );
      }
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(fixture.base + '/terminals');
    await page.locator('.terminal-calls > summary').click();
    const autoAnswer = page.getByRole('switch', { name: 'Auto-answer incoming calls' });
    await autoAnswer.check();
    await page.locator('input[name=countdown]').fill('1');
    await page.locator('.terminal-general > summary').click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    assert.equal(
      await page.locator('.terminal-section[open]').getAttribute('data-section'),
      'calls',
    );
    await page.locator('input[name=countdown]').fill('5');
    await autoAnswer.uncheck();
    await page.locator('.terminal-audio > summary').click();
    await page.getByRole('combobox', { name: /^Call volume/ }).selectOption('65');
    assert.equal(await page.locator('.terminal-save-state').innerText(), 'Unsaved settings');
    await page.locator('.terminal-general > summary').click();
    await page.getByRole('combobox', { name: /^Language/ }).scrollIntoViewIfNeeded();
    await page.getByRole('combobox', { name: /^USB power/ }).selectOption('camera_and_dock');
    await page.getByRole('combobox', { name: /^TV model/ }).selectOption('cec');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByText('Saved terminal settings for term1.', { exact: true }).waitFor();
    assert.equal(new Store(fixture.directory).value.profiles.term1.c20_speaker_volume, 65);
    const terminal = fixture.store.config('term1');
    assert.equal(terminal.usb_power, 'camera_and_dock');
    assert.equal(terminal.tv_profile, 'cec');
    assert.equal(await page.locator('.terminal-save-state').innerText(), 'Settings saved');
    assert.equal(
      await page.locator('.terminal-section[open]').getAttribute('data-section'),
      'general',
    );
    const result = await fetch(fixture.base + '/api/device/settings', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + fixture.store.value.users.term1.device_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        settings: {
          tv_test_results: {
            device_id: terminal.device_id,
            profile: 'cec',
            power: 'passed',
            source: 'failed',
            power_attempts: 1,
            source_attempts: 2,
          },
        },
        expected: { tv_test_results: null },
      }),
    });
    assert.equal(result.status, 200, await result.text());
    await page.reload();
    await page.locator('.terminal-general > summary').click();
    await page.getByText(/Power: Passed \(1 attempt\).*Input: Failed \(2 attempts\)/).waitFor();
    await page.goto(fixture.base + '/accounts');
    await page.getByRole('button', { name: 'New account', exact: true }).click();
    await page.locator('#edit-name').fill('Browser fixture');
    await page.locator('#edit-id').fill('browserfixture');
    await page.locator('#edit-emails').fill('browser@example.test');
    await page.locator('#account-save').click();
    await page.locator('#account-dialog').waitFor({ state: 'hidden' });
    assert.equal(new Store(fixture.directory).value.users.browserfixture.name, 'Browser fixture');
    await page
      .getByText('Created browserfixture. Add it to a group to enable calls.', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'New account', exact: true }).click();
    await page.locator('#edit-name').fill('Retained draft');
    await page.locator('#edit-id').fill('staledraft');
    await page.locator('#edit-emails').fill('draft@example.test');
    const response = await page.request.post(fixture.base + '/api/groups', {
      headers: { Origin: fixture.base },
      data: { name: 'Concurrent editor', members: [] },
    });
    assert.equal(response.status(), 201);
    const rejected = page.waitForResponse(
      (r) => r.url().endsWith('/api/users') && r.request().method() === 'POST',
    );
    await page.locator('#account-save').click();
    assert.equal((await rejected).status(), 409);
    await page
      .locator('#account-error')
      .filter({ hasText: /changed|reopen/i })
      .waitFor();
    assert.equal(await page.locator('#edit-name').inputValue(), 'Retained draft');
    assert.equal(fixture.store.value.users.staledraft, undefined);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByText('Browser fixture', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal((await page.request.get(fixture.base + '/api/admin')).status(), 401);
    assert.deepEqual(errors, []);
  },
);
