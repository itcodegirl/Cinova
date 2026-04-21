const path = require('node:path');
const { spawn } = require('node:child_process');

const port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4173;
const url = `http://localhost:${port}`;

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
const previewProcess = spawn(process.execPath, [previewScriptPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
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
