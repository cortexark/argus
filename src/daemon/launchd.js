/**
 * Manages macOS LaunchAgent plist for persistent daemon.
 * Handles install/uninstall/start/stop/status via launchctl.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { execCommand } from '../lib/exec.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LABEL = 'com.argus.daemon';
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = join(PLIST_DIR, `${LABEL}.plist`);

/**
 * Generate plist XML content for the LaunchAgent.
 * @param {string} nodePath - Absolute path to the node executable
 * @param {string} scriptPath - Absolute path to the CLI script
 * @param {string} logDir - Directory for daemon stdout/stderr logs
 * @returns {string} XML plist content
 */
function generatePlist(nodePath, scriptPath, logDir) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
        <string>_daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logDir}/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/daemon-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>`;
}

/**
 * Install the LaunchAgent plist and load it.
 * @param {string} nodePath
 * @param {string} scriptPath
 * @param {string} logDir
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function installLaunchAgent(nodePath, scriptPath, logDir) {
  try {
    mkdirSync(PLIST_DIR, { recursive: true });
    const plistContent = generatePlist(nodePath, scriptPath, logDir);
    writeFileSync(PLIST_PATH, plistContent, { mode: 0o644 });

    const result = await execCommand('launchctl', ['load', '-w', PLIST_PATH]);
    if (result.error && result.exitCode !== 0) {
      return {
        success: false,
        message: `LaunchAgent plist written but load failed: ${result.stderr || result.error.message}`,
      };
    }

    return { success: true, message: `LaunchAgent installed: ${PLIST_PATH}` };
  } catch (err) {
    return { success: false, message: `Install failed: ${err.message}` };
  }
}

/**
 * Unload and remove the LaunchAgent plist.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function uninstallLaunchAgent() {
  try {
    if (existsSync(PLIST_PATH)) {
      await execCommand('launchctl', ['unload', PLIST_PATH]);
      // Move to .unused instead of deleting
      const unusedPath = `${PLIST_PATH}.unused`;
      const { renameSync } = await import('node:fs');
      renameSync(PLIST_PATH, unusedPath);
      return { success: true, message: `LaunchAgent uninstalled (plist moved to ${unusedPath})` };
    }
    return { success: true, message: 'LaunchAgent was not installed' };
  } catch (err) {
    return { success: false, message: `Uninstall failed: ${err.message}` };
  }
}

/**
 * Start the LaunchAgent.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function startLaunchAgent() {
  try {
    const result = await execCommand('launchctl', ['start', LABEL]);
    if (result.exitCode !== 0 && result.error) {
      return { success: false, message: `Start failed: ${result.stderr || result.error.message}` };
    }
    return { success: true, message: 'LaunchAgent started' };
  } catch (err) {
    return { success: false, message: `Start failed: ${err.message}` };
  }
}

/**
 * Stop the LaunchAgent.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function stopLaunchAgent() {
  try {
    const result = await execCommand('launchctl', ['stop', LABEL]);
    if (result.exitCode !== 0 && result.error) {
      return { success: false, message: `Stop failed: ${result.stderr || result.error.message}` };
    }
    return { success: true, message: 'LaunchAgent stopped' };
  } catch (err) {
    return { success: false, message: `Stop failed: ${err.message}` };
  }
}

/**
 * Get LaunchAgent status.
 * @returns {Promise<{success: boolean, running: boolean, pid: number|null, label: string, message: string}>}
 */
export async function statusLaunchAgent() {
  try {
    const result = await execCommand('launchctl', ['list']);
    if (result.error && result.exitCode !== 0) {
      return {
        success: false,
        running: false,
        pid: null,
        label: LABEL,
        message: `launchctl list failed: ${result.stderr}`,
      };
    }

    const lines = result.stdout.split('\n');
    const matchLine = lines.find((line) => line.includes(LABEL));

    if (!matchLine) {
      return {
        success: true,
        running: false,
        pid: null,
        label: LABEL,
        message: 'LaunchAgent is not loaded',
      };
    }

    // launchctl list output: PID Status Label
    const parts = matchLine.trim().split(/\s+/);
    const pid = parts[0] !== '-' ? parseInt(parts[0], 10) : null;
    const running = pid !== null && !isNaN(pid);

    return {
      success: true,
      running,
      pid: running ? pid : null,
      label: LABEL,
      message: running ? `Running (PID: ${pid})` : 'Loaded but not running',
    };
  } catch (err) {
    return {
      success: false,
      running: false,
      pid: null,
      label: LABEL,
      message: `Status check failed: ${err.message}`,
    };
  }
}

export { LABEL, PLIST_PATH };
