const fs = require('node:fs');

const DEFAULT_MOJIBAKE_PATTERN = new RegExp(
  '(?:\\u00c3.|\\u00e2[\\u20ac\\u2122\\u0153\\u0161\\u017e\\u2022]|\\u00f0\\u0178|\\u00ef\\u00b8)'
);

function isUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function scanFilesForEncoding(filePaths, options = {}) {
  const includeMojibakeCheck = options.includeMojibakeCheck !== false;
  const mojibakePattern = options.mojibakePattern || DEFAULT_MOJIBAKE_PATTERN;
  const issues = [];

  for (const filePath of filePaths) {
    const buffer = fs.readFileSync(filePath);

    if (isUtf8Bom(buffer)) {
      issues.push(`${filePath}: UTF-8 BOM detected; use UTF-8 without BOM.`);
    }

    const text = buffer.toString('utf8');
    if (text.includes('\uFFFD')) {
      issues.push(`${filePath}: invalid UTF-8 sequence(s) detected.`);
    }

    if (includeMojibakeCheck && mojibakePattern.test(text)) {
      issues.push(`${filePath}: possible mojibake sequence detected.`);
    }
  }

  return issues;
}

module.exports = {
  scanFilesForEncoding,
  isUtf8Bom
};
