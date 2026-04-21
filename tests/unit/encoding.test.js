const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanFilesForEncoding, isUtf8Bom } = require('../../scripts/lib/encoding');

function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinova-encoding-'));
  try {
    run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('isUtf8Bom returns true only for UTF-8 BOM buffers', () => {
  assert.equal(isUtf8Bom(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), true);
  assert.equal(isUtf8Bom(Buffer.from([0x61, 0x62, 0x63])), false);
});

test('scanFilesForEncoding flags invalid UTF-8 sequences', () => {
  withTempDir(tempDir => {
    const filePath = path.join(tempDir, 'invalid.txt');
    fs.writeFileSync(filePath, Buffer.from([0xc3, 0x28]));

    const issues = scanFilesForEncoding([filePath]);
    assert.equal(issues.length > 0, true);
    assert.equal(issues.some(issue => issue.includes('invalid UTF-8 sequence')), true);
  });
});

test('scanFilesForEncoding flags possible mojibake by default', () => {
  withTempDir(tempDir => {
    const filePath = path.join(tempDir, 'mojibake.txt');
    const mojibakeText = `Broken quote ${String.fromCodePoint(0x00e2, 0x20ac, 0x2122)} example`;
    fs.writeFileSync(filePath, mojibakeText, 'utf8');

    const issues = scanFilesForEncoding([filePath]);
    assert.equal(issues.length > 0, true);
    assert.equal(issues.some(issue => issue.includes('possible mojibake')), true);
  });
});

test('scanFilesForEncoding passes clean UTF-8 text', () => {
  withTempDir(tempDir => {
    const filePath = path.join(tempDir, 'valid.txt');
    fs.writeFileSync(filePath, 'Clean UTF-8 text sample', 'utf8');

    const issues = scanFilesForEncoding([filePath]);
    assert.deepEqual(issues, []);
  });
});

