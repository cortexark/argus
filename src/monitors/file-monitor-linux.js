/**
 * Linux file monitor using /proc/PID/fd instead of lsof.
 * Reads symlinks in /proc/<pid>/fd/ to get open file paths.
 * Faster than lsof, no external binary, works without root for user-owned processes.
 */

import { readdir, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { insertFileAccess, insertInjectionAlert } from '../db/store.js';
import { SENSITIVE_PATHS } from '../ai-apps.js';
import { scanFile } from './injection-detector.js';
import { extname } from 'node:path';

const BINARY_SCAN_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.mp4', '.mp3', '.wav', '.avi', '.mov',
  '.zip', '.gz', '.tar', '.bz2', '.xz', '.rar', '.7z',
  '.db', '.sqlite', '.sqlite3',
  '.exe', '.dll', '.so', '.dylib',
]);

function isBinaryExtension(filePath) {
  return BINARY_SCAN_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Classify a file path as sensitive.
 * Returns the category and severity if sensitive, null otherwise.
 * @param {string} filePath
 * @returns {{ category: string, severity: string } | null}
 */
function classifyPath(filePath) {
  const pathLower = filePath.toLowerCase();
  for (const [category, patterns] of Object.entries(SENSITIVE_PATHS)) {
    for (const pattern of patterns) {
      if (pathLower.includes(pattern.toLowerCase())) {
        const severity =
          category === 'credentials' ? 'CRITICAL'
          : category === 'browserData' ? 'HIGH'
          : category === 'documents' ? 'MEDIUM'
          : 'LOW';
        return { category, severity };
      }
    }
  }
  return null;
}

// Deduplication cache — same structure as file-monitor.js
const recentInserts = new Map();
const DEDUP_WINDOW_MS = 10000;

function evictStaleEntries(nowMs) {
  for (const [key, ts] of recentInserts) {
    if (nowMs - ts > DEDUP_WINDOW_MS) recentInserts.delete(key);
  }
}

/**
 * Get all open regular file paths for a given PID via /proc/PID/fd.
 * @param {number} pid
 * @returns {Promise<string[]>}
 */
async function getOpenFilePaths(pid) {
  const fdDir = `/proc/${pid}/fd`;
  let fds;
  try {
    fds = await readdir(fdDir);
  } catch {
    return []; // Process exited or EACCES (not our process)
  }

  const paths = [];
  await Promise.all(
    fds.map(async (fd) => {
      try {
        const target = await readlink(join(fdDir, fd));
        // Only keep real file paths (not socket:[inode], pipe:[inode], anon_inode, etc.)
        if (target.startsWith('/') && !target.includes(':[')) {
          paths.push(target);
        }
      } catch {
        // FD closed between readdir and readlink — ignore
      }
    }),
  );

  return paths;
}

/**
 * Scan open files for AI processes on Linux using /proc/PID/fd.
 * Drop-in replacement for scanAIProcessFiles on Linux.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{pid: number, name: string, appLabel: string}>} processes
 * @returns {Promise<{ alertCount: number, totalFiles: number, alerts: object[] }>}
 */
export async function scanAIProcessFilesLinux(db, processes) {
  let alertCount = 0;
  let totalFiles = 0;
  const alerts = [];
  const nowMs = Date.now();
  evictStaleEntries(nowMs);

  await Promise.all(
    processes.map(async (proc) => {
      const filePaths = await getOpenFilePaths(proc.pid);

      for (const filePath of filePaths) {
        totalFiles++;

        const classification = classifyPath(filePath);
        const isAlert = classification !== null;
        const dedupKey = `${proc.pid}:${filePath}`;

        if (recentInserts.has(dedupKey)) continue;
        recentInserts.set(dedupKey, nowMs);

        const event = {
          pid: proc.pid,
          processName: proc.name,
          appLabel: proc.appLabel || null,
          filePath,
          accessType: 'read', // /proc/fd reflects open mode but we simplify to 'read'
          isAlert,
          severity: classification?.severity || null,
          category: classification?.category || null,
          timestamp: new Date().toISOString(),
        };

        insertFileAccess(db, event);

        if (isAlert) {
          alertCount++;
          alerts.push(event);

          // Scan for prompt injection in text files
          if (!isBinaryExtension(filePath)) {
            try {
              const injectionResult = await scanFile(filePath);
              if (injectionResult && injectionResult.findings.length > 0) {
                for (const finding of injectionResult.findings) {
                  insertInjectionAlert(db, {
                    filePath,
                    processName: proc.name,
                    severity: finding.severity,
                    patternName: finding.pattern,
                    snippet: finding.snippet,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            } catch {
              // Ignore injection scan errors
            }
          }
        }
      }
    }),
  );

  return { alertCount, totalFiles, alerts };
}

export default { scanAIProcessFilesLinux };
