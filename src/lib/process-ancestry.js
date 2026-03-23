/**
 * Process ancestry chain tracker.
 * Resolves the parent process chain for any given PID,
 * producing the full ancestry from the target up to init/launchd.
 *
 * Uses `ps` to walk up the process tree via PPID lookups.
 * Results are cached for 10 seconds since process ancestry is stable.
 */

import { execFile } from 'node:child_process';

const MAX_DEPTH = 10;
const CACHE_TTL_MS = 10_000;

/** @type {Map<number, { ancestry: Array<{pid: number, name: string, cmd: string}>, ts: number }>} */
const cache = new Map();

/**
 * Look up a single process by PID, returning { pid, name, cmd, ppid }.
 * Returns null if the process doesn't exist or ps fails.
 * @param {number} pid
 * @returns {Promise<{pid: number, name: string, cmd: string, ppid: number} | null>}
 */
function lookupProcess(pid) {
  return new Promise((resolve) => {
    execFile(
      'ps',
      ['-o', 'ppid=,comm=,args=', '-p', String(pid)],
      { timeout: 3000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        const line = stdout.trim();
        // Format: "  ppid command args..."
        const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
        if (!match) {
          resolve(null);
          return;
        }
        const ppid = parseInt(match[1], 10);
        const name = match[2].split('/').pop() || match[2]; // basename
        const cmd = match[3];
        resolve({ pid, name, cmd, ppid });
      },
    );
  });
}

/**
 * Resolve the full process ancestry chain for a given PID.
 * Returns an array from the target process up to init/launchd (PID 0/1),
 * capped at MAX_DEPTH levels.
 *
 * @param {number} pid — the process ID to start from
 * @returns {Promise<Array<{pid: number, name: string, cmd: string}>>}
 */
export async function getProcessAncestry(pid) {
  if (typeof pid !== 'number' || pid < 0 || !Number.isFinite(pid)) {
    return [];
  }

  // Check cache
  const cached = cache.get(pid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.ancestry;
  }

  const ancestry = [];
  let currentPid = pid;
  const visited = new Set();

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (visited.has(currentPid)) break;
    visited.add(currentPid);

    const info = await lookupProcess(currentPid);
    if (!info) break;

    ancestry.push({ pid: info.pid, name: info.name, cmd: info.cmd });

    // Stop at init/launchd (PID 0 or 1, or ppid === pid means root)
    if (info.ppid === 0 || info.ppid === currentPid) break;
    currentPid = info.ppid;
  }

  // Cache the result
  cache.set(pid, { ancestry, ts: Date.now() });

  return ancestry;
}

/**
 * Format an ancestry chain into a human-readable arrow string.
 * Displays from outermost ancestor to the target process.
 *
 * @param {Array<{pid: number, name: string, cmd: string}>} ancestry
 * @returns {string}
 */
export function formatAncestryChain(ancestry) {
  if (!Array.isArray(ancestry) || ancestry.length === 0) {
    return '';
  }
  // ancestry is ordered target → root, reverse for display: root → target
  return [...ancestry].reverse().map(p => p.name).join(' \u2192 ');
}

/**
 * Clear the ancestry cache. Useful for testing.
 */
export function clearAncestryCache() {
  cache.clear();
}

/**
 * Exposed for testing: the max depth constant.
 */
export { MAX_DEPTH, CACHE_TTL_MS };

export default { getProcessAncestry, formatAncestryChain, clearAncestryCache };
