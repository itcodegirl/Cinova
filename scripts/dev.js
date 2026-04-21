const path = require('node:path');
const { spawn } = require('node:child_process');

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

function getBrowserHost(host) {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

const { host, port } = getConfig();
const url = `http://${getBrowserHost(host)}:${port}`;

function openBrowser(targetUrl) {
  if (process.env.NO_OPEN === '1') {
    console.log(`Browser auto-open disabled (NO_OPEN=1). App URL: ${targetUrl}`);
    return;
  }

  let command = null;
  let args = [];

  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', targetUrl];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [targetUrl];
  } else {
    command = 'xdg-open';
    args = [targetUrl];
  }

  const opener = spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });
  opener.unref();
}

const previewScriptPath = path.resolve(__dirname, 'preview.js');
const previewProcess = spawn(process.execPath, [previewScriptPath, '--host', host, '--port', String(port)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port)
  }
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (previewProcess.exitCode === null) {
    previewProcess.kill(signal);
  }
}

previewProcess.once('spawn', () => {
  setTimeout(() => openBrowser(url), 350);
});

previewProcess.on('exit', code => {
  if (isShuttingDown) {
    process.exit(0);
    return;
  }
  process.exit(code ?? 1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
