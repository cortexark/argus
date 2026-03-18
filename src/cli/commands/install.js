/**
 * argus install
 * Registers Argus as a system service (LaunchAgent/systemd).
 * Creates ~/.argus/ directory structure.
 */

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { config } from '../../lib/config.js';
import * as daemonManager from '../../daemon/daemon-manager.js';

/**
 * Find the CLI entry point path.
 * Resolves from this file's location up to src/cli.js.
 * @returns {string}
 */
function findCliPath() {
  const thisFile = fileURLToPath(import.meta.url);
  // src/cli/commands/install.js -> src/cli.js
  return resolve(dirname(thisFile), '..', '..', 'cli.js');
}

/**
 * Run the install command.
 */
export async function runInstall() {
  const nodePath = process.execPath;
  const cliPath = findCliPath();
  const logDir = config.LOG_DIR;

  // Ensure data and log directories exist
  mkdirSync(config.DATA_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(logDir, { recursive: true, mode: 0o700 });

  console.log('Installing Argus...');

  const result = await daemonManager.install(nodePath, cliPath, logDir);

  if (result.success) {
    console.log(`\nArgus installed! Run 'argus start' to begin monitoring.`);
    console.log(`\nData directory: ${config.DATA_DIR}`);
    console.log(`Log directory:  ${logDir}`);
  } else {
    console.error(`\nInstall failed: ${result.message}`);
    process.exit(1);
  }
}

/**
 * Run the uninstall command.
 */
export async function runUninstall() {
  console.log('Uninstalling Argus...');

  const result = await daemonManager.uninstall();

  if (result.success) {
    console.log('\nArgus uninstalled.');
    console.log(`Data files remain at: ${config.DATA_DIR}`);
  } else {
    console.error(`\nUninstall failed: ${result.message}`);
    process.exit(1);
  }
}

export default { runInstall, runUninstall };
