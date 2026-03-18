/**
 * Network connections panel for the blessed dashboard.
 */

import blessed from 'blessed';

/**
 * Create the network panel box.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} options
 * @returns {blessed.Widgets.BoxElement}
 */
export function create(screen, options = {}) {
  return blessed.box({
    label: ' Network Connections ',
    border: { type: 'line' },
    style: {
      border: { fg: 'green' },
      label: { fg: 'green', bold: true },
    },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    ...options,
  });
}

/**
 * Update the network panel with recent connection events.
 * @param {blessed.Widgets.BoxElement} box
 * @param {object[]} events - network_events rows
 */
export function update(box, events) {
  if (!events || events.length === 0) {
    box.setContent('{gray-fg}No network connections{/gray-fg}');
    return;
  }

  const header = '{bold}Process        Remote                   Port  Service              State{/bold}';
  const separator = '{gray-fg}' + '-'.repeat(75) + '{/gray-fg}';

  const rows = events.map(e => {
    const proc = (e.process_name || '').padEnd(14).slice(0, 14);
    const remote = (e.remote_address || '').padEnd(24).slice(0, 24);
    const port = String(e.port || '').padEnd(5).slice(0, 5);
    const service = (e.ai_service || '').padEnd(20).slice(0, 20);
    const state = (e.state || '').padEnd(12).slice(0, 12);
    const color = e.ai_service ? 'yellow' : 'white';
    return `{${color}-fg}${proc} ${remote} ${port} ${service} ${state}{/${color}-fg}`;
  });

  box.setContent([header, separator, ...rows].join('\n'));
}

export default { create, update };
