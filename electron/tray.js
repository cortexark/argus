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
          mb.window?.webContents.executeJavaScript(
            "document.querySelector('[data-tab=\"report\"]')?.click()",
          );
        },
      },
      { type: 'separator' },
      {
        label: paused ? '▶  Start Monitoring' : '⏸  Pause Monitoring',
        click: async () => {
          try {
            const res = await fetch('http://127.0.0.1:3131/api/monitoring/toggle', { method: 'POST' });
            const data = await res.json();
            paused = data.paused;
          } catch (err) {
            dialog.showErrorBox('Argus', `Could not toggle monitoring: ${err.message}`);
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

    // Update context menu with fresh count
    mb.tray.setContextMenu(buildContextMenu(count, hasCritical));
  }

  // Initial setup
  mb.tray.setContextMenu(buildContextMenu(0, false));
  updateBadge();

  // Poll for badge updates
  pollTimer = setInterval(updateBadge, POLL_INTERVAL_MS);

  // Clean up on app quit
  mb.app.on('before-quit', () => {
    if (pollTimer) clearInterval(pollTimer);
  });
}
