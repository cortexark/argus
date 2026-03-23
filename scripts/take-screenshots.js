/**
 * Screenshot automation for the Argus dashboard.
 *
 * Starts the Argus web server (Node.js only, no Electron),
 * navigates through each dashboard tab with Playwright,
 * and saves desktop-quality screenshots to docs/screenshots/.
 *
 * Usage:
 *   npx playwright install chromium   # one-time browser install
 *   node scripts/take-screenshots.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'docs', 'screenshots');

const VIEWPORT = { width: 1200, height: 800 };
const SERVER_URL = 'http://localhost:3131';

// Wait for the server to respond before proceeding.
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 500;

/**
 * Tab definitions: each entry maps a human-readable name
 * to the data-tab attribute value used in the dashboard nav.
 */
const TABS = [
  { name: 'live',     dataTab: 'overview',  file: 'dashboard-live.png' },
  { name: 'network',  dataTab: 'network',   file: 'dashboard-network.png' },
  { name: 'sessions', dataTab: 'sessions',  file: 'dashboard-sessions.png' },
  { name: 'access',   dataTab: 'files',     file: 'dashboard-access.png' },
  { name: 'report',   dataTab: 'ports',     file: 'dashboard-report.png' },
];

/**
 * Poll the server URL until it responds with 200, or give up.
 */
async function waitForServer() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(SERVER_URL);
      if (res.ok) {
        console.log(`Server ready after ${attempt} attempt(s).`);
        return;
      }
    } catch {
      // Server not up yet — retry.
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw new Error(
    `Server at ${SERVER_URL} did not respond within ${(MAX_RETRIES * RETRY_DELAY_MS) / 1000}s.`,
  );
}

/**
 * Start the Argus backend (web server + database) without Electron.
 * Returns a cleanup function that shuts everything down.
 */
async function startBackend() {
  const { initializeDatabase } = await import(
    join(PROJECT_ROOT, 'src', 'db', 'schema.js')
  );
  const { startWebServer, WEB_PORT } = await import(
    join(PROJECT_ROOT, 'src', 'web', 'server.js')
  );

  // Use an in-memory database so we don't touch the real data.
  const db = initializeDatabase(':memory:');
  const { server } = startWebServer(db, WEB_PORT);

  console.log(`Argus backend started on port ${WEB_PORT}.`);

  const cleanup = () => {
    server.close();
    db.close();
    console.log('Argus backend stopped.');
  };

  return cleanup;
}

/**
 * Capture a screenshot of every dashboard tab using Playwright.
 */
async function captureScreenshots() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  await page.goto(SERVER_URL, { waitUntil: 'networkidle' });

  for (const tab of TABS) {
    const selector = `.tab[data-tab="${tab.dataTab}"]`;
    await page.click(selector);

    // Allow the tab content to render / animate.
    await page.waitForTimeout(600);

    const outputPath = join(SCREENSHOT_DIR, tab.file);
    await page.screenshot({ path: outputPath, fullPage: false });
    console.log(`  Saved: ${tab.file} (tab: ${tab.dataTab})`);
  }

  await browser.close();
  console.log(`\nAll ${TABS.length} screenshots saved to docs/screenshots/.`);
}

/**
 * Main entry point: start backend, take screenshots, clean up.
 */
async function main() {
  let cleanup = null;

  try {
    cleanup = await startBackend();
    await waitForServer();
    await captureScreenshots();
  } catch (err) {
    console.error('Screenshot capture failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (cleanup) {
      cleanup();
    }
  }
}

main();
