const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const buildFiles = ['index.html'];

function cleanDistDirectory() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
}

function copyBuildFiles() {
  const copiedFiles = [];
  for (const relativeFile of buildFiles) {
    const sourcePath = path.join(rootDir, relativeFile);
    const destinationPath = path.join(distDir, relativeFile);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing build input: ${relativeFile}`);
    }

    fs.copyFileSync(sourcePath, destinationPath);
    copiedFiles.push(relativeFile);
  }
  return copiedFiles;
}

function runBuild() {
  cleanDistDirectory();
  const copiedFiles = copyBuildFiles();
  console.log(`Build complete. Output directory: ${distDir}`);
  console.log(`Copied files: ${copiedFiles.join(', ')}`);
}

if (require.main === module) {
  runBuild();
}

module.exports = { runBuild };
