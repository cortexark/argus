/**
 * Process panel for the blessed dashboard.
 * Shows active AI processes with PID, category, CPU, and memory.
 */

import blessed from 'blessed';

/**
 * Create the process panel box.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} options - blessed box options
 * @returns {blessed.Widgets.BoxElement}
 */
export function create(screen, options = {}) {
  return blessed.box({
    label: ' AI Processes ',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      label: { fg: 'cyan', bold: true },
    },
    scrollable: true,
    alwaysScroll: true,
    ...options,
  });
}

/**
 * Update the process panel with current process data.
 * @param {blessed.Widgets.BoxElement} box
 * @param {Array<{name, pid, category, cpu, memory}>} processes
 */
export function update(box, processes) {
  if (!processes || processes.length === 0) {
    box.setContent('{gray-fg}No AI processes detected{/gray-fg}');
    return;
  }

  const header = '{bold}{cyan-fg}Name             PID    Category         CPU%   MEM{/cyan-fg}{/bold}';
  const separator = '{gray-fg}' + '-'.repeat(65) + '{/gray-fg}';

  const rows = processes.map(p => {
    const name = (p.name || '').padEnd(16).slice(0, 16);
    const pid = String(p.pid || '').padEnd(6).slice(0, 6);
    const category = (p.category || '').padEnd(16).slice(0, 16);
    const cpu = (p.cpu != null ? p.cpu.toFixed(1) : '-').padEnd(6).slice(0, 6);
    const mem = p.memory != null ? Math.round(p.memory) + 'M' : '-';
    return `${name} ${pid} ${category} ${cpu} ${mem}`;
  });

  box.setContent([header, separator, ...rows].join('\n'));
}

export default { create, update };
