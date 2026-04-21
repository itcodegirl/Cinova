const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');
const { mockTmdb } = require('./helpers/mockTmdb');

const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

test.beforeEach(async ({ page }) => {
  await mockTmdb(page);
  await page.addInitScript(() => {
    localStorage.setItem('screenscout_token', 'test-token');
  });
  await page.goto(appUrl);
});

test('loads hero and initial movie sections', async ({ page }) => {
  await expect(page.locator('#setupOverlay')).toBeHidden();
  await expect(page.locator('#heroInfo .hero-title')).toBeVisible();
  await expect(page.locator('.section-title').first()).toContainText('Now Playing');
});

test('search shows pagination and supports jumping to the last page', async ({ page }) => {
  const searchInput = page.locator('#searchInput');

  await searchInput.fill('space');
  await page.evaluate(() => executeSearch());

  await expect(page.locator('h2.section-title:has-text("Results for")')).toBeVisible();
  await expect(page.locator('.pagination .page-btn', { hasText: '20' })).toBeVisible();

  await page.locator('.pagination .page-btn', { hasText: '20' }).click();
  await expect(page.locator('.pagination .page-btn.active')).toHaveText('20');
});
