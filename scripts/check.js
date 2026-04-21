const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(html.includes('<!DOCTYPE html>'), 'Missing <!DOCTYPE html>.');
assert(html.includes('<html'), 'Missing opening <html> tag.');
assert(html.includes('</html>'), 'Missing closing </html> tag.');
assert(html.includes('<body'), 'Missing opening <body> tag.');
assert(html.includes('</body>'), 'Missing closing </body> tag.');

const idMatches = [...html.matchAll(/\sid="([^"]+)"/g)];
const idCounts = new Map();
for (const match of idMatches) {
  const id = match[1];
  idCounts.set(id, (idCounts.get(id) || 0) + 1);
}

const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
assert(duplicateIds.length === 0, `Duplicate id attributes found: ${duplicateIds.join(', ')}`);

const requiredIds = [
  'setupOverlay',
  'apiKeyInput',
  'setupSubmitBtn',
  'setupRetryBtn',
  'heroSection',
  'heroInfo',
  'mainContent',
  'modalOverlay',
  'modalContent',
  'searchInput',
  'searchClear',
  'watchlistCount'
];

for (const id of requiredIds) {
  assert(idCounts.has(id), `Missing required element id "${id}".`);
}

assert(/<nav[^>]*aria-label="[^"]+"/.test(html), 'Expected nav to include an aria-label.');
assert(/<input[^>]*id="searchInput"[^>]*aria-label="[^"]+"/.test(html), 'Expected #searchInput to include an aria-label.');
assert(/<div[^>]*id="modalContent"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html), 'Expected #modalContent to have dialog semantics.');
assert(/<div[^>]*id="setupError"[^>]*role="alert"[^>]*aria-live="assertive"/.test(html), 'Expected #setupError to have alert live-region semantics.');

const blankTargetLinks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map(match => match[0]);
for (const linkTag of blankTargetLinks) {
  const relValueMatch = linkTag.match(/\brel="([^"]+)"/);
  assert(Boolean(relValueMatch), `Expected target=\"_blank\" link to include rel attribute: ${linkTag}`);
  if (relValueMatch) {
    const relValue = relValueMatch[1];
    assert(/\bnoopener\b/.test(relValue), `Expected rel to include noopener for external link: ${linkTag}`);
    assert(/\bnoreferrer\b/.test(relValue), `Expected rel to include noreferrer for external link: ${linkTag}`);
  }
}

const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
const scriptBlocks = [...html.matchAll(scriptRegex)];
assert(scriptBlocks.length > 0, 'No inline <script> blocks found.');

for (let i = 0; i < scriptBlocks.length; i += 1) {
  const code = scriptBlocks[i][1];
  try {
    new vm.Script(code, { filename: `inline-script-${i + 1}.js` });
  } catch (error) {
    errors.push(`Inline script ${i + 1} has syntax errors: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error('Check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Check passed: index.html structure and inline scripts look valid.');
