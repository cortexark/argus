/**
 * Manages Linux systemd user service for persistent daemon.
 * Uses systemctl --user for non-root operation.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { mkdirSync, renameSync } from 'node:fs';
import { execCommand } from '../lib/exec.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SERVICE_NAME = 'argus';
const SERVICE_DIR = join(homedir(), '.config', 'systemd', 'user');
const SERVICE_PATH = join(SERVICE_DIR, `${SERVICE_NAME}.service`);

/**
 * Generate systemd service file content.
 * @param {string} nodePath
 * @param {string} scriptPath
 * @param {string} logDir
 * @returns {string}
 */
function generateServiceFile(nodePath, scriptPath, logDir) {
  return `[Unit]
Description=Argus - Monitor AI agent behavior
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${scriptPath} _daemon
Restart=on-failure
RestartSec=5s
StandardOutput=append:${logDir}/daemon.log
StandardError=append:${logDir}/daemon-error.log
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
`;
}

/**
 * Install and enable the systemd user service.
 * @param {string} nodePath
 * @param {string} scriptPath
 * @param {string} logDir
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function installSystemdService(nodePath, scriptPath, logDir) {
  try {
    mkdirSync(SERVICE_DIR, { recursive: true });
    const serviceContent = generateServiceFile(nodePath, scriptPath, logDir);
    writeFileSync(SERVICE_PATH, serviceContent, { mode: 0o644 });

    const daemonReload = await execCommand('systemctl', ['--user', 'daemon-reload']);
    if (daemonReload.exitCode !== 0 && daemonReload.error) {
      return {
        success: false,
        message: `Service file written but daemon-reload failed: ${daemonReload.stderr}`,
      };
    }

    const enable = await execCommand('systemctl', ['--user', 'enable', SERVICE_NAME]);
    if (enable.exitCode !== 0 && enable.error) {
      return {
        success: false,
        message: `Service installed but enable failed: ${enable.stderr}`,
      };
    }

    return { success: true, message: `systemd service installed: ${SERVICE_PATH}` };
  } catch (err) {
    return { success: false, message: `Install failed: ${err.message}` };
  }
}

/**
 * Disable and remove the systemd user service.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function uninstallSystemdService() {
  try {
    await execCommand('systemctl', ['--user', 'disable', '--now', SERVICE_NAME]);

    if (existsSync(SERVICE_PATH)) {
      const unusedPath = `${SERVICE_PATH}.unused`;
      renameSync(SERVICE_PATH, unusedPath);
    }

    await execCommand('systemctl', ['--user', 'daemon-reload']);

    return { success: true, message: 'systemd service uninstalled' };
  } catch (err) {
    return { success: false, message: `Uninstall failed: ${err.message}` };
  }
}

/**
 * Start the systemd user service.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function startSystemdService() {
  try {
    const result = await execCommand('systemctl', ['--user', 'start', SERVICE_NAME]);
    if (result.exitCode !== 0 && result.error) {
      return { success: false, message: `Start failed: ${result.stderr}` };
    }
    return { success: true, message: 'systemd service started' };
  } catch (err) {
    return { success: false, message: `Start failed: ${err.message}` };
  }
}

/**
 * Stop the systemd user service.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function stopSystemdService() {
  try {
    const result = await execCommand('systemctl', ['--user', 'stop', SERVICE_NAME]);
    if (result.exitCode !== 0 && result.error) {
      return { success: false, message: `Stop failed: ${result.stderr}` };
    }
    return { success: true, message: 'systemd service stopped' };
  } catch (err) {
    return { success: false, message: `Stop failed: ${err.message}` };
  }
}

/**
 * Get systemd user service status.
 * @returns {Promise<{success: boolean, running: boolean, pid: number|null, message: string}>}
 */
export async function statusSystemdService() {
  try {
    const result = await execCommand('systemctl', ['--user', 'show', SERVICE_NAME, '--property=ActiveState,MainPID']);

    if (result.exitCode !== 0 && result.error) {
      return {
        success: false,
        running: false,
        pid: null,
        message: `Status check failed: ${result.stderr}`,
      };
    }

    const lines = result.stdout.split('\n');
    let activeState = '';
    let mainPid = null;

    for (const line of lines) {
      if (line.startsWith('ActiveState=')) {
        activeState = line.split('=')[1].trim();
      } else if (line.startsWith('MainPID=')) {
        const pidVal = parseInt(line.split('=')[1].trim(), 10);
        mainPid = pidVal > 0 ? pidVal : null;
      }
    }

    const running = activeState === 'active';

    return {
      success: true,
      running,
      pid: running ? mainPid : null,
      message: running ? `Running (PID: ${mainPid})` : `Stopped (state: ${activeState || 'unknown'})`,
    };
  } catch (err) {
    return {
      success: false,
      running: false,
      pid: null,
      message: `Status check failed: ${err.message}`,
    };
  }
}

export { SERVICE_NAME, SERVICE_PATH };
