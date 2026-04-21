const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');
const { mockTmdb } = require('./helpers/mockTmdb');

const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

test.beforeEach(async ({ page }) => {
  await mockTmdb(page);
  await page.addInitScript(() => {
    localStorage.setItem('cinova_tmdb_token', 'test-token');
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
  await page.evaluate(() => window.executeSearch && window.executeSearch());

  await expect(page.locator('h2.section-title:has-text("Results for")')).toBeVisible();
  await expect(page.locator('.pagination .page-btn', { hasText: '20' })).toBeVisible();

  await page.locator('.pagination .page-btn', { hasText: '20' }).click();
  await expect(page.locator('.pagination .page-btn.active')).toHaveText('20');
});

test('opens detail modal and closes it with Escape', async ({ page }) => {
  await page.locator('.movie-card .card-open').first().click();

  await expect(page.locator('#modalOverlay')).toHaveClass(/open/);
  await expect(page.locator('#modalContent .modal-title')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#modalOverlay')).not.toHaveClass(/open/);
});

test('persists watchlist after reload and allows removing saved item', async ({ page }) => {
  await page.locator('.movie-grid .card-watchlist').first().click();
  await expect(page.locator('#watchlistCount')).toHaveText('1');

  await page.reload();
  await expect(page.locator('#watchlistCount')).toHaveText('1', { timeout: 15000 });

  await page.locator('.nav-watchlist').click();
  await expect(page.locator('h2.section-title:has-text("Watchlist")')).toBeVisible();

  await page.locator('.movie-grid .card-watchlist.saved').first().click();
  await expect(page.getByText('Your watchlist is empty')).toBeVisible();
});

