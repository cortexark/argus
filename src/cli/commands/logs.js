/**
 * argus logs [options]
 *
 * Options:
 *   --follow / -f      tail -f style
 *   --lines N / -n N   last N lines (default 50)
 *   --since <duration> e.g. "1h", "30m", "2d"
 *   --level <level>    filter by log level
 *   --json             raw JSON output
 */

import { createReadStream, existsSync, watch } from 'node:fs';
import { createInterface } from 'node:readline';
import { getLogPath } from '../../lib/log-writer.js';

// Pino level number -> label
const LEVEL_LABELS = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const LEVEL_NAME_TO_NUM = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * Parse a duration string into milliseconds.
 * Supports: Xs (seconds), Xm (minutes), Xh (hours), Xd (days)
 * Returns null for invalid/empty input.
 * @param {string|null|undefined} str
 * @returns {number|null}
 */
export function parseDuration(str) {
  if (!str || typeof str !== 'string') return null;

  const match = str.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return Math.round(value * 1000);
    case 'm': return Math.round(value * 60 * 1000);
    case 'h': return Math.round(value * 60 * 60 * 1000);
    case 'd': return Math.round(value * 24 * 60 * 60 * 1000);
    default: return null;
  }
}

/**
 * Format a pino JSON log line for human display.
 * @param {string} jsonStr - Raw pino JSON line
 * @param {boolean} useJson - If true, return raw JSON
 * @returns {string}
 */
export function formatLogLine(jsonStr, useJson) {
  if (!jsonStr || !jsonStr.trim()) return '';

  if (useJson) {
    // Validate it's parseable JSON and return as-is
    try {
      JSON.parse(jsonStr);
      return jsonStr;
    } catch {
      return jsonStr;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Not valid JSON — return raw line
    return jsonStr;
  }

  const level = LEVEL_LABELS[parsed.level] || String(parsed.level || '?');
  const msg = parsed.msg || '';

  // Format time as HH:MM:SS from the pino timestamp
  let timeStr = '';
  if (parsed.time) {
    const d = new Date(parsed.time);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    timeStr = `${h}:${m}:${s}`;
  }

  return `[${timeStr}] ${level} ${msg}`.trimEnd();
}

/**
 * Read and display log lines from the log file.
 * @param {object} opts
 * @param {boolean} [opts.follow] - Tail -f style following
 * @param {number} [opts.lines] - Number of last lines to show (default 50)
 * @param {string} [opts.since] - Duration string e.g. "1h"
 * @param {string} [opts.level] - Min log level filter
 * @param {boolean} [opts.json] - Output raw JSON
 */
export async function runLogs(opts = {}) {
  const logPath = getLogPath();
  const useJson = opts.json ?? false;
  const maxLines = opts.lines ?? 50;
  const minLevelNum = opts.level ? (LEVEL_NAME_TO_NUM[opts.level.toLowerCase()] ?? 0) : 0;

  let sinceMs = null;
  if (opts.since) {
    sinceMs = parseDuration(opts.since);
    if (sinceMs === null) {
      console.error(`Invalid --since value: "${opts.since}". Use format like "1h", "30m", "2d".`);
      return;
    }
  }

  const sinceTime = sinceMs !== null ? Date.now() - sinceMs : null;

  if (!existsSync(logPath)) {
    console.log('No log file found. Daemon may not have been started yet.');
    console.log(`Expected log at: ${logPath}`);
    return;
  }

  // Read all lines first, then filter and show last N
  const allLines = await readAllLines(logPath);

  const filteredLines = allLines.filter((line) => {
    if (!line.trim()) return false;
    try {
      const parsed = JSON.parse(line);
      if (sinceTime !== null && parsed.time < sinceTime) return false;
      if (minLevelNum > 0 && parsed.level < minLevelNum) return false;
      return true;
    } catch {
      // Non-JSON lines always pass through
      return true;
    }
  });

  const displayLines = filteredLines.slice(-maxLines);
  for (const line of displayLines) {
    console.log(formatLogLine(line, useJson));
  }

  if (!opts.follow) return;

  // Follow mode: watch file for new content
  console.log('\n--- Following log (Ctrl+C to stop) ---\n');
  let fileSize = allLines.join('\n').length;

  watch(logPath, { persistent: true }, async (event) => {
    if (event !== 'change') return;
    const newLines = await readAllLines(logPath);
    const newContent = newLines.slice(-(newLines.length));

    // Find lines added since we last read
    for (let i = displayLines.length; i < newLines.length; i++) {
      const line = newLines[i];
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (sinceTime !== null && parsed.time < sinceTime) continue;
        if (minLevelNum > 0 && parsed.level < minLevelNum) continue;
      } catch {
        // Non-JSON lines pass through
      }
      console.log(formatLogLine(line, useJson));
    }
  });
}

/**
 * Read all lines from a file.
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
async function readAllLines(filePath) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines));
    rl.on('error', reject);
  });
}

export default { runLogs, parseDuration, formatLogLine };
