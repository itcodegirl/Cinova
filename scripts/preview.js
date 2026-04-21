const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const rootDir = process.cwd();
const port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4173;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function resolveRequestPath(requestUrl) {
  const rawPath = decodeURIComponent((requestUrl || '/').split('?')[0]);
  const normalized = rawPath === '/' ? '/index.html' : rawPath;
  const absolutePath = path.resolve(rootDir, `.${normalized}`);
  if (!absolutePath.startsWith(rootDir)) return null;
  return absolutePath;
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request path.');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not found.' : 'Server error.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Preview server running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});
