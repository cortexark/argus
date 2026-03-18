/**
 * File access monitor — scans open files for known AI processes
 * using lsof and alerts on access to sensitive paths.
 */

import { execCommand } from '../lib/exec.js';
import { LSOF_PATH, IS_LINUX } from '../lib/platform.js';
import { parseFileOutput } from '../lib/lsof-parser.js';
import { insertFileAccess, insertInjectionAlert } from '../db/store.js';
import { SENSITIVE_PATHS } from '../ai-apps.js';
import { scanFile } from './injection-detector.js';
import { extname } from 'node:path';

/** Extensions that are never worth scanning for text injections. */
const BINARY_SCAN_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.mp4', '.mp3', '.wav', '.avi', '.mov',
  '.zip', '.gz', '.tar', '.bz2', '.xz', '.rar', '.7z',
  '.db', '.sqlite', '.sqlite3',
  '.exe', '.dll', '.so', '.dylib',
]);

/**
 * Return true if the file extension suggests binary content.
 * @param {string} filePath
 * @returns {boolean}
 */
function isBinaryExtension(filePath) {
  const ext = extname(filePath).toLowerCase();
  return BINARY_SCAN_EXTENSIONS.has(ext);
}

// Deduplication cache: "pid:path" -> timestamp of last insert (ms)
const recentInserts = new Map();
const DEDUP_WINDOW_MS = 10000;

/**
 * Parse the file-access mode from an lsof fd string.
 * lsof fd strings end with a mode character: r=read, w=write, u=read+write
 * Special descriptors (txt, mem, cwd, rtd, DEL, etc.) have no mode suffix.
 * @param {string} fd - Raw fd field from lsof (e.g. '3r', '4w', '5u', 'mem', 'txt')
 * @returns {'read'|'write'|'read+write'|null}
 */
function parseFdMode(fd) {
  if (!fd || typeof fd !== 'string') return null;
  const lastChar = fd[fd.length - 1];
  if (lastChar === 'r') return 'read';
  if (lastChar === 'w') return 'write';
  if (lastChar === 'u') return 'read+write';
  return null;
}

/**
 * Evict entries from the dedup cache that are older than DEDUP_WINDOW_MS.
 * Called before inserting to keep the Map from growing without bound.
 */
function evictStaleEntries(nowMs) {
  for (const [key, ts] of recentInserts) {
    if (nowMs - ts >= DEDUP_WINDOW_MS) {
      recentInserts.delete(key);
    }
  }
}

/**
 * Classify a file path against SENSITIVE_PATHS categories.
 * Returns the category name string, or null if not sensitive.
 * @param {string} filePath
 * @returns {string | null}
 */
export function classifyPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  for (const [category, patterns] of Object.entries(SENSITIVE_PATHS)) {
    for (const pattern of patterns) {
      if (filePath.includes(pattern)) {
        return category;
      }
    }
  }

  return null;
}

/**
 * Scan open files for a list of AI processes, inserting alerts into the DB.
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{pid, name, appLabel}>} processes
 * @returns {Promise<{alertCount: number, totalFiles: number}>}
 */
export async function scanAIProcessFiles(db, processes) {
  // Linux: delegate to /proc/PID/fd based monitor (no lsof needed)
  if (IS_LINUX) {
    const { scanAIProcessFilesLinux } = await import('./file-monitor-linux.js');
    return scanAIProcessFilesLinux(db, processes);
  }

  let alertCount = 0;
  let totalFiles = 0;
  const alerts = []; // detailed alert objects for notifications

  // Collect unique process names to avoid redundant lsof calls
  const namesSeen = new Set();

  for (const proc of processes) {
    if (namesSeen.has(proc.name)) continue;
    namesSeen.add(proc.name);

    const { stdout, error } = await execCommand(LSOF_PATH, [
      '-F', 'pcftn',
      '-c', proc.name,
      '-d', '^txt',
      '-d', '^mem',
    ]);

    if (error || !stdout) continue;

    const files = parseFileOutput(stdout);
    totalFiles += files.length;

    const now = new Date().toISOString();
    const nowMs = Date.now();

    for (const file of files) {
      const sensitivity = classifyPath(file.filePath);
      const isAlert = sensitivity !== null ? 1 : 0;

      // Evict stale entries to prevent unbounded Map growth
      evictStaleEntries(nowMs);

      // Deduplicate: skip if same pid+path inserted in last 10s
      const dedupKey = `${file.pid}:${file.filePath}`;
      const lastInsert = recentInserts.get(dedupKey);
      if (lastInsert && nowMs - lastInsert < DEDUP_WINDOW_MS) continue;

      recentInserts.set(dedupKey, nowMs);

      // Find the matching process entry for appLabel
      const matchedProc = processes.find(p => p.pid === file.pid) || proc;

      insertFileAccess(db, {
        pid: file.pid,
        processName: file.command || proc.name,
        appLabel: matchedProc.appLabel || null,
        filePath: file.filePath,
        accessType: parseFdMode(file.fd),
        sensitivity,
        isAlert,
        timestamp: now,
      });

      if (isAlert) {
        alertCount++;
        alerts.push({
          pid: file.pid,
          processName: file.command || proc.name,
          appLabel: (processes.find(p => p.pid === file.pid) || proc).appLabel || null,
          filePath: file.filePath,
          sensitivity,
        });
      }

      // Prompt injection scan — run on accessible text files
      if (file.filePath && !isBinaryExtension(file.filePath)) {
        try {
          const injection = await scanFile(file.filePath);
          if (injection.detected) {
            insertInjectionAlert(db, {
              pid: file.pid,
              processName: file.command || proc.name,
              appLabel: matchedProc.appLabel || null,
              filePath: file.filePath,
              severity: injection.severity,
              patterns: JSON.stringify(injection.patterns),
              snippet: injection.snippets[0] || null,
              layer: injection.layer,
              timestamp: now,
            });
            alerts.push({
              pid: file.pid,
              processName: file.command || proc.name,
              appLabel: matchedProc.appLabel || null,
              filePath: file.filePath,
              sensitivity,
              injection,
            });
          }
        } catch {
          // Non-fatal: injection scan errors never block file monitoring
        }
      }
    }
  }

  return { alertCount, totalFiles, alerts };
}

export default { scanAIProcessFiles, classifyPath };
