/**
 * CLI command: argus feed
 * Live real-time alert feed. Polls DB every 1 second for new events.
 *
 * Usage:
 *   argus feed [--severity <level>] [--app <name>]
 *
 * Flags:
 *   --severity <level>  Filter by severity (CRITICAL, HIGH, MEDIUM, LOW, INFO)
 *   --app <name>        Filter by app label
 */

import { initializeDatabase } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import chalk from 'chalk';

const HOME = process.env.HOME || '';

const SEVERITY_COLORS = {
  CRITICAL: (s) => chalk.bold.red(s),
  HIGH:     (s) => chalk.red(s),
  MEDIUM:   (s) => chalk.yellow(s),
  LOW:      (s) => chalk.white(s),
  INFO:     (s) => chalk.cyan(s),
};

/**
 * Format a severity label, padded to fixed width.
 * @param {string} severity
 * @returns {string}
 */
function colorSeverity(severity) {
  const padded = severity.padEnd(8);
  const colorFn = SEVERITY_COLORS[severity] ?? ((s) => s);
  return colorFn(padded);
}

/**
 * Format a timestamp ISO string as HH:MM:SS.
 * @param {string} iso
 * @returns {string}
 */
function formatTime(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Replace HOME prefix with ~.
 * @param {string} p
 * @returns {string}
 */
function collapsePath(p) {
  if (HOME && p.startsWith(HOME)) return '~' + p.slice(HOME.length);
  return p;
}

/**
 * Build a merged, sorted list of events from file and network tables.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO
 * @param {string|null} severityFilter
 * @param {string|null} appFilter
 * @returns {object[]}
 */
function queryEvents(db, sinceISO, severityFilter, appFilter) {
  let fileSql = `
    SELECT timestamp, app_label, file_path as detail, severity
    FROM file_access_events
    WHERE timestamp > ?
  `;
  const fileParams = [sinceISO];

  if (appFilter) {
    fileSql += ' AND app_label = ?';
    fileParams.push(appFilter);
  }
  if (severityFilter && severityFilter !== 'INFO') {
    fileSql += ' AND severity = ?';
    fileParams.push(severityFilter);
  }

  let netSql = `
    SELECT timestamp, app_label, remote_host as detail, 'INFO' as severity
    FROM network_events
    WHERE timestamp > ?
  `;
  const netParams = [sinceISO];

  if (appFilter) {
    netSql += ' AND app_label = ?';
    netParams.push(appFilter);
  }

  const fileRows = db.prepare(fileSql).all(...fileParams);
  // If filtering by a non-INFO severity, skip network events entirely
  const netRows = (severityFilter && severityFilter !== 'INFO')
    ? []
    : db.prepare(netSql).all(...netParams);

  return [...fileRows, ...netRows].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
  );
}

/**
 * Print a single event row.
 * @param {object} event
 */
function printEvent(event) {
  const time = chalk.gray(`[${formatTime(event.timestamp)}]`);
  const sev = colorSeverity(event.severity || 'INFO');
  const app = chalk.bold((event.app_label || 'unknown').padEnd(12));
  const detail = collapsePath(event.detail || '');
  console.log(`${time} ${sev}  ${app}  ${detail}`);
}

/**
 * Run the feed command.
 * @param {object} opts
 * @param {string} [opts.severity] - Severity filter
 * @param {string} [opts.app]      - App label filter
 */
export async function runFeed(opts = {}) {
  const severityFilter = opts.severity ? opts.severity.toUpperCase() : null;
  const appFilter = opts.app || null;

  const VALID_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  if (severityFilter && !VALID_SEVERITIES.includes(severityFilter)) {
    console.error(`Error: Invalid --severity "${opts.severity}". Valid values: ${VALID_SEVERITIES.join(', ')}`);
    process.exit(1);
  }

  let db;
  try {
    db = initializeDatabase(config.DB_PATH);
  } catch (err) {
    console.error(`Error: Failed to open database: ${err.message}`);
    process.exit(1);
  }

  console.log(chalk.bold('Argus Live Feed') + chalk.gray(' — Ctrl+C to stop'));
  if (severityFilter) console.log(chalk.gray(`Filtering: severity=${severityFilter}`));
  if (appFilter) console.log(chalk.gray(`Filtering: app=${appFilter}`));
  console.log();

  // Show last 20 events on startup
  const startupSince = new Date(Date.now() - 86_400_000 * 7).toISOString();
  let allStartup = queryEvents(db, startupSince, severityFilter, appFilter);
  const initial = allStartup.slice(-20);
  for (const event of initial) {
    printEvent(event);
  }

  // Track latest-seen timestamp to avoid re-printing
  let lastTimestamp = initial.length > 0
    ? initial[initial.length - 1].timestamp
    : new Date().toISOString();

  // Poll for new events every second
  const intervalId = setInterval(() => {
    try {
      const newEvents = queryEvents(db, lastTimestamp, severityFilter, appFilter);
      for (const event of newEvents) {
        printEvent(event);
        if (event.timestamp > lastTimestamp) {
          lastTimestamp = event.timestamp;
        }
      }
    } catch (err) {
      console.error(chalk.red(`Poll error: ${err.message}`));
    }
  }, 1000);

  // Graceful cleanup on SIGINT
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    try { db.close(); } catch { /* ignore */ }
    console.log('\n' + chalk.gray('Feed stopped.'));
    process.exit(0);
  });
}

export default { runFeed };
