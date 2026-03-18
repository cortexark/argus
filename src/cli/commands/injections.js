/**
 * CLI command: argus injections
 * Lists prompt injection alerts from the database.
 *
 * Usage:
 *   argus injections [--since <duration>] [--json]
 *
 * Flags:
 *   --since <duration>   e.g. "24h", "1h", "30m", "7d" (default: 24h)
 *   --json               Output raw JSON instead of formatted table
 */

import { initializeDatabase } from '../../db/schema.js';
import { getInjectionAlerts } from '../../db/store.js';
import { config } from '../../lib/config.js';

/**
 * Parse a simple duration string into milliseconds.
 * Supported units: h (hours), m (minutes), d (days), s (seconds).
 * @param {string} str - e.g. "24h", "30m", "7d"
 * @returns {number|null}
 */
function parseDuration(str) {
  if (!str || typeof str !== 'string') return null;
  const match = /^(\d+)(h|m|d|s)$/.exec(str.trim());
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * multipliers[unit];
}

/**
 * Format a severity label with visual weight.
 * @param {string} severity
 * @returns {string}
 */
function formatSeverity(severity) {
  const labels = {
    CRITICAL: '[CRITICAL]',
    HIGH:     '[HIGH]    ',
    MEDIUM:   '[MEDIUM]  ',
    LOW:      '[LOW]     ',
  };
  return labels[severity] ?? `[${severity}]`;
}

/**
 * Run the injections command.
 * @param {object} opts
 * @param {string} [opts.since]  - duration string, default "24h"
 * @param {boolean} [opts.json]  - output raw JSON
 */
export async function runInjections(opts = {}) {
  const sinceDuration = opts.since || '24h';
  const durationMs = parseDuration(sinceDuration);

  if (durationMs === null) {
    console.error(`Error: Invalid --since value: "${sinceDuration}". Use formats like 1h, 30m, 7d.`);
    process.exit(1);
  }

  const sinceISO = new Date(Date.now() - durationMs).toISOString();

  const db = initializeDatabase(config.DB_PATH);
  let alerts;
  try {
    alerts = getInjectionAlerts(db, sinceISO);
  } finally {
    db.close();
  }

  if (opts.json) {
    console.log(JSON.stringify(alerts, null, 2));
    return;
  }

  if (alerts.length === 0) {
    console.log(`\nNo injection alerts in the last ${sinceDuration}.\n`);
    return;
  }

  console.log(`\nPrompt Injection Alerts (last ${sinceDuration})\n`);
  console.log(`${'─'.repeat(80)}`);

  for (const alert of alerts) {
    const sev = formatSeverity(alert.severity);
    const time = alert.timestamp.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    const app = alert.app_label || alert.process_name;
    const filePath = alert.file_path;

    let patterns;
    try {
      patterns = JSON.parse(alert.patterns);
    } catch {
      patterns = [alert.patterns];
    }

    console.log(`${sev}  ${time}`);
    console.log(`  App:     ${app}`);
    console.log(`  File:    ${filePath}`);
    console.log(`  Layer:   ${alert.layer}`);
    console.log(`  Pattern: ${patterns.join(', ')}`);
    if (alert.snippet) {
      console.log(`  Snippet: "${alert.snippet}"`);
    }
    console.log(`${'─'.repeat(80)}`);
  }

  console.log(`\nTotal: ${alerts.length} alert(s)\n`);
}

export default { runInjections };
