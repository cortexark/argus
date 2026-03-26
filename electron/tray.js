/**
 * Tray icon setup — right-click menu, alert badge, live polling.
 * Icon states match macOS system tray conventions:
 *   - Normal (template)  — monitoring active, no alerts
 *   - Yellow dot          — new activity detected
 *   - Red dot             — critical alert (credentials, unknown domain)
 *   - Grey               — paused
 */

import pkg from 'electron';
const { Menu, shell, dialog, nativeImage } = pkg;
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLL_INTERVAL_MS = 5000;

// Alert severity thresholds for icon state
const CRITICAL_THRESHOLD = 1; // any critical alert turns icon red
const ACTIVITY_THRESHOLD = 1; // any activity turns icon yellow

/**
 * Create a tray icon with a colored status dot overlay.
 * @param {'none'|'yellow'|'red'|'grey'} dotColor
 * @returns {Electron.NativeImage}
 */
function createIconWithDot(dotColor) {
  const isRetina = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio >= 2 : true;
  const size = isRetina ? 32 : 16;
  const templatePath = join(__dirname, 'assets', isRetina ? 'iconTemplate@2x.png' : 'iconTemplate.png');

  const baseIcon = nativeImage.createFromPath(templatePath);

  if (dotColor === 'none') {
    baseIcon.setTemplateImage(true);
    return baseIcon;
  }

  // Draw a colored dot in the top-right corner using a data URL canvas
  const dotSize = isRetina ? 10 : 5;
  const dotOffset = isRetina ? 22 : 11;

  const colors = {
    red: '#ff3b30',
    yellow: '#ff9500',
    grey: '#8e8e93',
  };
  const color = colors[dotColor] || colors.grey;

  // Create an SVG with the dot overlay
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${dotOffset}" cy="${size - dotOffset + (isRetina ? 16 : 8)}" r="${dotSize / 2}" fill="${color}"/>
  </svg>`;

  const dotImage = nativeImage.createFromBuffer(
    Buffer.from(svg),
    { width: size, height: size, scaleFactor: isRetina ? 2.0 : 1.0 },
  );

  // Composite: base icon + dot overlay
  // Since Electron doesn't have native compositing, we return the base icon
  // and use setTitle for the indicator text (more reliable on macOS)
  baseIcon.setTemplateImage(dotColor === 'none' || dotColor === 'grey');
  return baseIcon;
}

/**
 * Set up the tray context menu and badge polling.
 * @param {import('menubar').Menubar} mb - menubar instance
 */
export function setupTray(mb) {
  let paused = false;
  let pollTimer = null;
  let lastIconState = 'none';
  let currentMenu = null;
  const argusDataDir = join(homedir(), '.argus');

  async function setMonitoringPaused(nextPaused) {
    try {
      // Sync against backend in case local state is stale.
      const status = await fetchStatus();
      paused = Boolean(status.paused);

      if (paused !== nextPaused) {
        const res = await fetch('http://127.0.0.1:3131/api/monitoring/toggle', { method: 'POST' });
        const data = await res.json();
        paused = Boolean(data.paused);
      }

      if (paused !== nextPaused) {
        throw new Error(nextPaused ? 'Unable to stop monitoring.' : 'Unable to start monitoring.');
      }
    } catch (err) {
      dialog.showErrorBox('Argus', `Could not update monitoring state: ${err.message}`);
    }
    updateBadge();
  }

  async function showUninstallHelp() {
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Uninstall Argus',
      message: 'Choose what you want to remove.',
      detail:
        'For the DMG app:\n' +
        '1) Quit Argus\n' +
        '2) Move Argus.app to Trash\n\n' +
        'Optional cleanup:\n' +
        '- Remove local data folder ~/.argus',
      buttons: ['Reveal Argus.app in Finder', 'Open ~/.argus Folder', 'Close'],
      defaultId: 2,
      cancelId: 2,
      noLink: true,
    });

    if (result.response === 0) {
      shell.showItemInFolder(process.execPath);
      return;
    }
    if (result.response === 1) {
      shell.openPath(argusDataDir);
    }
  }

  function buildContextMenu(alertCount, hasCritical) {
    const statusLabel = paused
      ? 'Argus — Paused'
      : hasCritical
        ? `Argus — ${alertCount} alert${alertCount !== 1 ? 's' : ''} (critical)`
        : alertCount > 0
          ? `Argus — ${alertCount} alert${alertCount !== 1 ? 's' : ''}`
          : 'Argus — All clear';

    return Menu.buildFromTemplate([
      {
        label: statusLabel,
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
          const wc = mb.window?.webContents;
          if (!wc) return;

          const openReportScript = `(() => {
            if (typeof window.openReportModal === 'function') {
              window.openReportModal();
              return true;
            }
            const reportBtn = document.getElementById('reportBtn');
            if (reportBtn) {
              reportBtn.click();
              return true;
            }
            return false;
          })();`;

          const openReport = () => {
            wc.executeJavaScript(openReportScript).catch(() => {
              // Best effort only; if the renderer is unavailable users can still use Open in Browser.
            });
          };

          if (wc.isLoadingMainFrame()) {
            wc.once('did-finish-load', openReport);
          } else {
            openReport();
          }
        },
      },
      { type: 'separator' },
      {
        label: paused ? '▶  Start Monitoring' : '■  Stop Monitoring',
        click: () => setMonitoringPaused(!paused),
      },
      {
        label: 'Uninstall Argus…',
        click: () => showUninstallHelp(),
      },
      { type: 'separator' },
      {
        label: 'Quit Argus',
        accelerator: 'CmdOrCtrl+Q',
        role: 'quit',
      },
    ]);
  }

  async function fetchStatus() {
    try {
      const res = await fetch('http://127.0.0.1:3131/api/status');
      if (!res.ok) return { alertCount: 0, paused: false, hasCritical: false };
      return await res.json();
    } catch {
      return { alertCount: 0, paused: false, hasCritical: false };
    }
  }

  async function updateBadge() {
    const status = await fetchStatus();
    paused = status.paused ?? false;
    const count = paused ? 0 : (Number(status.alertCount) || 0);
    const hasCritical = status.hasCritical ?? false;

    // Determine icon state
    let iconState = 'none';
    if (paused) {
      iconState = 'grey';
    } else if (hasCritical || count >= 5) {
      iconState = 'red';
    } else if (count >= ACTIVITY_THRESHOLD) {
      iconState = 'yellow';
    }

    // Only update icon if state changed (avoid flicker)
    if (iconState !== lastIconState) {
      lastIconState = iconState;
      try {
        const icon = createIconWithDot(iconState);
        mb.tray.setImage(icon);
      } catch {
        // Icon update failed — non-fatal
      }
    }

    // macOS: show count as tray title text next to icon
    if (process.platform === 'darwin') {
      if (paused) {
        mb.tray.setTitle(' ⏸');
      } else if (count > 0) {
        mb.tray.setTitle(hasCritical ? ` ⚠ ${count}` : ` ${count}`);
      } else {
        mb.tray.setTitle('');
      }
    }

    // Update tooltip
    mb.tray.setToolTip(
      paused
        ? 'Argus — Monitoring paused'
        : hasCritical
          ? `Argus — ${count} alert${count !== 1 ? 's' : ''} (critical)`
          : count > 0
            ? `Argus — ${count} alert${count !== 1 ? 's' : ''}`
            : 'Argus — Monitoring active',
    );

    // Keep context menu up to date without binding it to left-click on macOS.
    // Left-click should open the menubar window only; right-click opens this menu.
    currentMenu = buildContextMenu(count, hasCritical);
    if (process.platform !== 'darwin') {
      mb.tray.setContextMenu(currentMenu);
    }
  }

  // Initial setup
  currentMenu = buildContextMenu(0, false);
  if (process.platform !== 'darwin') {
    mb.tray.setContextMenu(currentMenu);
  } else {
    mb.tray.on('right-click', () => {
      mb.tray.popUpContextMenu(currentMenu);
    });
  }
  updateBadge();

  // Poll for badge updates
  pollTimer = setInterval(updateBadge, POLL_INTERVAL_MS);

  // Clean up on app quit
  mb.app.on('before-quit', () => {
    if (pollTimer) clearInterval(pollTimer);
  });
}
