/**
 * Argus Electron main process.
 * Starts the Argus backend daemon and creates a menubar tray app
 * that embeds the web dashboard at http://localhost:3131.
 */

import pkg from 'electron';
const { app } = pkg;
import { menubar } from 'menubar';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setupTray } from './tray.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Single instance lock — prevent multiple Argus windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Suppress the default dock icon on macOS (menubar app lives in tray only)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

app.whenReady().then(async () => {
  // Start the Argus monitoring backend
  let argusStop = null;
  try {
    const { start } = await import('../src/index.js');
    argusStop = await start({ noWatch: false, noWeb: false, noNotify: false, noIpc: false });
  } catch (err) {
    console.error('[Argus] Backend failed to start:', err.message);
    // Continue — the tray will show connection error in UI
  }

  // Wait briefly for web server to be ready
  await waitForWebServer('http://127.0.0.1:3131/api/status', 5000);

  const iconPath = join(__dirname, 'assets',
    process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.png'
  );

  const mb = menubar({
    index: 'http://127.0.0.1:3131',
    icon: iconPath,
    browserWindow: {
      width: 900,
      height: 650,
      resizable: true,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: true,
      },
    },
    preloadWindow: true,
    showOnAllWorkspaces: false,
    showDockIcon: false,
  });

  mb.on('ready', () => {
    setupTray(mb, { stop: argusStop });
  });

  mb.on('after-show', () => {
    mb.window?.webContents.reload();
  });

  // Handle second instance — show window
  app.on('second-instance', () => {
    mb.showWindow();
  });

  app.on('before-quit', async () => {
    if (argusStop) {
      try { await argusStop(); } catch { /* ignore */ }
    }
  });
});

/**
 * Poll the web server URL until it responds or timeout elapses.
 * @param {string} url
 * @param {number} timeoutMs
 */
async function waitForWebServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
