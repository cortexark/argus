/**
 * Blessed TUI dashboard for argus.
 * 2x2 grid layout: processes, file alerts, network, port history.
 * Keys: q=quit, r=refresh, p=pause/resume
 */

import blessed from 'blessed';
import { create as createProcessPanel, update as updateProcessPanel } from './panels/process-panel.js';
import { create as createFilePanel, update as updateFilePanel } from './panels/file-panel.js';
import { create as createNetworkPanel, update as updateNetworkPanel } from './panels/network-panel.js';
import { create as createPortPanel, update as updatePortPanel } from './panels/port-panel.js';
import {
  getRecentAlerts,
  getNetworkEvents,
  getActiveProcesses,
  getPortHistory,
} from '../db/store.js';

const REFRESH_INTERVAL_MS = 3000;

/**
 * Launch the interactive dashboard.
 * @param {import('better-sqlite3').Database} db
 */
export function launch(db) {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Argus',
    fullUnicode: true,
  });

  const sinceISO = () => new Date(Date.now() - 5 * 60 * 1000).toISOString(); // last 5 min

  // Create 2x2 panels
  const processPanel = createProcessPanel(screen, {
    top: 0,
    left: 0,
    width: '50%',
    height: '50%',
  });

  const filePanel = createFilePanel(screen, {
    top: 0,
    left: '50%',
    width: '50%',
    height: '50%',
  });

  const networkPanel = createNetworkPanel(screen, {
    top: '50%',
    left: 0,
    width: '50%',
    height: '50%',
  });

  const portPanel = createPortPanel(screen, {
    top: '50%',
    left: '50%',
    width: '50%',
    height: '50%',
  });

  // Status bar
  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' {bold}q{/bold}: quit  {bold}r{/bold}: refresh  {bold}p{/bold}: pause/resume',
    tags: true,
    style: { bg: 'blue', fg: 'white' },
  });

  screen.append(processPanel);
  screen.append(filePanel);
  screen.append(networkPanel);
  screen.append(portPanel);
  screen.append(statusBar);

  let paused = false;

  function refresh() {
    if (paused) return;

    const since = sinceISO();

    try {
      const activeProcesses = getActiveProcesses(db, since);
      updateProcessPanel(processPanel, activeProcesses);

      const alerts = getRecentAlerts(db, since);
      updateFilePanel(filePanel, alerts);

      const networkEvents = getNetworkEvents(db, since);
      updateNetworkPanel(networkPanel, networkEvents);

      // Aggregate port history for all active processes
      const portHistory = [];
      for (const proc of activeProcesses) {
        if (proc.name) {
          const rows = getPortHistory(db, proc.name);
          portHistory.push(...rows);
        }
      }
      updatePortPanel(portPanel, portHistory);
    } catch (err) {
      // Non-fatal — dashboard should continue even if DB read fails
    }

    screen.render();
  }

  // Initial render
  refresh();

  // Auto-refresh interval
  const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

  // Key bindings
  screen.key(['q', 'C-c'], () => {
    clearInterval(interval);
    screen.destroy();
    process.exit(0);
  });

  screen.key(['r'], () => {
    refresh();
  });

  screen.key(['p'], () => {
    paused = !paused;
    const status = paused ? 'PAUSED' : 'RUNNING';
    statusBar.setContent(` {bold}q{/bold}: quit  {bold}r{/bold}: refresh  {bold}p{/bold}: pause/resume  [{bold}${status}{/bold}]`);
    screen.render();
  });

  // Handle terminal resize
  screen.on('resize', () => {
    screen.render();
  });

  screen.render();

  return { screen, interval };
}

export default { launch };
