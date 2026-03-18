/**
 * CLI command: argus heatmap
 * ASCII bar chart of most-accessed files/folders.
 *
 * Usage:
 *   argus heatmap [--since <duration>] [--top <N>]
 *
 * Flags:
 *   --since <duration>  Time window e.g. "24h", "1h", "7d" (default: 24h)
 *   --top <N>           Show top N entries (default: 20)
 */

import { dirname } from 'node:path';
import { initializeDatabase } from '../../db/schema.js';
import { getFileAccessHeatmap } from '../../db/queries.js';
import { parseDuration } from '../../lib/duration.js';
import { config } from '../../lib/config.js';
import chalk from 'chalk';

const HOME = process.env.HOME || '';

/**
 * Replace the HOME prefix with ~ in a path.
 * @param {string} p
 * @returns {string}
 */
function collapsePath(p) {
  if (HOME && p.startsWith(HOME)) return '~' + p.slice(HOME.length);
  return p;
}

/**
 * Group raw file access rows by parent directory.
 * Sums access counts across all files under each directory.
 * @param {{ file_path: string, access_count: number }[]} rows
 * @returns {{ dir: string, count: number }[]} sorted descending by count
 */
function groupByDirectory(rows) {
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const row of rows) {
    const dir = collapsePath(dirname(row.file_path));
    counts.set(dir, (counts.get(dir) ?? 0) + row.access_count);
  }

  return [...counts.entries()]
    .map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Render a bar of a given width using block characters.
 * @param {number} width
 * @returns {string}
 */
function renderBar(width) {
  return '\u2588'.repeat(Math.max(0, width));
}

/**
 * Run the heatmap command.
 * @param {object} opts
 * @param {string} [opts.since]  - Duration string (default: "24h")
 * @param {number|string} [opts.top]   - Max entries to show (default: 20)
 */
export async function runHeatmap(opts = {}) {
  const sinceDuration = opts.since || '24h';
  const topN = Math.max(1, parseInt(String(opts.top || '20'), 10));

  if (isNaN(topN)) {
    console.error(`Error: Invalid --top value "${opts.top}". Must be a positive integer.`);
    process.exit(1);
  }

  const durationMs = parseDuration(sinceDuration);
  const sinceISO = new Date(Date.now() - durationMs).toISOString();

  let db;
  try {
    db = initializeDatabase(config.DB_PATH);
  } catch (err) {
    console.error(`Error: Failed to open database: ${err.message}`);
    process.exit(1);
  }

  let rows;
  try {
    // Fetch more rows than needed so grouping by dir gives accurate top-N
    rows = getFileAccessHeatmap(db, sinceISO, topN * 10);
  } finally {
    db.close();
  }

  const grouped = groupByDirectory(rows).slice(0, topN);

  if (grouped.length === 0) {
    console.log(`\nNo file access events in the last ${sinceDuration}.\n`);
    return;
  }

  const termWidth = process.stdout.columns || 80;
  const maxCount = grouped[0].count;

  // Layout: label column + gap + bar + space + count
  const maxLabelLen = Math.max(...grouped.map((e) => e.dir.length));
  const labelWidth = Math.min(maxLabelLen, 40);
  const countWidth = String(maxCount).length + 2; // "(N)"
  const barAreaWidth = Math.max(10, termWidth - labelWidth - countWidth - 6);

  const divider = chalk.gray('\u2500'.repeat(Math.min(termWidth, 80)));

  console.log(chalk.bold(`\nAccess Heatmap (last ${sinceDuration})`));
  console.log(divider);

  for (const { dir, count } of grouped) {
    const barWidth = Math.round((count / maxCount) * barAreaWidth);
    const bar = chalk.cyan(renderBar(barWidth));
    const countStr = chalk.gray(`(${count})`);
    const label = dir.padEnd(labelWidth).slice(0, labelWidth);
    console.log(`${label}  ${bar.padEnd(barAreaWidth)}  ${countStr}`);
  }

  console.log(divider);
  console.log();
}

export default { runHeatmap };
