/**
 * CLI command: argus export
 * Export all events to CSV, JSON, or HTML.
 *
 * Usage:
 *   argus export [--format csv|json|html] [--since <ISO>] [--until <ISO>] [--output <path>]
 *
 * Flags:
 *   --format csv|json|html   Output format (default: json)
 *   --since <ISO>            Start time (default: 24h ago)
 *   --until <ISO>            End time (default: now)
 *   --output <path>          Output file path (default: stdout for csv/json, ~/.argus/export-YYYY-MM-DD.html for html)
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeDatabase } from '../../db/schema.js';
import { getEventsForExport } from '../../db/queries.js';
import { config } from '../../lib/config.js';

const VALID_FORMATS = ['csv', 'json', 'html'];

const HOME = process.env.HOME || '';

/**
 * Escape a CSV field value. Wraps in quotes if it contains commas, quotes, or newlines.
 * @param {unknown} value
 * @returns {string}
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Format events as CSV string.
 * @param {object[]} events
 * @returns {string}
 */
function formatCsv(events) {
  const header = 'timestamp,app,event_type,detail,severity';
  const rows = events.map((e) =>
    [
      escapeCsvField(e.timestamp),
      escapeCsvField(e.app_label),
      escapeCsvField(e.event_type),
      escapeCsvField(e.detail),
      escapeCsvField(e.severity),
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

/**
 * Escape HTML special characters.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format events as a self-contained dark-theme HTML table.
 * @param {object[]} events
 * @param {string} sinceISO
 * @param {string} untilISO
 * @returns {string}
 */
function formatHtml(events, sinceISO, untilISO) {
  const rows = events.map((e) => `
    <tr>
      <td>${escapeHtml(e.timestamp)}</td>
      <td>${escapeHtml(e.app_label)}</td>
      <td>${escapeHtml(e.event_type)}</td>
      <td>${escapeHtml(e.detail)}</td>
      <td class="sev-${escapeHtml((e.severity || 'INFO').toLowerCase())}">${escapeHtml(e.severity || 'INFO')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Argus Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      padding: 24px;
    }
    h1 { color: #58a6ff; margin-bottom: 8px; font-size: 18px; }
    .meta { color: #8b949e; margin-bottom: 20px; font-size: 12px; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    th {
      background: #161b22;
      color: #8b949e;
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid #30363d;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    td {
      padding: 6px 12px;
      border-bottom: 1px solid #21262d;
      vertical-align: top;
      word-break: break-word;
    }
    tr:hover td { background: #161b22; }
    .sev-critical { color: #ff7b72; font-weight: bold; }
    .sev-high     { color: #ffa657; }
    .sev-medium   { color: #e3b341; }
    .sev-low      { color: #c9d1d9; }
    .sev-info     { color: #79c0ff; }
    .empty { color: #8b949e; text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <h1>Argus Event Export</h1>
  <div class="meta">
    Period: ${escapeHtml(sinceISO)} — ${escapeHtml(untilISO)} &nbsp;|&nbsp;
    Total events: ${events.length} &nbsp;|&nbsp;
    Generated: ${new Date().toISOString()}
  </div>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>App</th>
        <th>Type</th>
        <th>Detail</th>
        <th>Severity</th>
      </tr>
    </thead>
    <tbody>
      ${events.length === 0 ? '<tr><td colspan="5" class="empty">No events in this period.</td></tr>' : rows}
    </tbody>
  </table>
</body>
</html>
`;
}

/**
 * Parse and validate an ISO date string.
 * @param {string} str
 * @param {string} flag - Flag name for error message
 * @returns {string} validated ISO string
 */
function validateIsoDate(str, flag) {
  const d = new Date(str);
  if (isNaN(d.getTime())) {
    console.error(`Error: Invalid ${flag} value "${str}". Must be a valid ISO date (e.g. 2024-01-01T00:00:00Z).`);
    process.exit(1);
  }
  return d.toISOString();
}

/**
 * Build the default HTML export output path.
 * @returns {string}
 */
function defaultHtmlPath() {
  const date = new Date().toISOString().slice(0, 10);
  return join(HOME, '.argus', `export-${date}.html`);
}

/**
 * Run the export command.
 * @param {object} opts
 * @param {string} [opts.format]  - 'csv', 'json', or 'html'
 * @param {string} [opts.since]   - ISO date string
 * @param {string} [opts.until]   - ISO date string
 * @param {string} [opts.output]  - Output file path
 */
export async function runExport(opts = {}) {
  const format = (opts.format || 'json').toLowerCase();

  if (!VALID_FORMATS.includes(format)) {
    console.error(`Error: Invalid --format "${opts.format}". Valid values: ${VALID_FORMATS.join(', ')}`);
    process.exit(1);
  }

  const sinceISO = opts.since
    ? validateIsoDate(opts.since, '--since')
    : new Date(Date.now() - 86_400_000).toISOString();

  const untilISO = opts.until
    ? validateIsoDate(opts.until, '--until')
    : new Date().toISOString();

  if (new Date(sinceISO) > new Date(untilISO)) {
    console.error('Error: --since must be before --until.');
    process.exit(1);
  }

  let db;
  try {
    db = initializeDatabase(config.DB_PATH);
  } catch (err) {
    console.error(`Error: Failed to open database: ${err.message}`);
    process.exit(1);
  }

  let events;
  try {
    events = getEventsForExport(db, sinceISO, untilISO);
  } finally {
    db.close();
  }

  let output;
  try {
    if (format === 'csv') {
      output = formatCsv(events);
    } else if (format === 'json') {
      output = JSON.stringify(events, null, 2) + '\n';
    } else {
      output = formatHtml(events, sinceISO, untilISO);
    }
  } catch (err) {
    console.error(`Error: Failed to format output: ${err.message}`);
    process.exit(1);
  }

  // HTML defaults to file output; csv/json default to stdout
  if (format === 'html') {
    const outPath = opts.output || defaultHtmlPath();
    try {
      writeFileSync(outPath, output, 'utf8');
      console.log(`Exported ${events.length} events to ${outPath}`);
    } catch (err) {
      console.error(`Error: Failed to write file "${outPath}": ${err.message}`);
      process.exit(1);
    }
  } else if (opts.output) {
    try {
      writeFileSync(opts.output, output, 'utf8');
      console.log(`Exported ${events.length} events to ${opts.output}`);
    } catch (err) {
      console.error(`Error: Failed to write file "${opts.output}": ${err.message}`);
      process.exit(1);
    }
  } else {
    process.stdout.write(output);
  }
}

export default { runExport };
