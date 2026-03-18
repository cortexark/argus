/**
 * CLI command: argus baseline
 * View and manage behavioral baselines.
 *
 * Usage:
 *   argus baseline show [--app <name>]          — display baseline table
 *   argus baseline reset [--app <name>] [--force] — delete baseline data
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { initializeDatabase } from '../../db/schema.js';
import { getBaselines } from '../../db/queries.js';
import { getBaselineSummary } from '../../lib/baseline-engine.js';
import { config } from '../../lib/config.js';
import chalk from 'chalk';

const MIN_SAMPLES = 168; // 7 days of hourly data

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Open the database directly (daemon may not be running).
 * @returns {import('better-sqlite3').Database}
 */
function openDb() {
  return initializeDatabase(config.DB_PATH);
}

/**
 * Get all distinct app_labels that have baseline entries.
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]}
 */
function getBaselineApps(db) {
  const rows = db
    .prepare('SELECT DISTINCT app_label FROM baselines ORDER BY app_label')
    .all();
  return rows.map((r) => r.app_label);
}

/**
 * Delete all baselines for a given app label, or all baselines if appLabel is null.
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} appLabel
 */
function deleteBaselines(db, appLabel) {
  if (appLabel) {
    db.prepare('DELETE FROM baselines WHERE app_label = ?').run(appLabel);
  } else {
    db.prepare('DELETE FROM baselines').run();
  }
}

/**
 * Prompt the user for a yes/no answer.
 * @param {string} question
 * @returns {Promise<boolean>}
 */
async function confirm(question) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

// ─── Subcommand: show ─────────────────────────────────────────────────────────

/**
 * Display baseline summaries as a table.
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} appLabel - filter to one app, or null for all
 */
function handleShow(db, appLabel) {
  const apps = appLabel ? [appLabel] : getBaselineApps(db);

  console.log(chalk.bold('\nBehavioral Baselines\n'));

  if (apps.length === 0) {
    console.log(chalk.gray('  No baselines recorded yet.'));
    console.log(chalk.gray(`  Baselines build up after ${MIN_SAMPLES} hourly samples (7 days).\n`));
    return;
  }

  for (const label of apps) {
    const summary = getBaselineSummary(db, label);
    const baselines = getBaselines(db, label);

    const connBaseline = baselines.find((b) => b.metric_type === 'connections_per_hour');
    const ready = (connBaseline?.sample_count ?? 0) >= MIN_SAMPLES;

    console.log(chalk.cyan(`App: ${label}`));
    console.log(chalk.gray('─'.repeat(60)));

    // Sample count / readiness
    const sampleStr = `${summary.sampleCount} sample${summary.sampleCount !== 1 ? 's' : ''}`;
    const readyBadge = ready
      ? chalk.green('[ready]')
      : chalk.yellow(`[learning — need ${MIN_SAMPLES - summary.sampleCount} more]`);
    console.log(`  Samples:             ${sampleStr}  ${readyBadge}`);

    // Avg connections/hour
    const avgStr = summary.avgConnectionsPerHour > 0
      ? summary.avgConnectionsPerHour.toFixed(2)
      : chalk.gray('n/a');
    console.log(`  Avg connections/hr:  ${avgStr}`);

    // Known endpoints
    if (summary.endpoints.length > 0) {
      console.log(`  Known endpoints (${summary.endpoints.length}):`);
      summary.endpoints.slice(0, 10).forEach((e) => {
        console.log(`    ${chalk.gray('•')} ${e}`);
      });
      if (summary.endpoints.length > 10) {
        console.log(chalk.gray(`    … and ${summary.endpoints.length - 10} more`));
      }
    } else {
      console.log(`  Known endpoints:     ${chalk.gray('none yet')}`);
    }

    // Known file path prefixes
    if (summary.filePaths.length > 0) {
      console.log(`  Known file paths (${summary.filePaths.length}):`);
      summary.filePaths.slice(0, 10).forEach((p) => {
        console.log(`    ${chalk.gray('•')} ${p}`);
      });
      if (summary.filePaths.length > 10) {
        console.log(chalk.gray(`    … and ${summary.filePaths.length - 10} more`));
      }
    } else {
      console.log(`  Known file paths:    ${chalk.gray('none yet')}`);
    }

    console.log();
  }
}

// ─── Subcommand: reset ────────────────────────────────────────────────────────

/**
 * Reset (delete) baselines, with optional confirmation prompt.
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} appLabel
 * @param {boolean} force
 */
async function handleReset(db, appLabel, force) {
  const scope = appLabel ? `app "${appLabel}"` : 'ALL apps';

  if (!force) {
    const confirmed = await confirm(
      chalk.yellow(`Reset baselines for ${scope}? This cannot be undone.`)
    );
    if (!confirmed) {
      console.log(chalk.gray('Reset cancelled.'));
      return;
    }
  }

  // Validate the app exists if specified
  if (appLabel) {
    const existing = getBaselines(db, appLabel);
    if (existing.length === 0) {
      console.log(chalk.yellow(`No baselines found for app "${appLabel}".`));
      return;
    }
  }

  deleteBaselines(db, appLabel ?? null);
  console.log(chalk.green(`Baselines reset for ${scope}.`));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Run the baseline command.
 * @param {string[]} args - CLI args after "baseline"
 */
export async function runBaseline(args) {
  // Parse flags
  const positional = [];
  const flags = {};

  for (let i = 0; i < (args ?? []).length; i++) {
    const arg = args[i];
    if (arg === '--force') {
      flags.force = true;
    } else if (arg === '--app' && args[i + 1]) {
      flags.app = args[++i];
    } else {
      positional.push(arg);
    }
  }

  const [subcommand] = positional;

  if (!subcommand || subcommand === 'show') {
    const db = openDb();
    try {
      handleShow(db, flags.app ?? null);
    } finally {
      db.close();
    }
    return;
  }

  if (subcommand === 'reset') {
    const db = openDb();
    try {
      await handleReset(db, flags.app ?? null, flags.force ?? false);
    } finally {
      db.close();
    }
    return;
  }

  console.log(chalk.bold('\nargus baseline — view and manage behavioral baselines\n'));
  console.log('Usage:');
  console.log(`  ${chalk.cyan('argus baseline show [--app <name>]')}          Show baseline table`);
  console.log(`  ${chalk.cyan('argus baseline reset [--app <name>] [--force]')}  Reset baselines`);
  console.log();
  console.error(chalk.red(`Unknown subcommand: "${subcommand}"`));
  process.exit(1);
}

export default { runBaseline };
