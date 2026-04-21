const { execSync } = require('node:child_process');
const path = require('node:path');
const { scanFilesForEncoding } = require('./lib/encoding');

const TEXT_EXTENSIONS = new Set(['.html', '.js', '.json', '.md', '.yml', '.yaml', '.css', '.txt']);

function getTrackedTextFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(file => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map(file => path.resolve(process.cwd(), file));
}

function runEncodingCheck() {
  const files = getTrackedTextFiles();
  const issues = scanFilesForEncoding(files);
  return { files, issues };
}

if (require.main === module) {
  const { issues } = runEncodingCheck();
  if (issues.length > 0) {
    console.error('Encoding check failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }
  console.log('Encoding check passed: tracked text files are UTF-8 clean.');
}

module.exports = {
  runEncodingCheck,
  getTrackedTextFiles
};
