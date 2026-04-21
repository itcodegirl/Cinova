const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

test('shows validation error when setup token is empty', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('screenscout_token');
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await page.locator('#setupSubmitBtn').click();
  await expect(page.locator('#setupError')).toHaveText('Please enter your TMDB API token.');
});

test('keeps setup overlay open when stored token is invalid', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', route =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ status_message: 'Invalid token' })
    })
  );

  await page.addInitScript(() => {
    localStorage.setItem('screenscout_token', 'bad-token');
  });

  await page.goto(appUrl);

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toHaveText('Could not connect to TMDB. Check your token and internet connection.');
  await expect(page.locator('#apiKeyInput')).toHaveValue('bad-token');
});

test('shows setup error when network fails after entering token', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', route => route.abort('failed'));

  await page.addInitScript(() => {
    localStorage.removeItem('screenscout_token');
  });

  await page.goto(appUrl);
  await page.locator('#apiKeyInput').fill('offline-token');
  await page.locator('#setupSubmitBtn').click();

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toHaveText('Could not connect to TMDB. Check your token and internet connection.');
  await expect(page.locator('#apiKeyInput')).toHaveValue('offline-token');
  await expect(page.locator('#setupRetryBtn')).toBeVisible();
});

test('shows setup error when tmdb requests time out', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ genres: [] })
    });
  });

  await page.addInitScript(() => {
    localStorage.removeItem('screenscout_token');
    window.__TMDB_TIMEOUT_MS__ = 50;
  });

  await page.goto(appUrl);
  await page.locator('#apiKeyInput').fill('slow-token');
  await page.locator('#setupSubmitBtn').click();

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toHaveText('Could not connect to TMDB. Check your token and internet connection.');
  await expect(page.locator('#apiKeyInput')).toHaveValue('slow-token');
  await expect(page.locator('#setupRetryBtn')).toBeVisible();
});

test('retries setup successfully after a transient failure', async ({ page }) => {
  let hasFailedMovieGenre = false;

  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;

    if (apiPath.endsWith('/genre/movie/list') && !hasFailedMovieGenre) {
      hasFailedMovieGenre = true;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ status_message: 'Service unavailable' })
      });
    }

    if (apiPath.endsWith('/genre/movie/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 28, name: 'Action' }] })
      });
    }

    if (apiPath.endsWith('/genre/tv/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 18, name: 'Drama' }] })
      });
    }

    if (apiPath.includes('/trending/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ id: 1, title: 'Movie 1', overview: 'Overview', vote_average: 7.5, backdrop_path: '/hero.jpg', genre_ids: [28], release_date: '2025-01-01' }] })
      });
    }

    if (apiPath.match(/\/(movie|tv)\/(now_playing|popular|top_rated|upcoming|airing_today|on_the_air)$/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });

  await page.addInitScript(() => {
    localStorage.removeItem('screenscout_token');
  });

  await page.goto(appUrl);
  await page.locator('#apiKeyInput').fill('retry-token');
  await page.locator('#setupSubmitBtn').click();

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupRetryBtn')).toBeVisible();

  await page.locator('#setupRetryBtn').click();
  await expect(page.locator('#setupOverlay')).toBeHidden();
});

test('automatically recovers from transient tmdb 429 during setup', async ({ page }) => {
  let movieGenreAttempts = 0;

  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;

    if (apiPath.endsWith('/genre/movie/list')) {
      movieGenreAttempts += 1;
      if (movieGenreAttempts === 1) {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'Retry-After': '0' },
          body: JSON.stringify({ status_message: 'Rate limit exceeded' })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 28, name: 'Action' }] })
      });
    }

    if (apiPath.endsWith('/genre/tv/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 18, name: 'Drama' }] })
      });
    }

    if (apiPath.includes('/trending/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ id: 1, title: 'Movie 1', overview: 'Overview', vote_average: 7.5, backdrop_path: '/hero.jpg', genre_ids: [28], release_date: '2025-01-01' }] })
      });
    }

    if (apiPath.match(/\/(movie|tv)\/(now_playing|popular|top_rated|upcoming|airing_today|on_the_air)$/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });

  await page.addInitScript(() => {
    localStorage.removeItem('screenscout_token');
    window.__TMDB_RETRY_DELAY_MS__ = 10;
  });

  await page.goto(appUrl);
  await page.locator('#apiKeyInput').fill('rate-limit-token');
  await page.locator('#setupSubmitBtn').click();

  await expect(page.locator('#setupOverlay')).toBeHidden();
});

test('shows setup error when tmdb 429 retries are exhausted', async ({ page }) => {
  await page.route('https://api.themoviedb.org/3/**', route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;

    if (apiPath.endsWith('/genre/movie/list')) {
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '0' },
        body: JSON.stringify({ status_message: 'Rate limit exceeded' })
      });
    }

    if (apiPath.endsWith('/genre/tv/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ genres: [{ id: 18, name: 'Drama' }] })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });

  await page.addInitScript(() => {
    localStorage.removeItem('screenscout_token');
    window.__TMDB_MAX_RETRIES__ = 1;
    window.__TMDB_RETRY_DELAY_MS__ = 10;
  });

  await page.goto(appUrl);
  await page.locator('#apiKeyInput').fill('rate-limit-fail-token');
  await page.locator('#setupSubmitBtn').click();

  await expect(page.locator('#setupOverlay')).toBeVisible();
  await expect(page.locator('#setupError')).toHaveText('Could not connect to TMDB. Check your token and internet connection.');
  await expect(page.locator('#setupRetryBtn')).toBeVisible();
});
