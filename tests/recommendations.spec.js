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
});

test('shows personalized recommendations based on saved watchlist context', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cinova_watchlist', JSON.stringify([
      { id: 15, type: 'movie', title: 'Saved Movie Seed', poster: '/poster.jpg' },
      { id: 99, type: 'tv', title: 'Saved TV Seed', poster: '/poster.jpg' }
    ]));
  });

  await page.goto(appUrl);

  const recommendationSection = page.locator('.section-recommendations').first();
  await expect(recommendationSection).toBeVisible();
  await expect(recommendationSection.locator('h2.section-title')).toContainText('Recommended for You');
  await expect(recommendationSection.locator('.recommendation-context')).toContainText('Saved Movie Seed');
  await expect(recommendationSection.locator('.movie-card')).toHaveCount(12);
});

test('recovers recommendations section after retry', async ({ page }) => {
  let recommendationAttempts = 0;

  await page.route('https://api.themoviedb.org/3/movie/42/recommendations**', route => {
    recommendationAttempts += 1;
    if (recommendationAttempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ status_message: 'Service unavailable' })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{
          id: 777,
          media_type: 'movie',
          title: 'Recovered Recommendation',
          overview: 'Recovered recommendation overview',
          vote_average: 7.6,
          genre_ids: [28],
          poster_path: '/poster.jpg',
          release_date: '2025-01-01'
        }]
      })
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('cinova_watchlist', JSON.stringify([
      { id: 42, type: 'movie', title: 'Retry Seed', poster: '/poster.jpg' }
    ]));
  });

  await page.goto(appUrl);

  const recommendationSection = page.locator('.section-recommendations').first();
  await expect(recommendationSection.getByText('Could not load your personalized recommendations.')).toBeVisible();

  await recommendationSection.getByRole('button', { name: 'Retry Recommendations' }).click();
  await expect(recommendationSection.getByText('Recovered Recommendation')).toBeVisible();
});
