/**
 * Port history panel for the blessed dashboard.
 */

import blessed from 'blessed';

/**
 * Create the port history panel box.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} options
 * @returns {blessed.Widgets.BoxElement}
 */
export function create(screen, options = {}) {
  return blessed.box({
    label: ' Port History ',
    border: { type: 'line' },
    style: {
      border: { fg: 'magenta' },
      label: { fg: 'magenta', bold: true },
    },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    ...options,
  });
}

/**
 * Update the port panel with port history data.
 * @param {blessed.Widgets.BoxElement} box
 * @param {Array<{processName, port, connectionCount, firstSeen, lastSeen}>} portHistory
 */
export function update(box, portHistory) {
  if (!portHistory || portHistory.length === 0) {
    box.setContent('{gray-fg}No port history{/gray-fg}');
    return;
  }

  const header = '{bold}Process          Ports Used Today          Total Connections{/bold}';
  const separator = '{gray-fg}' + '-'.repeat(65) + '{/gray-fg}';

  // Group by process name
  const byProcess = {};
  for (const entry of portHistory) {
    const name = entry.process_name || entry.processName || 'unknown';
    if (!byProcess[name]) byProcess[name] = { ports: [], totalCount: 0 };
    byProcess[name].ports.push(entry.port);
    byProcess[name].totalCount += (entry.connection_count || entry.count || 1);
  }

  const rows = Object.entries(byProcess).map(([procName, data]) => {
    const name = procName.padEnd(16).slice(0, 16);
    const ports = data.ports.slice(0, 5).join(', ').padEnd(25).slice(0, 25);
    const total = String(data.totalCount);
    return `${name} ${ports} ${total}`;
  });

  box.setContent([header, separator, ...rows].join('\n'));
}

export default { create, update };
