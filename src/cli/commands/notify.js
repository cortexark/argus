/**
 * CLI command: argus notify
 * Configure and test notification channels (Slack, email).
 *
 * Usage:
 *   argus notify slack <webhook-url>    — save Slack webhook
 *   argus notify email <address>        — save email address
 *   argus notify show                   — display current config
 *   argus notify test                   — run digest and send to all channels
 *   argus notify remove <channel>       — remove a channel config
 */

import { initializeDatabase } from '../../db/schema.js';
import {
  upsertNotificationConfig,
  getNotificationConfig,
} from '../../db/queries.js';
import { runDailyDigest } from '../../lib/digest.js';
import { config } from '../../lib/config.js';
import chalk from 'chalk';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a Slack webhook URL.
 * @param {string} url
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSlackUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required.' };
  }
  if (!url.startsWith('https://')) {
    return { valid: false, error: 'Slack webhook URL must start with https://' };
  }
  return { valid: true };
}

/**
 * Validate an email address.
 * @param {string} address
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEmail(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Email address is required.' };
  }
  if (!EMAIL_RE.test(address.trim())) {
    return { valid: false, error: `"${address}" does not look like a valid email address.` };
  }
  return { valid: true };
}

/**
 * Open the database directly (daemon may not be running).
 * Caller is responsible for closing.
 * @returns {import('better-sqlite3').Database}
 */
function openDb() {
  return initializeDatabase(config.DB_PATH);
}

/**
 * Delete a notification config row by channel.
 * @param {import('better-sqlite3').Database} db
 * @param {string} channel
 */
function deleteNotificationConfig(db, channel) {
  db.prepare('DELETE FROM notification_config WHERE channel = ?').run(channel);
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────

function handleSlack(url) {
  const { valid, error } = validateSlackUrl(url);
  if (!valid) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }

  const db = openDb();
  try {
    upsertNotificationConfig(db, 'slack', url.trim());
    console.log(chalk.green('Slack webhook saved.'));
    console.log(`  URL: ${chalk.cyan(url.trim())}`);
  } finally {
    db.close();
  }
}

function handleEmail(address) {
  const { valid, error } = validateEmail(address);
  if (!valid) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }

  const db = openDb();
  try {
    upsertNotificationConfig(db, 'email', address.trim());
    console.log(chalk.green('Email address saved.'));
    console.log(`  Address: ${chalk.cyan(address.trim())}`);
  } finally {
    db.close();
  }
}

function handleShow() {
  const db = openDb();
  let channels;
  try {
    channels = db.prepare('SELECT channel, target, created_at FROM notification_config ORDER BY channel').all();
  } finally {
    db.close();
  }

  console.log(chalk.bold('\nNotification Configuration\n'));
  console.log(chalk.gray('─'.repeat(60)));

  if (channels.length === 0) {
    console.log(chalk.gray('  No channels configured.\n'));
    console.log('  Use:');
    console.log(`    ${chalk.cyan('argus notify slack <webhook-url>')}`);
    console.log(`    ${chalk.cyan('argus notify email <address>')}`);
    console.log();
    return;
  }

  const colW = { channel: 10, target: 40, created: 20 };

  console.log(
    chalk.gray(
      'Channel'.padEnd(colW.channel) + '  ' +
      'Target'.padEnd(colW.target) + '  ' +
      'Saved'
    )
  );
  console.log(chalk.gray('─'.repeat(60)));

  for (const row of channels) {
    const created = String(row.created_at ?? '').replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    console.log(
      chalk.cyan(String(row.channel).padEnd(colW.channel)) + '  ' +
      String(row.target).padEnd(colW.target).slice(0, colW.target) + '  ' +
      chalk.gray(created)
    );
  }

  console.log(chalk.gray('─'.repeat(60)));
  console.log();
}

async function handleTest() {
  console.log(chalk.bold('\nRunning digest test...\n'));

  const db = openDb();
  let result;
  try {
    result = await runDailyDigest(db);
  } finally {
    db.close();
  }

  if (result.sent.length > 0) {
    console.log(chalk.green(`Digest sent to: ${result.sent.join(', ')}`));
  } else {
    console.log(chalk.yellow('No remote channels configured — digest saved locally only.'));
  }

  console.log(`Local file: ${chalk.cyan(result.saved)}\n`);
}

function handleRemove(channel) {
  if (!channel) {
    console.error(chalk.red('Error: specify a channel to remove (e.g. slack, email).'));
    process.exit(1);
  }

  const db = openDb();
  try {
    const existing = getNotificationConfig(db, channel);
    if (!existing) {
      console.log(chalk.yellow(`No config found for channel "${channel}".`));
      return;
    }
    deleteNotificationConfig(db, channel);
    console.log(chalk.green(`Removed "${channel}" from notification config.`));
  } finally {
    db.close();
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Run the notify command.
 * @param {string[]} args - CLI args after "notify" (e.g. ['slack', 'https://...'])
 */
export async function runNotify(args) {
  const [subcommand, ...rest] = args ?? [];

  switch (subcommand) {
    case 'slack':
      handleSlack(rest[0]);
      break;

    case 'email':
      handleEmail(rest[0]);
      break;

    case 'show':
      handleShow();
      break;

    case 'test':
      await handleTest();
      break;

    case 'remove':
      handleRemove(rest[0]);
      break;

    default:
      console.log(chalk.bold('\nargus notify — configure notification channels\n'));
      console.log('Usage:');
      console.log(`  ${chalk.cyan('argus notify slack <webhook-url>')}   Save Slack webhook`);
      console.log(`  ${chalk.cyan('argus notify email <address>')}        Save email address`);
      console.log(`  ${chalk.cyan('argus notify show')}                   Show current config`);
      console.log(`  ${chalk.cyan('argus notify test')}                   Send a test digest now`);
      console.log(`  ${chalk.cyan('argus notify remove <channel>')}       Remove a channel`);
      console.log();
      if (subcommand) {
        console.error(chalk.red(`Unknown subcommand: "${subcommand}"`));
        process.exit(1);
      }
  }
}

export default { runNotify };
