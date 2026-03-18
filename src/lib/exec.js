/**
 * Safe command executor using child_process.execFile (not exec).
 * Returns {stdout, stderr, exitCode, error} - never throws.
 * Handles timeout via AbortController.
 */

import { execFile } from 'node:child_process';

/**
 * Execute a command safely using execFile (prevents shell injection).
 * @param {string} cmd - The executable path or name
 * @param {string[]} args - Arguments array (each arg is passed separately, not shell-expanded)
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, error: Error|null}>}
 */
export async function execCommand(cmd, args = [], timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        signal: controller.signal,
        maxBuffer: 2 * 1024 * 1024, // 2MB — lsof output rarely exceeds 500KB
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);

        if (error) {
          const isAbort = error.code === 'ABORT_ERR';
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: isAbort ? -1 : (typeof error.code === 'number' ? error.code : 1),
            error: isAbort
              ? new Error(`Command timed out after ${timeoutMs}ms`)
              : error,
          });
          return;
        }

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: 0,
          error: null,
        });
      }
    );
  });
}

export default { execCommand };
