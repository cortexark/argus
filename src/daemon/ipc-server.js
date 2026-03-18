/**
 * IPC server that runs inside the daemon process.
 * Listens on a Unix socket for commands from the CLI.
 *
 * Protocol: newline-delimited JSON
 * Commands: { cmd: 'status' | 'report' | 'alerts' | 'ping' }
 * Responses: { ok: boolean, data: any }
 */

import { createServer } from 'node:net';
import { existsSync, unlinkSync } from 'node:fs';
import { config } from '../lib/config.js';

const IPC_SOCKET_PATH = config.IPC_SOCKET_PATH;

/**
 * Write a JSON response to a socket, newline-terminated.
 * @param {import('node:net').Socket} socket
 * @param {object} response
 */
function writeResponse(socket, response) {
  try {
    socket.write(JSON.stringify(response) + '\n');
  } catch {
    // Socket may have closed
  }
}

/**
 * Handle a parsed command object.
 * @param {object} command
 * @param {import('better-sqlite3').Database} db
 * @returns {object} response payload
 */
function handleCommand(command, db) {
  const { cmd } = command;

  switch (cmd) {
    case 'ping':
      return { ok: true, data: { pong: true, pid: process.pid, ts: new Date().toISOString() } };

    case 'status': {
      const uptime = process.uptime();
      return {
        ok: true,
        data: {
          pid: process.pid,
          uptime,
          uptimeHuman: formatUptime(uptime),
          memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      };
    }

    case 'alerts': {
      try {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // last 10 min
        const alerts = db
          .prepare(
            'SELECT * FROM file_access_events WHERE is_alert = 1 AND timestamp >= ? ORDER BY timestamp DESC LIMIT 10',
          )
          .all(since);
        return { ok: true, data: { alerts } };
      } catch (err) {
        return { ok: false, data: { error: `DB error: ${err.code || 'unknown'}` } };
      }
    }

    case 'report': {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const processCount = db
          .prepare(
            "SELECT COUNT(DISTINCT name) as cnt FROM process_snapshots WHERE timestamp >= ?",
          )
          .get(since)?.cnt ?? 0;
        const alertCount = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM file_access_events WHERE is_alert = 1 AND timestamp >= ?",
          )
          .get(since)?.cnt ?? 0;
        const networkCount = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM network_events WHERE timestamp >= ?",
          )
          .get(since)?.cnt ?? 0;
        return {
          ok: true,
          data: {
            since,
            processCount,
            alertCount,
            networkCount,
          },
        };
      } catch (err) {
        return { ok: false, data: { error: `DB error: ${err.code || 'unknown'}` } };
      }
    }

    default:
      return { ok: false, data: { error: `Unknown command: ${cmd}` } };
  }
}

/**
 * Format uptime seconds into human-readable string.
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Start the IPC server.
 * @param {import('better-sqlite3').Database} db
 * @returns {import('node:net').Server}
 */
export function startIpcServer(db) {
  // Remove stale socket file if it exists
  if (existsSync(IPC_SOCKET_PATH)) {
    try {
      unlinkSync(IPC_SOCKET_PATH);
    } catch {
      // Ignore
    }
  }

  const server = createServer((socket) => {
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete newline-delimited messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let command;
        try {
          command = JSON.parse(trimmed);
        } catch {
          writeResponse(socket, { ok: false, data: { error: 'Invalid JSON' } });
          continue;
        }

        const response = handleCommand(command, db);
        writeResponse(socket, response);
      }
    });

    socket.on('error', () => {
      // Client disconnected abruptly — ignore
    });
  });

  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') {
      // Log non-address errors; EADDRINUSE handled at startup
    }
  });

  server.listen(IPC_SOCKET_PATH);

  return server;
}

export default { startIpcServer };
