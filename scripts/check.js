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
