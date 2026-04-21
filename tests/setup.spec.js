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
  await page.locator('#setupOverlay button').click();
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
