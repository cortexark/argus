/**
 * Network connection monitor — scans lsof network connections for AI processes
 * and matches against known AI service endpoints.
 */

import { execCommand } from '../lib/exec.js';
import { LSOF_PATH, IS_LINUX, IS_MAC } from '../lib/platform.js';
import { parseNetworkOutput } from '../lib/lsof-parser.js';
import { parseNetstatOutput } from '../lib/netstat-parser.js';
import { insertNetworkEvent } from '../db/store.js';
import { AI_ENDPOINTS } from '../ai-apps.js';

/**
 * Check if a remote address string matches any known AI endpoint pattern.
 * @param {string | null} remoteAddress
 * @returns {string | null} service name, or null if no match
 */
export function matchAIEndpoint(remoteAddress) {
  if (!remoteAddress || typeof remoteAddress !== 'string') return null;

  for (const { pattern, service } of AI_ENDPOINTS) {
    if (remoteAddress.includes(pattern)) {
      return service;
    }
  }

  return null;
}

// Well-known service name → port number (for netstat without -n)
const SERVICE_PORTS = Object.freeze({
  http: 80, https: 443, ssh: 22, smtp: 25, dns: 53, domain: 53,
  imaps: 993, imap: 143, pop3s: 995, pop3: 110,
  ftps: 990, ftp: 21, ldaps: 636, ldap: 389,
  ntp: 123, snmp: 161, syslog: 514,
});

/**
 * Extract the remote port from a network address string.
 * Handles:
 *   "IP:PORT"             -> PORT
 *   "host:servicename"    -> PORT (via SERVICE_PORTS lookup)
 *   "LOCAL:PORT->REMOTE:PORT" -> remote PORT
 * @param {string | null} addressStr
 * @returns {number | null}
 */
export function extractPort(addressStr) {
  if (!addressStr || typeof addressStr !== 'string') return null;

  // For arrow format, take the remote side
  const arrowIdx = addressStr.indexOf('->');
  const target = arrowIdx !== -1
    ? addressStr.slice(arrowIdx + 2)
    : addressStr;

  // Strip IPv6 bracket notation [::1]:PORT
  const bracketMatch = target.match(/\]:(\d+)$/);
  if (bracketMatch) {
    return parseInt(bracketMatch[1], 10);
  }

  // Extract last :PORT segment
  const colonIdx = target.lastIndexOf(':');
  if (colonIdx === -1) return null;

  const portStr = target.slice(colonIdx + 1);
  const port = parseInt(portStr, 10);
  if (!isNaN(port)) return port;

  // Named service port (e.g. "https" when netstat resolves names)
  return SERVICE_PORTS[portStr.toLowerCase()] ?? null;
}

/**
 * Scan network connections for known AI processes and record them in the DB.
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{pid, name, appLabel}>} processes
 * @returns {Promise<object[]>} array of network event objects inserted
 */
export async function scanAINetworkConnections(db, processes) {
  // Linux: delegate to ss-based monitor (faster, no lsof dependency)
  if (IS_LINUX) {
    const { scanAINetworkConnectionsLinux } = await import('./network-monitor-linux.js');
    return scanAINetworkConnectionsLinux(db, processes);
  }

  // macOS: use netstat -anv (includes PID, ~10x faster than lsof -i)
  // Falls back to scoped lsof if netstat does not include PID column.
  if (IS_MAC) {
    return scanMacNetworkConnections(db, processes);
  }

  // Fallback: original lsof approach
  return scanLsofNetworkConnections(db, processes);
}

/**
 * macOS network scan using netstat -anv.
 * netstat -anv includes PID in column 8 on macOS 12+.
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{pid: number, name: string, appLabel: string}>} processes
 * @returns {Promise<object[]>}
 */
async function scanMacNetworkConnections(db, processes) {
  // Use -n for numeric output — avoids costly DNS reverse lookups that cause scan timeouts.
  // AI endpoint matching works on IP patterns; domain names are matched separately.
  const { stdout, error } = await execCommand('netstat', ['-anv', '-f', 'inet']);
  const { stdout: stdout6 } = await execCommand('netstat', ['-anv', '-f', 'inet6']);

  const combined = (stdout || '') + '\n' + (stdout6 || '');
  if (error && !combined.trim()) {
    // netstat failed — fall back to lsof
    return scanLsofNetworkConnections(db, processes);
  }

  const connections = parseNetstatOutput(combined);
  const aiPids = new Set(processes.map((p) => p.pid));
  const events = [];
  const now = new Date().toISOString();

  for (const conn of connections) {
    // netstat with -v gives PID; without -v gives 0 — if 0, skip (can't attribute)
    if (!conn.pid || !aiPids.has(conn.pid)) continue;

    const port = extractPort(conn.remoteAddress);
    const aiService = matchAIEndpoint(conn.remoteAddress);
    const remoteHost = extractHost(conn.remoteAddress);
    const matchedProc = processes.find((p) => p.pid === conn.pid);

    const event = {
      pid: conn.pid,
      processName: matchedProc?.name || conn.command,
      appLabel: matchedProc?.appLabel || null,
      localAddress: conn.localAddress,
      remoteAddress: conn.remoteAddress,
      remoteHost,
      port,
      protocol: conn.protocol,
      state: conn.state,
      aiService,
      bytesSent: 0,
      bytesReceived: 0,
      timestamp: now,
    };

    insertNetworkEvent(db, event);
    events.push(event);
  }

  // If netstat gave no PID data (older macOS), fall back to scoped lsof
  if (events.length === 0 && connections.every((c) => c.pid === 0)) {
    return scanLsofNetworkConnections(db, processes);
  }

  return events;
}

/**
 * Original lsof-based network scan (fallback for non-Linux, non-macOS12+).
 * Also used as fallback when netstat does not include PID info.
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{pid: number, name: string, appLabel: string}>} processes
 * @returns {Promise<object[]>}
 */
async function scanLsofNetworkConnections(db, processes) {
  // Scope lsof to only AI process PIDs — much faster than scanning all processes
  const pidArgs = processes.flatMap((p) => ['-p', String(p.pid)]);
  // Use -n for numeric output (fast) and -P for numeric ports.
  const args = pidArgs.length > 0
    ? ['-i', '-n', '-P', '-F', 'pcnst', '-a', ...pidArgs]
    : ['-i', '-n', '-P', '-F', 'pcnst'];

  const { stdout, error } = await execCommand(LSOF_PATH, args);
  if (error || !stdout) return [];

  const connections = parseNetworkOutput(stdout);
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
      bytesSent: 0,
      bytesReceived: 0,
      timestamp: now,
    };

    insertNetworkEvent(db, event);
    events.push(event);
  }

  return events;
}

/**
 * Extract the hostname/IP from an address string (strips port).
 * @param {string} addressStr
 * @returns {string | null}
 */
function extractHost(addressStr) {
  if (!addressStr) return null;

  // For arrow format, take remote side
  const arrowIdx = addressStr.indexOf('->');
  const target = arrowIdx !== -1
    ? addressStr.slice(arrowIdx + 2)
    : addressStr;

  const colonIdx = target.lastIndexOf(':');
  if (colonIdx === -1) return target || null;

  return target.slice(0, colonIdx) || null;
}

export default { scanAINetworkConnections, matchAIEndpoint, extractPort };
