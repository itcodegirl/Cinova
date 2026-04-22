const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runEncodingCheck } = require('./check-encoding');

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const errors = [];
const encodingResult = runEncodingCheck();

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function getAttributeValue(tag, attributeName) {
  const regex = new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = tag.match(regex);
  if (!match) return '';
  return match[1] || match[2] || '';
}

function resolveLocalPath(rawPath) {
  if (!rawPath) return null;
  if (/^(https?:)?\/\//i.test(rawPath) || rawPath.startsWith('data:')) return null;

  const normalizedPath = rawPath.split('#')[0].split('?')[0];
  const resolved = path.resolve(rootDir, normalizedPath);
  const relativePath = path.relative(rootDir, resolved);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  return resolved;
}

for (const issue of encodingResult.issues) {
  errors.push(issue);
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
  'setupRetryBtn',
  'setupError',
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

const stylesheetTags = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]);
assert(stylesheetTags.length > 0, 'No stylesheet link tags found.');

for (const stylesheetTag of stylesheetTags) {
  const href = getAttributeValue(stylesheetTag, 'href');
  assert(Boolean(href), `Stylesheet is missing href attribute: ${stylesheetTag}`);
  if (!href) continue;

  const stylesheetPath = resolveLocalPath(href);
  if (!stylesheetPath) continue;
  assert(fs.existsSync(stylesheetPath), `Missing stylesheet file referenced by index.html: ${href}`);
}

const scriptTags = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
assert(scriptTags.length > 0, 'No script tags found.');

for (let i = 0; i < scriptTags.length; i += 1) {
  const fullTag = scriptTags[i][0];
  const inlineCode = scriptTags[i][1];
  const src = getAttributeValue(fullTag, 'src');
  const isOptional = getAttributeValue(fullTag, 'data-optional') === 'true';

  if (src) {
    const scriptPath = resolveLocalPath(src);
    if (scriptPath) {
      assert(isOptional || fs.existsSync(scriptPath), `Missing script file referenced by index.html: ${src}`);
      if (!fs.existsSync(scriptPath)) continue;
      try {
        const scriptSource = fs.readFileSync(scriptPath, 'utf8');
        new vm.Script(scriptSource, { filename: path.relative(rootDir, scriptPath) });
      } catch (error) {
        errors.push(`Linked script "${src}" has syntax errors: ${error.message}`);
      }
    }
    continue;
  }

  if (!inlineCode.trim()) continue;

  try {
    new vm.Script(inlineCode, { filename: `inline-script-${i + 1}.js` });
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

console.log('Check passed: index.html structure and linked assets look valid.');
