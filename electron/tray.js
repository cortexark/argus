/**
 * Tray icon setup — right-click menu, alert badge, live polling.
 */

import pkg from 'electron';
const { Menu, shell, dialog } = pkg;

const POLL_INTERVAL_MS = 5000;

/**
 * Set up the tray context menu and badge polling.
 * @param {import('menubar').Menubar} mb - menubar instance
 * @param {{ stop: Function|null }} opts
 */
export function setupTray(mb, { stop }) {
  let paused = false;
  let pollTimer = null;

  function buildContextMenu(alertCount) {
    return Menu.buildFromTemplate([
      {
        label: `Argus${alertCount > 0 ? ` — ${alertCount} alert${alertCount !== 1 ? 's' : ''}` : ''}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        accelerator: 'CmdOrCtrl+Shift+A',
        click: () => mb.showWindow(),
      },
      {
        label: 'Open in Browser',
        click: () => shell.openExternal('http://localhost:3131'),
      },
      { type: 'separator' },
      {
        label: 'Generate Report',
        click: () => {
          mb.showWindow();
          mb.window?.webContents.executeJavaScript(
            "document.querySelector('[data-tab=\"report\"]')?.click()",
          );
        },
      },
      { type: 'separator' },
      {
        label: paused ? 'Resume Monitoring' : 'Pause Monitoring',
        click: async () => {
          paused = !paused;
          if (paused && stop) {
            try { await stop(); } catch { /* ignore */ }
          } else if (!paused) {
            try {
              const { start } = await import('../src/index.js');
              await start({ noWatch: false, noWeb: false, noNotify: false });
            } catch (err) {
              dialog.showErrorBox('Argus', `Failed to resume monitoring: ${err.message}`);
            }
          }
          updateBadge();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Argus',
        accelerator: 'CmdOrCtrl+Q',
        role: 'quit',
      },
    ]);
  }

  async function fetchAlertCount() {
    try {
      const res = await fetch('http://127.0.0.1:3131/api/status');
      if (!res.ok) return 0;
      const data = await res.json();
      return Number(data.alertCount) || 0;
    } catch {
      return 0;
    }
  }

  async function updateBadge() {
    const count = paused ? 0 : await fetchAlertCount();

    // macOS: show count as tray title text next to icon
    if (process.platform === 'darwin') {
      mb.tray.setTitle(count > 0 ? String(count) : '');
    }

    // Update tooltip
    mb.tray.setToolTip(
      paused
        ? 'Argus — Monitoring paused'
        : count > 0
        ? `Argus — ${count} alert${count !== 1 ? 's' : ''}`
        : 'Argus — Monitoring active',
    );

    // Update context menu with fresh count
    mb.tray.setContextMenu(buildContextMenu(count));
  }

  // Initial setup
  mb.tray.setContextMenu(buildContextMenu(0));
  updateBadge();

  // Poll for badge updates
  pollTimer = setInterval(updateBadge, POLL_INTERVAL_MS);

  // Clean up on app quit
  mb.app.on('before-quit', () => {
    if (pollTimer) clearInterval(pollTimer);
  });
}
