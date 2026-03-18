/**
 * CLI command: argus timeline
 * Interleaved event timeline grouped by time windows.
 *
 * Usage:
 *   argus timeline [--since <ISO|duration>] [--until <ISO>] [--app <name>] [--window <minutes>]
 *
 * Flags:
 *   --since <ISO|duration>  Start time as ISO date or duration (default: 1h)
 *   --until <ISO>           End time as ISO date (default: now)
 *   --app <name>            Filter by app label
 *   --window <minutes>      Group window size in minutes (default: 5)
 */

import { initializeDatabase } from '../../db/schema.js';
import { getCorrelationTimeline } from '../../db/queries.js';
import { parseDuration } from '../../lib/duration.js';
import { config } from '../../lib/config.js';
import chalk from 'chalk';

const HOME = process.env.HOME || '';

/** @type {Record<string, (s: string) => string>} */
const TYPE_COLORS = {
  FILE: (s) => chalk.yellow(s),
  NET:  (s) => chalk.cyan(s),
  PROC: (s) => chalk.green(s),
};

/**
 * Replace HOME prefix with ~ in a path.
 * @param {string} p
 * @returns {string}
 */
function collapsePath(p) {
  if (!p) return '';
  if (HOME && p.startsWith(HOME)) return '~' + p.slice(HOME.length);
  return p;
}

/**
 * Parse a --since value that can be either an ISO date string or a duration (e.g. "1h").
 * @param {string} str
 * @returns {string} ISO timestamp
 */
function parseSince(str) {
  if (!str) return new Date(Date.now() - parseDuration('1h')).toISOString();

  // Try duration pattern first (e.g. "1h", "30m", "2d")
  if (/^\d+(h|m|d|s)$/.test(str.trim())) {
    const ms = parseDuration(str);
    return new Date(Date.now() - ms).toISOString();
  }

  // Try ISO date
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString();

  console.error(`Error: Invalid --since value "${str}". Use an ISO date (e.g. 2024-01-01T00:00:00Z) or duration (e.g. 1h, 30m).`);
  process.exit(1);
}

/**
 * Parse and validate an ISO date string.
 * @param {string} str
 * @param {string} flag
 * @returns {string}
 */
function parseUntil(str, flag = '--until') {
  const d = new Date(str);
  if (isNaN(d.getTime())) {
    console.error(`Error: Invalid ${flag} value "${str}". Must be a valid ISO date.`);
    process.exit(1);
  }
  return d.toISOString();
}

/**
 * Compute the window bucket key for a given timestamp.
 * Returns the window start as a Date.
 * @param {string} iso - ISO timestamp
 * @param {number} windowMs - window size in milliseconds
 * @returns {Date}
 */
function windowStart(iso, windowMs) {
  const ms = new Date(iso).getTime();
  return new Date(Math.floor(ms / windowMs) * windowMs);
}

/**
 * Format a Date as HH:MM.
 * @param {Date} d
 * @returns {string}
 */
function formatHHMM(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Print a section header for a time window.
 * @param {Date} start
 * @param {Date} end
 * @param {number} termWidth
 */
function printWindowHeader(start, end, termWidth) {
  const label = ` ${formatHHMM(start)} \u2013 ${formatHHMM(end)} `;
  const dashes = '\u2500'.repeat(3);
  const tail = '\u2500'.repeat(Math.max(0, termWidth - dashes.length - label.length - 2));
  console.log(chalk.gray(`${dashes}${label}${tail}`));
}

/**
 * Print a single event row.
 * @param {{ event_type: string, app_label: string, detail: string }} event
 */
function printEventRow(event) {
  const type = event.event_type || 'UNK';
  const colorFn = TYPE_COLORS[type] ?? ((s) => s);
  const typeLabel = colorFn(type.padEnd(4));
  const app = chalk.bold((event.app_label || 'unknown').padEnd(14));
  const detail = collapsePath(event.detail || '');
  console.log(`  ${typeLabel}  ${app}  ${detail}`);
}

/**
 * Run the timeline command.
 * @param {object} opts
 * @param {string} [opts.since]       - ISO or duration string (default: 1h)
 * @param {string} [opts.until]       - ISO string (default: now)
 * @param {string} [opts.app]         - App label filter
 * @param {number|string} [opts.window] - Window size in minutes (default: 5)
 */
export async function runTimeline(opts = {}) {
  const sinceISO = parseSince(opts.since || '1h');
  const untilISO = opts.until ? parseUntil(opts.until) : new Date().toISOString();
  const appFilter = opts.app || null;
  const windowMinutes = Math.max(1, parseInt(String(opts.window || '5'), 10));

  if (isNaN(windowMinutes)) {
    console.error(`Error: Invalid --window value "${opts.window}". Must be a positive integer.`);
    process.exit(1);
  }

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
    events = getCorrelationTimeline(db, sinceISO, untilISO, appFilter);
  } finally {
    db.close();
  }

  if (events.length === 0) {
    console.log('\nNo events found in the specified time range.\n');
    return;
  }

  const windowMs = windowMinutes * 60_000;
  const termWidth = process.stdout.columns || 80;

  /** @type {Map<number, object[]>} */
  const buckets = new Map();

  for (const event of events) {
    const bucketTime = windowStart(event.timestamp, windowMs).getTime();
    if (!buckets.has(bucketTime)) buckets.set(bucketTime, []);
    buckets.get(bucketTime).push(event);
  }

  // Sort bucket keys ascending
  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);

  console.log();

  for (const key of sortedKeys) {
    const bucketEvents = buckets.get(key);
    if (!bucketEvents || bucketEvents.length === 0) continue;

    const start = new Date(key);
    const end = new Date(key + windowMs);

    printWindowHeader(start, end, termWidth);

    for (const event of bucketEvents) {
      printEventRow(event);
    }

    console.log();
  }
}

export default { runTimeline };
