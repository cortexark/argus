/**
 * Argus Electron main process.
 * Starts the Argus backend daemon and creates a menubar tray app
 * that embeds the web dashboard at http://localhost:3131.
 */

import pkg from 'electron';
const { app, dialog } = pkg;
import { menubar } from 'menubar';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { setupTray } from './tray.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STARTUP_LOG_PATH = join(homedir(), '.argus', 'logs', 'electron-startup.log');
const SETTINGS_PATH = join(homedir(), '.argus', 'settings.json');
const ONBOARDING_VERSION = 1;

// Use software rendering if GPU causes blank windows.
// On macOS Sequoia+, full GPU disable can itself cause blank windows,
// so we only disable compositing (the usual culprit for tab-switch blanks).
app.commandLine.appendSwitch('disable-gpu-compositing');

function normalizePrivacyMode(mode) {
  return mode === 'deep' ? 'deep' : 'basic';
}

function loadSettings() {
  try {
    if (!existsSync(SETTINGS_PATH)) return {};
    const raw = readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
    writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  } catch {
    // Non-fatal best effort
  }
}

async function ensureInstallMessaging() {
  // Always read settings.json first — it reflects the user's latest choice
  // (including mode changes via the dashboard that require a restart).
  // Only fall back to ARGUS_PRIVACY_MODE env var if no settings file exists
  // (CI/testing/manual power users).
  const settings = loadSettings();
  if (settings.onboardingVersion === ONBOARDING_VERSION) {
    const mode = normalizePrivacyMode(settings.privacyMode);
    process.env.ARGUS_PRIVACY_MODE = mode;
    return mode;
  }

  if (process.env.ARGUS_PRIVACY_MODE) {
    return normalizePrivacyMode(process.env.ARGUS_PRIVACY_MODE);
  }

  const res = await dialog.showMessageBox({
    type: 'info',
    title: 'Welcome to Argus',
    message: 'Argus monitors AI activity on your laptop.',
    detail:
      'Why macOS may show a permission prompt:\n' +
      'Argus can inspect cross-app AI activity (files, browser profiles, and credentials) in Deep Monitoring mode.\n\n' +
      'Start in Basic Mode to avoid that prompt and monitor process/network activity first.\n\n' +
      'Argus runs locally on this Mac. Your data is not uploaded by default.',
    buttons: ['Start in Basic Mode (Recommended)', 'Enable Deep Monitoring'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  const mode = res.response === 1 ? 'deep' : 'basic';
  process.env.ARGUS_PRIVACY_MODE = mode;
  saveSettings({
    onboardingVersion: ONBOARDING_VERSION,
    privacyMode: mode,
    updatedAt: new Date().toISOString(),
  });
  return mode;
}

function logStartup(line) {
  try {
    mkdirSync(dirname(STARTUP_LOG_PATH), { recursive: true });
    appendFileSync(STARTUP_LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // Best effort logging only
  }
}

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
  logStartup('Electron app.whenReady triggered');
  const privacyMode = await ensureInstallMessaging();
  logStartup(`Privacy mode selected: ${privacyMode}`);

  // Start the Argus monitoring backend
  let argusStop = null;
  try {
    logStartup('Importing backend module ../src/index.js');
    const { start, stop } = await import('../src/index.js');
    logStartup('Backend module import succeeded');
    await start({
      noWatch: false,
      noWeb: false,
      noNotify: false,
      noIpc: false,
      privacyMode,
    });
    logStartup('Backend start() succeeded');
    argusStop = stop;

    // Register restart callback so the dashboard "Restart" button works in Electron
    try {
      const { onRestartRequested } = await import('../src/web/server.js');
      onRestartRequested(() => {
        logStartup('Restart requested from dashboard');
        // Stop backend first, then relaunch after a short delay so the
        // OS has time to release the port and spawn the new process.
        const doRelaunch = () => {
          logStartup('Relaunching...');
          app.relaunch();
          // Use setTimeout so relaunch() registers before exit kills the process
          setTimeout(() => app.exit(0), 200);
        };
        if (argusStop) {
          Promise.resolve(argusStop()).then(doRelaunch).catch(doRelaunch);
        } else {
          doRelaunch();
        }
      });
      logStartup('Restart callback registered');
    } catch (err) {
      logStartup(`Could not register restart callback: ${err.message}`);
    }
  } catch (err) {
    console.error('[Argus] Backend failed to start:', err.message);
    logStartup(`Backend failed to start: ${err?.stack || err?.message || err}`);
    // Continue — the tray will show connection error in UI
  }

  // Wait briefly for web server to be ready
  await waitForWebServer('http://127.0.0.1:3131/api/status', 5000);
  logStartup('waitForWebServer completed');

  const iconPath = join(__dirname, 'assets',
    process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.png'
  );

  const mb = menubar({
    index: 'http://127.0.0.1:3131',
    icon: iconPath,
    browserWindow: {
      backgroundColor: '#0a0e14',
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
    // Keep renderer out of memory until the user actually opens the window.
    preloadWindow: false,
    showOnAllWorkspaces: false,
    showDockIcon: false,
  });

  mb.on('ready', () => {
    logStartup('Menubar ready');
    setupTray(mb);
  });

  // Handle second instance — show window
  app.on('second-instance', () => {
    mb.showWindow();
  });

  app.on('before-quit', async () => {
    logStartup('before-quit invoked');
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
