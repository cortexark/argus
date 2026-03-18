/**
 * Cross-platform daemon manager.
 * Delegates to launchd.js (macOS) or systemd.js (Linux).
 *
 * All functions return { success: boolean, message: string, pid?: number }
 */

import { IS_MAC, IS_LINUX } from '../lib/platform.js';

/**
 * Load the appropriate platform module lazily.
 * Returns a consistent interface regardless of platform.
 */
async function getPlatformModule() {
  if (IS_MAC) {
    const mod = await import('./launchd.js');
    return {
      install: mod.installLaunchAgent,
      uninstall: mod.uninstallLaunchAgent,
      start: mod.startLaunchAgent,
      stop: mod.stopLaunchAgent,
      status: mod.statusLaunchAgent,
    };
  }

  if (IS_LINUX) {
    const mod = await import('./systemd.js');
    return {
      install: mod.installSystemdService,
      uninstall: mod.uninstallSystemdService,
      start: mod.startSystemdService,
      stop: mod.stopSystemdService,
      status: mod.statusSystemdService,
    };
  }

  // Unsupported platform — return stub that reports gracefully
  return {
    install: async () => ({ success: false, message: 'Unsupported platform. Only macOS and Linux are supported.' }),
    uninstall: async () => ({ success: false, message: 'Unsupported platform.' }),
    start: async () => ({ success: false, message: 'Unsupported platform.' }),
    stop: async () => ({ success: false, message: 'Unsupported platform.' }),
    status: async () => ({ success: false, running: false, pid: null, message: 'Unsupported platform.' }),
  };
}

/**
 * Install the daemon service.
 * @param {string} nodePath - Path to node executable
 * @param {string} scriptPath - Path to the CLI script
 * @param {string} logDir - Log output directory
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function install(nodePath, scriptPath, logDir) {
  const platform = await getPlatformModule();
  return platform.install(nodePath, scriptPath, logDir);
}

/**
 * Uninstall the daemon service.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function uninstall() {
  const platform = await getPlatformModule();
  return platform.uninstall();
}

/**
 * Start the daemon service.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function start() {
  const platform = await getPlatformModule();
  return platform.start();
}

/**
 * Stop the daemon service.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function stop() {
  const platform = await getPlatformModule();
  return platform.stop();
}

/**
 * Get daemon status.
 * @returns {Promise<{success: boolean, running: boolean, pid: number|null, message: string}>}
 */
export async function status() {
  const platform = await getPlatformModule();
  return platform.status();
}

/**
 * Restart the daemon (stop then start).
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function restart() {
  const platform = await getPlatformModule();
  const stopResult = await platform.stop();
  if (!stopResult.success) {
    // Continue to start even if stop failed (may not have been running)
  }
  const startResult = await platform.start();
  return {
    success: startResult.success,
    message: startResult.success ? 'Daemon restarted' : `Restart failed: ${startResult.message}`,
  };
}

export default { install, uninstall, start, stop, status, restart };
