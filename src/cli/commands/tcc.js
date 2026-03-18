/**
 * argus tcc
 * Shows what permissions AI apps have been granted via macOS TCC.
 * Reads ~/Library/Application Support/com.apple.TCC/TCC.db
 * Falls back to instructions if DB not readable.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execCommand } from '../../lib/exec.js';
import { AI_APPS } from '../../ai-apps.js';
import { IS_MAC } from '../../lib/platform.js';
import chalk from 'chalk';

const TCC_DB_USER = join(
  homedir(),
  'Library',
  'Application Support',
  'com.apple.TCC',
  'TCC.db',
);

// Service name -> human readable label
const TCC_SERVICES = {
  kTCCServiceSystemPolicyAllFiles: 'Full Disk Access',
  kTCCServiceAccessibility: 'Accessibility',
  kTCCServiceScreenCapture: 'Screen Recording',
  kTCCServiceCamera: 'Camera',
  kTCCServiceMicrophone: 'Microphone',
  kTCCServiceAddressBook: 'Contacts',
  kTCCServiceCalendar: 'Calendar',
  kTCCServiceLocation: 'Location',
  kTCCServicePhotos: 'Photos',
  kTCCServiceDocumentsFolderContents: 'Documents Folder',
  kTCCServiceDownloadsFolderContents: 'Downloads Folder',
  kTCCServiceDesktopFolderContents: 'Desktop Folder',
};

// auth_value meanings
const AUTH_VALUE_LABELS = {
  0: 'Denied',
  1: 'Unknown',
  2: 'Allowed',
  3: 'Limited',
};

/**
 * Collect known AI app bundle identifiers from AI_APPS config.
 * @returns {Set<string>}
 */
function getAiAppBundleIds() {
  const ids = new Set();
  for (const app of Object.values(AI_APPS)) {
    if (app.bundleId) ids.add(app.bundleId.toLowerCase());
    if (app.processNames) {
      for (const name of app.processNames) {
        ids.add(name.toLowerCase());
      }
    }
  }
  return ids;
}

/**
 * Query TCC.db using sqlite3 CLI.
 * @param {string} dbPath
 * @returns {Promise<Array<{client: string, service: string, auth_value: number}>>}
 */
async function queryTccDb(dbPath) {
  const query = 'SELECT client, service, auth_value FROM access WHERE auth_value = 2;';
  const result = await execCommand('sqlite3', [dbPath, query]);

  if (result.exitCode !== 0 || result.error) {
    return null; // not readable or sqlite3 not available
  }

  const rows = [];
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('|');
    if (parts.length >= 3) {
      rows.push({
        client: parts[0].trim(),
        service: parts[1].trim(),
        auth_value: parseInt(parts[2].trim(), 10),
      });
    }
  }
  return rows;
}

/**
 * Run the tcc command.
 */
export async function runTcc() {
  if (!IS_MAC) {
    console.log('TCC permissions are a macOS-specific feature.');
    return;
  }

  console.log('\nAI App TCC Permissions');
  console.log('======================\n');

  // Check if sqlite3 is available
  const sqliteCheck = await execCommand('which', ['sqlite3']);
  if (sqliteCheck.exitCode !== 0) {
    printInstructions('sqlite3 is not installed.');
    return;
  }

  // Try user TCC.db
  if (!existsSync(TCC_DB_USER)) {
    printInstructions('TCC.db not found at expected location.');
    return;
  }

  const rows = await queryTccDb(TCC_DB_USER);

  if (rows === null) {
    printInstructions(
      'Cannot read TCC.db. This usually requires Full Disk Access for the terminal.\n' +
      '  Grant Full Disk Access to Terminal in:\n' +
      '  System Settings > Privacy & Security > Full Disk Access',
    );
    return;
  }

  if (rows.length === 0) {
    console.log('No granted permissions found in TCC.db.');
    return;
  }

  // Build a map of known AI app name patterns
  const aiApps = AI_APPS;
  const aiPatterns = Object.keys(aiApps).map((k) => k.toLowerCase());

  // Filter rows to AI apps (match by client bundle ID or process name substring)
  const aiRows = rows.filter((row) => {
    const clientLower = row.client.toLowerCase();
    return aiPatterns.some(
      (pattern) =>
        clientLower.includes(pattern) ||
        pattern.includes(clientLower.split('.').pop() || clientLower),
    );
  });

  if (aiRows.length === 0) {
    console.log('No AI app TCC permissions found.');
    console.log('(AI apps may not have requested any sensitive permissions yet)');
    return;
  }

  // Display table
  const colWidths = { app: 30, permission: 25, status: 10 };
  const header =
    'App'.padEnd(colWidths.app) +
    'Permission'.padEnd(colWidths.permission) +
    'Status';

  console.log(chalk.bold(header));
  console.log('-'.repeat(header.length));

  for (const row of aiRows) {
    const appName = row.client.length > colWidths.app - 2
      ? row.client.slice(0, colWidths.app - 3) + '...'
      : row.client;
    const permission = TCC_SERVICES[row.service] || row.service;
    const statusLabel = AUTH_VALUE_LABELS[row.auth_value] || String(row.auth_value);
    const statusColored = row.auth_value === 2
      ? chalk.yellow(statusLabel)
      : row.auth_value === 0
        ? chalk.green(statusLabel)
        : statusLabel;

    console.log(
      appName.padEnd(colWidths.app) +
      permission.padEnd(colWidths.permission) +
      statusColored,
    );
  }

  console.log('');
}

/**
 * Print fallback instructions when TCC.db is not readable.
 * @param {string} reason
 */
function printInstructions(reason) {
  console.log(`Note: ${reason}\n`);
  console.log('To check AI app permissions manually:');
  console.log('  System Settings > Privacy & Security');
  console.log('  Look for: Full Disk Access, Screen Recording, Accessibility\n');
}

export default { runTcc };
