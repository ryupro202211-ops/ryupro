const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.RYUPRO_TEST_PORT || 3047);
const baseURL = `http://127.0.0.1:${port}/ryupro/`;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function exited(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => reject(new Error(`Test port ${port} is unavailable: ${error.message}`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

async function startPreview() {
  const child = spawn(process.execPath, [path.join(root, 'server.js'), '--dir', '_site'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit'
  });
  const exitPromise = exited(child);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const result = await exitPromise;
      throw new Error(`Preview server exited before becoming ready (${result.code ?? result.signal}).`);
    }
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return { child, exitPromise };
    } catch {}
    await wait(250);
  }
  child.kill();
  throw new Error('Preview server did not become ready within 30 seconds.');
}

async function main() {
  await assertPortAvailable();
  const server = await startPreview();
  const cli = path.join(path.dirname(require.resolve('@playwright/test')), 'cli.js');
  const testProcess = spawn(process.execPath, [cli, 'test'], {
    cwd: root,
    env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: '1', RYUPRO_TEST_PORT: String(port) },
    stdio: 'inherit'
  });
  try {
    const result = await exited(testProcess);
    if (result.signal) throw new Error(`Playwright exited on signal ${result.signal}.`);
    process.exitCode = result.code ?? 1;
  } finally {
    if (server.child.exitCode === null) server.child.kill();
    await server.exitPromise;
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
