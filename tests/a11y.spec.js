const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockTmdb } = require('./helpers/mockTmdb');

const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

function describeViolations(violations) {
  if (violations.length === 0) return 'No violations found.';
  return violations
    .map(v => `${v.id} (${v.impact}): ${v.help}`)
    .join('\n');
}

test('has no serious or critical accessibility violations', async ({ page }) => {
  await mockTmdb(page);
  await page.addInitScript(() => {
    localStorage.setItem('screenscout_token', 'test-token');
  });

  await page.goto(appUrl);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();

  const impactfulViolations = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(impactfulViolations, describeViolations(impactfulViolations)).toEqual([]);
});
