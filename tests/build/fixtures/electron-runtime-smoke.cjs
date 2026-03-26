/**
 * Fixture executed under Electron runtime (ELECTRON_RUN_AS_NODE=1).
 * Boots Argus backend and verifies local web API responds.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(2500, () => {
      req.destroy(new Error('request timed out'));
    });
  });
}

async function waitForStatus(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = 'no response';

  while (Date.now() < deadline) {
    try {
      const res = await getJson(url);
      if (res.statusCode === 200) return;
      lastErr = `HTTP ${res.statusCode}`;
    } catch (err) {
      lastErr = err && err.message ? err.message : String(err);
    }
    await wait(200);
  }

  throw new Error(`status endpoint did not become ready: ${lastErr}`);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-electron-smoke-'));
  const dbPath = path.join(tempDir, 'data.db');
  const port = String(33131 + Math.floor(Math.random() * 1000));
  const statusUrl = `http://127.0.0.1:${port}/api/status`;

  process.env.ARGUS_DB_PATH = dbPath;
  process.env.ARGUS_WEB_PORT = port;
  process.env.ARGUS_SCAN_INTERVAL = '2000';

  const entry = pathToFileURL(path.join(process.cwd(), 'src', 'index.js')).href;
  const mod = await import(entry);

  try {
    await mod.start({
      noWatch: true,
      noNotify: true,
      noIpc: true,
      noWeb: false,
    });

    await waitForStatus(statusUrl, 8000);
    const status = await getJson(statusUrl);

    if (status.statusCode !== 200) {
      throw new Error(`unexpected status code: ${status.statusCode}`);
    }
  } finally {
    try {
      await mod.stop();
    } catch {
      // Best-effort cleanup
    }
  }
}

main().catch((err) => {
  const msg = err && err.stack ? err.stack : String(err);
  console.error(msg);
  process.exit(1);
});

