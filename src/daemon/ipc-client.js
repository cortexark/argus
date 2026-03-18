/**
 * IPC client for CLI to communicate with running daemon.
 * Sends commands and receives responses over Unix socket.
 *
 * If daemon is not running, throws DaemonNotRunningError.
 */

import { connect } from 'node:net';
import { config } from '../lib/config.js';

const IPC_SOCKET_PATH = config.IPC_SOCKET_PATH;
const TIMEOUT_MS = 5000;

/**
 * Thrown when the daemon socket cannot be reached.
 */
export class DaemonNotRunningError extends Error {
  constructor() {
    super("Argus daemon is not running. Start it with: argus start");
    this.name = 'DaemonNotRunningError';
    this.code = 'DAEMON_NOT_RUNNING';
  }
}

/**
 * Send a command to the running daemon and return the response.
 * @param {string} cmd - Command name
 * @param {object} payload - Additional payload fields
 * @returns {Promise<{ok: boolean, data: any}>}
 * @throws {DaemonNotRunningError} if daemon is not reachable
 */
export async function sendCommand(cmd, payload = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(IPC_SOCKET_PATH);
    let settled = false;
    let buffer = '';

    const cleanup = () => {
      try { socket.destroy(); } catch { /* ignore */ }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    // Timeout guard
    const timer = setTimeout(() => {
      fail(new Error(`IPC command timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    socket.on('connect', () => {
      const message = JSON.stringify({ cmd, ...payload }) + '\n';
      socket.write(message);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx !== -1) {
        clearTimeout(timer);
        const line = buffer.slice(0, newlineIdx).trim();
        try {
          succeed(JSON.parse(line));
        } catch {
          fail(new Error('Invalid JSON response from daemon'));
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      // ENOENT = socket file missing, ECONNREFUSED = nobody listening
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        fail(new DaemonNotRunningError());
      } else {
        fail(err);
      }
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (!settled) {
        fail(new DaemonNotRunningError());
      }
    });
  });
}

export default { sendCommand, DaemonNotRunningError };
