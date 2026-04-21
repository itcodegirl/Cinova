const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

function fulfill(route, status, body, headers = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body)
  });
}

function defaultApiResponse(route, apiPath, pageNumber = 1) {
  const baseId = (pageNumber - 1) * 10 + 1;

  if (apiPath.endsWith('/genre/movie/list')) {
    return fulfill(route, 200, { genres: [{ id: 28, name: 'Action' }] });
  }

  if (apiPath.endsWith('/genre/tv/list')) {
    return fulfill(route, 200, { genres: [{ id: 18, name: 'Drama' }] });
  }

  if (apiPath.endsWith('/trending/movie/week') || apiPath.endsWith('/trending/tv/week')) {
    return fulfill(route, 200, {
      results: [{
        id: 1,
        title: 'Featured Movie',
        overview: 'Featured overview',
        vote_average: 7.8,
        backdrop_path: '/hero.jpg',
        genre_ids: [28],
        release_date: '2025-01-01'
      }]
    });
  }

  if (apiPath.match(/\/(movie|tv)\/(now_playing|popular|top_rated|upcoming|airing_today|on_the_air)$/)) {
    return fulfill(route, 200, {
      results: [{
        id: baseId,
        media_type: 'movie',
        title: `Title ${baseId}`,
        overview: `Overview ${baseId}`,
        vote_average: 8.0,
        genre_ids: [28],
        poster_path: '/poster.jpg',
        release_date: '2025-01-01'
      }]
    });
  }

  if (apiPath.endsWith('/search/multi')) {
    return fulfill(route, 200, {
      page: pageNumber,
      total_pages: 1,
      total_results: 1,
      results: [{
        id: 901,
        media_type: 'movie',
        title: 'Retry Search Result',
        overview: 'Search overview',
        vote_average: 7.3,
        genre_ids: [28],
        poster_path: '/poster.jpg',
        release_date: '2025-01-01'
      }]
    });
  }

  return fulfill(route, 200, {});
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cinova_tmdb_token', 'test-token');
  });
});

test('hero inline retry recovers after transient failure', async ({ page }) => {
  let trendingAttempts = 0;

  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;

    if (apiPath.endsWith('/trending/movie/week')) {
      trendingAttempts += 1;
      if (trendingAttempts === 1) {
        return fulfill(route, 503, { status_message: 'Service unavailable' });
      }
    }

    const pageNumber = Number(url.searchParams.get('page') || '1');
    return defaultApiResponse(route, apiPath, pageNumber);
  });

  await page.goto(appUrl);

  await expect(page.getByText('Could not load the featured title right now.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry Hero' }).click();
  await expect(page.locator('#heroInfo .hero-title')).toContainText('Featured Movie');
});

test('section inline retry reloads only the failed section', async ({ page }) => {
  let nowPlayingAttempts = 0;

  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    const pageNumber = Number(url.searchParams.get('page') || '1');

    if (apiPath.endsWith('/movie/now_playing')) {
      nowPlayingAttempts += 1;
      if (nowPlayingAttempts === 1) {
        return fulfill(route, 500, { status_message: 'Server error' });
      }
      return fulfill(route, 200, {
        results: [{
          id: 301,
          media_type: 'movie',
          title: 'Recovered Now Playing',
          overview: 'Recovered section',
          vote_average: 7.9,
          genre_ids: [28],
          poster_path: '/poster.jpg',
          release_date: '2025-01-01'
        }]
      });
    }

    return defaultApiResponse(route, apiPath, pageNumber);
  });

  await page.goto(appUrl);

  const nowPlayingSection = page.locator('.section').filter({
    has: page.locator('h2.section-title:has-text("Now Playing")')
  }).first();

  await expect(nowPlayingSection.getByText('Could not load Now Playing.')).toBeVisible();
  await nowPlayingSection.getByRole('button', { name: 'Retry Section' }).click();
  await expect(nowPlayingSection.locator('.movie-card')).toHaveCount(1);
  await expect(nowPlayingSection.getByText('Recovered Now Playing')).toBeVisible();
});

test('search inline retry recovers after transient search failure', async ({ page }) => {
  let searchAttempts = 0;

  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    const pageNumber = Number(url.searchParams.get('page') || '1');

    if (apiPath.endsWith('/search/multi')) {
      searchAttempts += 1;
      if (searchAttempts === 1) {
        return fulfill(route, 502, { status_message: 'Gateway error' });
      }
    }

    return defaultApiResponse(route, apiPath, pageNumber);
  });

  await page.goto(appUrl);
  await page.locator('#searchInput').fill('retry-query');
  await page.evaluate(() => window.executeSearch && window.executeSearch());

  await expect(page.getByText('Search failed: TMDB Error: 502')).toBeVisible();
  await page.getByRole('button', { name: 'Retry Search' }).click();
  await expect(page.locator('h2.section-title:has-text("Results for")')).toBeVisible();
  await expect(page.getByText('Retry Search Result')).toBeVisible();
});

test('falls back when API returns unsafe poster paths', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    const pageNumber = Number(url.searchParams.get('page') || '1');

    if (apiPath.endsWith('/movie/now_playing')) {
      return fulfill(route, 200, {
        results: [{
          id: 777,
          media_type: 'movie',
          title: 'Unsafe Poster Payload',
          overview: 'Should not inject attributes',
          vote_average: 8.0,
          genre_ids: [28],
          poster_path: '/poster.jpg" onerror="window.__xssFlag=1',
          release_date: '2025-01-01'
        }]
      });
    }

    return defaultApiResponse(route, apiPath, pageNumber);
  });

  await page.addInitScript(() => {
    localStorage.setItem('cinova_tmdb_token', 'test-token');
    window.__xssFlag = 0;
  });

  await page.goto(appUrl);

  const nowPlayingSection = page.locator('.section').filter({
    has: page.locator('h2.section-title:has-text("Now Playing")')
  }).first();

  await expect(nowPlayingSection.getByText('Unsafe Poster Payload')).toBeVisible();
  await expect(nowPlayingSection.locator('.movie-card img')).toHaveCount(0);
  await expect(nowPlayingSection.locator('.movie-card .no-poster')).toHaveCount(1);

  const xssFlag = await page.evaluate(() => window.__xssFlag);
  expect(xssFlag).toBe(0);
});

