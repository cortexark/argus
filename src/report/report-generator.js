/**
 * Report generator for argus.
 * Builds human-readable or JSON reports from the database.
 */

import Table from 'cli-table3';
import {
  getRecentAlerts,
  getNetworkEvents,
  getActiveProcesses,
  getPortHistory,
} from '../db/store.js';

/**
 * Generate a report from the database.
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {string} [opts.sinceISO] - Filter events since this ISO timestamp
 * @param {string} [opts.processName] - Filter to a specific process name
 * @param {boolean} [opts.alertsOnly] - Only show file alerts
 * @param {string} [opts.format] - 'json' for JSON output, default is text
 * @returns {string | object}
 */
// Allowlist of supported output formats.
const ALLOWED_REPORT_FORMATS = new Set(['text', 'json']);

/**
 * Strip ANSI escape sequences and non-printable control characters.
 * Used to sanitize user-supplied strings before embedding them in text output.
 * @param {string} str
 * @returns {string}
 */
function sanitizeForOutput(str) {
  if (typeof str !== 'string') return '';
  // Remove ANSI escape sequences (ESC [ ... m and similar)
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

export function generateReport(db, opts = {}) {
  const {
    sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    processName = null,
    alertsOnly = false,
    format = 'text',
  } = opts;

  // Validate sinceISO is a proper ISO timestamp before using it in output.
  const safeSinceISO = typeof sinceISO === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(sinceISO)
    ? sinceISO
    : new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Validate format against allowlist.
  const safeFormat = ALLOWED_REPORT_FORMATS.has(format) ? format : 'text';

  const now = new Date().toISOString();

  // Gather data — use safeSinceISO for all DB queries
  const alerts = getRecentAlerts(db, safeSinceISO);
  const networkEvents = getNetworkEvents(db, safeSinceISO);
  const activeProcesses = getActiveProcesses(db, safeSinceISO);

  // Gather port history for each active process
  const portHistoryMap = {};
  for (const proc of activeProcesses) {
    if (proc.name) {
      portHistoryMap[proc.name] = getPortHistory(db, proc.name);
    }
  }

  // Collect unique AI services
  const aiServicesSet = new Set(
    networkEvents
      .map(e => e.ai_service)
      .filter(Boolean)
  );
  const aiServices = Array.from(aiServicesSet);

  if (safeFormat === 'json') {
    const data = {
      generated: now,
      period: { from: safeSinceISO, to: now },
      summary: {
        activeProcessCount: activeProcesses.length,
        fileAlertCount: alerts.length,
        networkEventCount: networkEvents.length,
        aiServicesContacted: aiServices,
      },
      fileAlerts: alerts,
      networkActivity: alertsOnly ? [] : networkEvents,
      portHistory: portHistoryMap,
    };
    return JSON.stringify(data, null, 2);
  }

  // Text format
  const lines = [];

  lines.push('=== AI WATCHER REPORT ===');
  lines.push(`Generated: ${now}`);
  lines.push(`Period: ${safeSinceISO} to ${now}`);
  lines.push('');

  // SUMMARY
  lines.push('SUMMARY');
  lines.push('-------');
  lines.push(`Active AI processes: ${activeProcesses.length}`);
  lines.push(`File access alerts: ${alerts.length}`);
  lines.push(`Network connections: ${networkEvents.length}`);
  lines.push(`AI services contacted: ${aiServices.length > 0 ? aiServices.join(', ') : 'none'}`);
  lines.push('');

  // FILE ACCESS ALERTS
  lines.push('FILE ACCESS ALERTS');
  lines.push('------------------');
  if (alerts.length === 0) {
    lines.push('No file access alerts in this period.');
  } else {
    const alertTable = new Table({
      head: ['Process', 'File', 'Sensitivity', 'Time'],
      colWidths: [18, 40, 14, 26],
      wordWrap: true,
    });
    for (const a of alerts) {
      alertTable.push([
        a.process_name || '',
        a.file_path || '',
        a.sensitivity || '',
        a.timestamp || '',
      ]);
    }
    lines.push(alertTable.toString());
  }
  lines.push('');

  if (!alertsOnly) {
    // NETWORK ACTIVITY
    lines.push('NETWORK ACTIVITY');
    lines.push('----------------');
    if (networkEvents.length === 0) {
      lines.push('No network activity in this period.');
    } else {
      const netTable = new Table({
        head: ['Process', 'Remote', 'Port', 'Service', 'State', 'Time'],
        colWidths: [14, 26, 6, 22, 14, 26],
        wordWrap: true,
      });
      for (const e of networkEvents) {
        netTable.push([
          e.process_name || '',
          e.remote_address || '',
          String(e.port || ''),
          e.ai_service || '',
          e.state || '',
          e.timestamp || '',
        ]);
      }
      lines.push(netTable.toString());
    }
    lines.push('');

    // PORT HISTORY
    lines.push('PORT HISTORY');
    lines.push('------------');
    const allPortRows = [];
    for (const [procName, rows] of Object.entries(portHistoryMap)) {
      for (const r of rows) {
        allPortRows.push([procName, String(r.port), r.first_seen, r.last_seen, String(r.connection_count)]);
      }
    }

    if (allPortRows.length === 0) {
      lines.push('No port history in this period.');
    } else {
      const portTable = new Table({
        head: ['Process', 'Port', 'First Seen', 'Last Seen', 'Count'],
        colWidths: [18, 7, 26, 26, 7],
        wordWrap: true,
      });
      for (const row of allPortRows) {
        portTable.push(row);
      }
      lines.push(portTable.toString());
    }
  }

  return lines.join('\n');
}

export default { generateReport };
