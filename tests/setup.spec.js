const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');
const { mockTmdb } = require('./helpers/mockTmdb');

const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

test('shows setup guidance when no TMDB token is configured', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.CINOVA_CONFIG;
    localStorage.removeItem('cinova_tmdb_token');
    localStorage.removeItem('screenscout_token');
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toContainText('No TMDB token found');
  await expect(page.locator('#setupRetryBtn')).toBeVisible();
});

test('initializes successfully when CINOVA_CONFIG provides a token', async ({ page }) => {
  await mockTmdb(page);
  await page.addInitScript(() => {
    window.CINOVA_CONFIG = { tmdbReadAccessToken: 'test-token' };
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeHidden();
  await expect(page.locator('#heroInfo .hero-title')).toBeVisible();
});

test('shows token-specific setup error when TMDB rejects token', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', route =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ status_message: 'Invalid API token' })
    })
  );

  await page.addInitScript(() => {
    window.CINOVA_CONFIG = { tmdbReadAccessToken: 'bad-token' };
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toContainText('TMDB rejected your token');
});

test('retry setup reloads updated config token and recovers', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', route => {
    const request = route.request();
    const authHeader = request.headers().authorization || '';
    const url = new URL(request.url());
    const apiPath = url.pathname;

    if (!authHeader.includes('good-token')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ status_message: 'Invalid API token' })
      });
    }

    if (apiPath.endsWith('/genre/movie/list')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ genres: [{ id: 28, name: 'Action' }] }) });
    }
    if (apiPath.endsWith('/genre/tv/list')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ genres: [{ id: 18, name: 'Drama' }] }) });
    }
    if (apiPath.includes('/trending/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ id: 1, title: 'Recovered Hero', overview: 'Overview', vote_average: 7.4, backdrop_path: '/hero.jpg', genre_ids: [28], release_date: '2025-01-01' }] })
      });
    }
    if (apiPath.match(/\/(movie|tv)\/(now_playing|popular|top_rated|upcoming|airing_today|on_the_air)$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript(() => {
    window.CINOVA_CONFIG = { tmdbReadAccessToken: 'bad-token' };
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toContainText('TMDB rejected your token');

  await page.evaluate(() => {
    window.CINOVA_CONFIG.tmdbReadAccessToken = 'good-token';
  });

  await page.locator('#setupRetryBtn').click();

  await expect(page.locator('#setupOverlay')).toBeHidden();
  await expect(page.locator('#heroInfo .hero-title')).toContainText('Recovered Hero');
});

test('ignores corrupted watchlist storage and still initializes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await mockTmdb(page);
  await page.addInitScript(() => {
    window.CINOVA_CONFIG = { tmdbReadAccessToken: 'test-token' };
    localStorage.setItem('cinova_watchlist', '{"broken":');
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeHidden();
  await expect(page.locator('#watchlistCount')).toHaveText('0');
  expect(pageErrors).toEqual([]);
});
