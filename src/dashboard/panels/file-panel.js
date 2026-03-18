/**
 * File access panel for the blessed dashboard.
 * Shows recent file access alerts with color coding by sensitivity.
 */

import blessed from 'blessed';

/**
 * Create the file access panel box.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} options - blessed box options
 * @returns {blessed.Widgets.BoxElement}
 */
export function create(screen, options = {}) {
  return blessed.box({
    label: ' File Access Alerts ',
    border: { type: 'line' },
    style: {
      border: { fg: 'red' },
      label: { fg: 'red', bold: true },
    },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    ...options,
  });
}

const SENSITIVITY_COLORS = {
  credentials: 'red',
  browserData: 'yellow',
  system: 'magenta',
  documents: 'white',
};

/**
 * Update the file panel with recent alerts.
 * @param {blessed.Widgets.BoxElement} box
 * @param {object[]} alerts - file_access_events rows
 */
export function update(box, alerts) {
  if (!alerts || alerts.length === 0) {
    box.setContent('{gray-fg}No file alerts{/gray-fg}');
    return;
  }

  const header = '{bold}Process          Sensitivity    File{/bold}';
  const separator = '{gray-fg}' + '-'.repeat(70) + '{/gray-fg}';

  const rows = alerts.map(a => {
    const color = SENSITIVITY_COLORS[a.sensitivity] || 'white';
    const proc = (a.process_name || '').padEnd(16).slice(0, 16);
    const sens = (a.sensitivity || 'unknown').padEnd(14).slice(0, 14);
    const filePath = (a.file_path || '').slice(-40);
    return `{${color}-fg}${proc} ${sens} ${filePath}{/${color}-fg}`;
  });

  box.setContent([header, separator, ...rows].join('\n'));
}

export default { create, update };
