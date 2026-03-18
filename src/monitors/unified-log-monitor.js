/**
 * macOS Unified Log Monitor
 * Uses `log stream --predicate` for real-time, event-driven AI app monitoring.
 *
 * Superior to lsof polling because:
 * - Event-driven (zero CPU when no events)
 * - Catches transient file opens that lsof misses between polls
 * - Captures MCP subprocess spawning (Claude Desktop uses JSON-RPC over stdio)
 * - Includes privacy-sensitive events (TCC, clipboard, accessibility)
 *
 * Linux equivalent: inotify (handled by chokidar in index.js)
 */

import { spawn } from 'node:child_process';
import { IS_MAC } from '../lib/platform.js';
import { AI_APPS } from '../ai-apps.js';
import { insertFileAccess, insertNetworkEvent } from '../db/store.js';

// Build a predicate that matches any known AI app process name
function buildAiPredicate() {
  const appNames = [...new Set(
    Object.keys(AI_APPS).map(k => k.toLowerCase())
  )].filter(n => n.length > 2); // skip very short names

  const clauses = appNames.map(n => `processImagePath contains[cd] "${n}"`);
  // Also catch MCP subprocesses spawned by AI apps
  clauses.push('eventMessage contains[cd] "mcp"');
  clauses.push('eventMessage contains[cd] "anthropic"');
  clauses.push('eventMessage contains[cd] "openai"');

  return clauses.join(' OR ');
}

// Parse a unified log JSON line into a structured event
function parseLogLine(line, knownProcesses) {
  try {
    const entry = JSON.parse(line);
    const msg = entry.eventMessage || '';
    const proc = entry.processImagePath || '';
    const procName = proc.split('/').pop() || '';
    const timestamp = entry.timestamp || new Date().toISOString();

    // Find matching AI app label
    const appInfo = AI_APPS[procName] || AI_APPS[procName.toLowerCase()];
    const appLabel = appInfo ? appInfo.name : procName;

    return {
      timestamp,
      processName: procName,
      appLabel,
      message: msg,
      pid: entry.processID || 0,
      category: entry.category || '',
    };
  } catch {
    return null;
  }
}

// Classify a unified log message for storage
function classifyLogEvent(entry) {
  const msg = entry.message.toLowerCase();

  // File access indicators
  if (msg.includes('open(') || msg.includes('file-read') || msg.includes('file-write')) {
    return { type: 'file', sensitivity: msg.includes('ssh') || msg.includes('keych') ? 'credentials' : null };
  }

  // Network indicators
  if (msg.includes('connect(') || msg.includes('tcp') || msg.includes('http')) {
    return { type: 'network' };
  }

  // MCP tool invocation
  if (msg.includes('mcp') || msg.includes('json-rpc') || msg.includes('tool')) {
    return { type: 'mcp' };
  }

  // TCC / permission check
  if (msg.includes('tcc') || msg.includes('privacy') || msg.includes('permission')) {
    return { type: 'tcc' };
  }

  return { type: 'general' };
}

/**
 * Start the unified log stream for macOS AI app monitoring.
 * Returns a controller object with a stop() method.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} opts
 * @param {Function} [opts.onEvent] - callback(entry) for each parsed event
 * @returns {{ stop: Function } | null}  null on non-macOS
 */
export function startUnifiedLogMonitor(db, opts = {}) {
  if (!IS_MAC) return null;

  const predicate = buildAiPredicate();

  const child = spawn('/usr/bin/log', [
    'stream',
    '--style', 'json',
    '--predicate', predicate,
    '--level', 'debug',
  ], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();

    // log stream outputs one JSON object per line
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete last line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '[' || trimmed === ']') continue;

      // Strip trailing comma (log stream wraps output in a JSON array)
      const clean = trimmed.replace(/,$/, '');
      const entry = parseLogLine(clean, null);
      if (!entry || !entry.processName) continue;

      const classified = classifyLogEvent(entry);

      // Persist relevant events to DB
      if (classified.type === 'file' && db) {
        try {
          insertFileAccess(db, {
            pid: entry.pid,
            processName: entry.processName,
            appLabel: entry.appLabel,
            filePath: entry.message.substring(0, 500),
            accessType: 'read',
            sensitivity: classified.sensitivity || null,
            isAlert: classified.sensitivity ? 1 : 0,
            timestamp: entry.timestamp,
          });
        } catch { /* non-fatal */ }
      }

      if (classified.type === 'network' && db) {
        try {
          insertNetworkEvent(db, {
            pid: entry.pid,
            processName: entry.processName,
            appLabel: entry.appLabel,
            localAddress: null,
            remoteAddress: entry.message.substring(0, 200),
            remoteHost: null,
            port: null,
            protocol: 'TCP',
            state: 'ESTABLISHED',
            aiService: null,
            timestamp: entry.timestamp,
          });
        } catch { /* non-fatal */ }
      }

      if (opts.onEvent) opts.onEvent(entry, classified);
    }
  });

  child.on('error', () => { /* log process may not be available */ });

  return {
    stop() {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    },
    pid: child.pid,
  };
}
