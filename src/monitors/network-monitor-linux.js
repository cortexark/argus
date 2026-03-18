/**
 * Linux network monitor using `ss` instead of `lsof`.
 * `ss` reads directly from /proc/net — no external binary overhead,
 * pre-installed on every modern Linux (part of iproute2).
 */

import { execCommand } from '../lib/exec.js';
import { parseSsOutput } from '../lib/ss-parser.js';
import { insertNetworkEvent } from '../db/store.js';
import { AI_ENDPOINTS } from '../ai-apps.js';
import { matchAIEndpoint, extractPort, extractHost } from './network-monitor.js';

// ss binary path
const SS_PATH = '/usr/bin/ss';

/**
 * Scan network connections on Linux using ss.
 * Drop-in replacement for scanAINetworkConnections on Linux.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{pid: number, name: string, appLabel: string}>} processes
 * @returns {Promise<object[]>} array of network event objects inserted
 */
export async function scanAINetworkConnectionsLinux(db, processes) {
  const { stdout, error } = await execCommand(SS_PATH, ['-tunap']);
  if (error || !stdout) return [];

  const connections = parseSsOutput(stdout);
  const aiPids = new Set(processes.map((p) => p.pid));
  const events = [];
  const now = new Date().toISOString();

  for (const conn of connections) {
    if (!aiPids.has(conn.pid)) continue;

    const port = extractPort(conn.remoteAddress);
    const aiService = matchAIEndpoint(conn.remoteAddress);
    const remoteHost = extractHost(conn.remoteAddress);

    const matchedProc = processes.find((p) => p.pid === conn.pid);

    const event = {
      pid: conn.pid,
      processName: conn.command,
      appLabel: matchedProc?.appLabel || null,
      localAddress: conn.localAddress,
      remoteAddress: conn.remoteAddress,
      remoteHost,
      port,
      protocol: conn.protocol,
      state: conn.state,
      aiService,
      timestamp: now,
    };

    insertNetworkEvent(db, event);
    events.push(event);
  }

  return events;
}

export default { scanAINetworkConnectionsLinux };
