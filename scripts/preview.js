const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const rootDir = process.cwd();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function parseCliArgs(args) {
  let host;
  let port;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--host=')) {
      host = args[i].slice('--host='.length);
      continue;
    }
    if (args[i].startsWith('--port=')) {
      port = Number(args[i].slice('--port='.length));
      continue;
    }
    if (args[i] === '--host' && args[i + 1]) {
      host = args[i + 1];
      i += 1;
      continue;
    }
    if (args[i] === '--port' && args[i + 1]) {
      port = Number(args[i + 1]);
      i += 1;
    }
  }
  return { host, port };
}

function getConfig() {
  const cli = parseCliArgs(process.argv.slice(2));
  const host = cli.host || process.env.HOST || '127.0.0.1';
  const parsedPort = Number.isFinite(cli.port) && cli.port > 0 ? cli.port : Number(process.env.PORT);
  const port = parsedPort > 0 ? parsedPort : 4173;
  return { host, port };
}

function resolveRequestPath(requestUrl) {
  const rawPath = decodeURIComponent((requestUrl || '/').split('?')[0]);
  const normalized = rawPath === '/' ? '/index.html' : rawPath;
  const absolutePath = path.resolve(rootDir, `.${normalized}`);
  const relativePath = path.relative(rootDir, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  return absolutePath;
}

function getLanUrls(port) {
  const network = os.networkInterfaces();
  const urls = [];
  for (const iface of Object.values(network)) {
    for (const address of iface || []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }
  return urls;
}

const { host, port } = getConfig();

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

server.listen(port, host, () => {
  const localHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`Preview server running at http://${localHost}:${port}`);
  if (host === '0.0.0.0' || host === '::') {
    const lanUrls = getLanUrls(port);
    if (lanUrls.length > 0) {
      console.log('LAN URLs:');
      lanUrls.forEach(url => console.log(`- ${url}`));
    }
  }
  console.log('Press Ctrl+C to stop.');
});
