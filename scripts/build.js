const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const buildItems = ['index.html', 'assets'];

function cleanDistDirectory() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
}

function copyPathRecursive(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const item of fs.readdirSync(sourcePath)) {
      copyPathRecursive(path.join(sourcePath, item), path.join(destinationPath, item));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function copyBuildItems() {
  const copiedItems = [];
  for (const relativePath of buildItems) {
    const sourcePath = path.join(rootDir, relativePath);
    const destinationPath = path.join(distDir, relativePath);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing build input: ${relativePath}`);
    }

    copyPathRecursive(sourcePath, destinationPath);
    copiedItems.push(relativePath);
  }
  return copiedItems;
}

function runBuild() {
  cleanDistDirectory();
  const copiedItems = copyBuildItems();
  console.log(`Build complete. Output directory: ${distDir}`);
  console.log(`Copied files/directories: ${copiedItems.join(', ')}`);
}

if (require.main === module) {
  runBuild();
}

module.exports = { runBuild };
