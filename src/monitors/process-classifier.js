/**
 * Process classifier — 6-signal confidence scoring engine.
 * Reliably distinguishes AI processes from regular system processes
 * by combining multiple runtime signals into a weighted confidence score.
 *
 * Score >= 50  → CONFIRMED_AI
 * Score 30-49  → LIKELY_AI
 * Score < 30   → NOT_AI
 */

import { execCommand } from '../lib/exec.js';
import { IS_MAC, IS_LINUX } from '../lib/platform.js';
import { AI_APPS, AI_ENDPOINTS } from '../ai-apps.js';

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const VERDICT = Object.freeze({
  CONFIRMED_AI: 'CONFIRMED_AI',
  LIKELY_AI: 'LIKELY_AI',
  NOT_AI: 'NOT_AI',
});

// Signal point values
const SIGNAL_POINTS = Object.freeze({
  ANCESTRY: 50,       // definitive
  PIPES: 30,
  KEYWORDS: 30,
  NETWORK: 40,        // definitive
  TCC: 10,
  CODE_SIGN: 50,      // definitive
});

// AI keywords to search in cmdline
const CMD_KEYWORDS = Object.freeze([
  'mcp', 'langchain', 'openai', 'anthropic', 'llama', 'claude',
  'copilot', 'agent', 'tool-server', 'lmstudio', 'ollama',
  'cursor', 'windsurf', 'codeium',
]);

// Known AI vendor code-signing identities
const AI_VENDORS = Object.freeze([
  'Anthropic', 'OpenAI', 'Codeium', 'GitHub', 'Microsoft',
]);

// Module-level cache for code-signing results (signing doesn't change at runtime)
const codeSignCache = new Map();

// ---------------------------------------------------------------------------
// scoreSignals — pure function
// ---------------------------------------------------------------------------

/**
 * Compute a confidence score from a set of pre-collected signals.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{
 *   ancestry: string[],
 *   pipes: boolean,
 *   keywords: string[],
 *   networkEndpoints: string[],
 *   tccAccess: boolean,
 *   codeSignVendor: string|null
 * }} signals
 * @returns {{ score: number, verdict: string, signals: string[] }}
 */
export function scoreSignals(signals) {
  const {
    ancestry = [],
    pipes = false,
    keywords = [],
    networkEndpoints = [],
    tccAccess = false,
    codeSignVendor = null,
  } = signals;

  let score = 0;
  const descriptions = [];

  if (ancestry.length > 0) {
    score += SIGNAL_POINTS.ANCESTRY;
    descriptions.push(`AI process ancestry: ${ancestry.join(', ')}`);
  }

  if (pipes) {
    score += SIGNAL_POINTS.PIPES;
    descriptions.push('stdin/stdout are pipes (MCP server pattern)');
  }

  if (keywords.length > 0) {
    score += SIGNAL_POINTS.KEYWORDS;
    descriptions.push(`AI keywords in command line: ${keywords.join(', ')}`);
  }

  if (networkEndpoints.length > 0) {
    score += SIGNAL_POINTS.NETWORK;
    descriptions.push(`Connected to AI endpoint(s): ${networkEndpoints.join(', ')}`);
  }

  if (tccAccess) {
    score += SIGNAL_POINTS.TCC;
    descriptions.push('Has Full Disk Access (TCC)');
  }

  if (codeSignVendor) {
    score += SIGNAL_POINTS.CODE_SIGN;
    descriptions.push(`Code-signed by known AI vendor: ${codeSignVendor}`);
  }

  let verdict;
  if (score >= 50) {
    verdict = VERDICT.CONFIRMED_AI;
  } else if (score >= 30) {
    verdict = VERDICT.LIKELY_AI;
  } else {
    verdict = VERDICT.NOT_AI;
  }

  return { score, verdict, signals: descriptions };
}

// ---------------------------------------------------------------------------
// buildProcessTree
// ---------------------------------------------------------------------------

/**
 * Build a Map of all running processes with PID → {pid, ppid, name, cmd}.
 * Uses `ps` on macOS and /proc on Linux.
 * Never throws — returns partial results on error.
 *
 * @returns {Promise<Map<number, {pid: number, ppid: number, name: string, cmd: string}>>}
 */
export async function buildProcessTree() {
  const tree = new Map();

  try {
    if (IS_MAC || IS_LINUX) {
      // ps -A outputs all processes; -o selects columns
      const { stdout, error } = await execCommand('ps', ['-A', '-o', 'pid=,ppid=,comm=,command=']);
      if (error) return tree;

      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Format: "  pid  ppid  comm  full_command..."
        // ps -o pid=,ppid=,comm=,command= gives columns with no headers
        const parts = trimmed.split(/\s+/);
        if (parts.length < 3) continue;

        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const name = parts[2] || '';
        const cmd = parts.slice(3).join(' ');

        if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;

        tree.set(pid, { pid, ppid, name, cmd });
      }
    }
  } catch {
    // Graceful — return whatever we have
  }

  return tree;
}

// ---------------------------------------------------------------------------
// Signal collectors (all return new objects, never throw)
// ---------------------------------------------------------------------------

/**
 * Signal 1 — Walk PPID chain looking for known AI app ancestors.
 * @param {number} pid
 * @param {Map} processTree
 * @returns {string[]} array of AI ancestor app names
 */
function collectAncestry(pid, processTree) {
  const ancestors = [];
  const visited = new Set();
  let current = processTree.get(pid);

  while (current && !visited.has(current.ppid)) {
    visited.add(current.pid);
    const parent = processTree.get(current.ppid);
    if (!parent) break;

    const parentNameLower = parent.name.toLowerCase();
    const isAiParent = Object.keys(AI_APPS).some(
      (key) => key.toLowerCase() === parentNameLower,
    );

    if (isAiParent) {
      const appInfo = AI_APPS[parent.name] || AI_APPS[parentNameLower];
      ancestors.push(appInfo ? appInfo.name : parent.name);
    }

    current = parent;
  }

  return ancestors;
}

/**
 * Signal 2 — Check if fd 0 and fd 1 are pipes (MCP server pattern).
 * @param {number} pid
 * @returns {Promise<boolean>}
 */
async function collectPipes(pid) {
  try {
    const { stdout, error } = await execCommand('lsof', ['-p', String(pid), '-F', 'fn']);
    if (error || !stdout) return false;

    // lsof -F fn output format:
    // p<pid>
    // f<fd>
    // n<name or type>
    // t<type>
    // We use -F fn which gives f-lines (fd number) and n-lines (fd name/type)
    // A pipe will show "type=PIPE" or the name will be "pipe"
    const lines = stdout.split('\n');

    let currentFd = null;
    let fd0IsPipe = false;
    let fd1IsPipe = false;

    for (const line of lines) {
      if (line.startsWith('f')) {
        currentFd = line.slice(1).trim();
      } else if (line.startsWith('n')) {
        const val = line.slice(1).toLowerCase();
        if (currentFd === '0' && (val.includes('pipe') || val === '')) {
          fd0IsPipe = val.includes('pipe');
        } else if (currentFd === '1' && (val.includes('pipe') || val === '')) {
          fd1IsPipe = val.includes('pipe');
        }
      }
    }

    // Alternative: use -F t to get types explicitly
    // Try type-based approach if above did not work
    if (!fd0IsPipe && !fd1IsPipe) {
      const { stdout: stdout2, error: err2 } = await execCommand('lsof', ['-p', String(pid), '-F', 'ft']);
      if (!err2 && stdout2) {
        const lines2 = stdout2.split('\n');
        let fd = null;
        for (const line of lines2) {
          if (line.startsWith('f')) {
            fd = line.slice(1).trim();
          } else if (line.startsWith('t')) {
            const type = line.slice(1).toUpperCase();
            if (fd === '0' && type === 'PIPE') fd0IsPipe = true;
            if (fd === '1' && type === 'PIPE') fd1IsPipe = true;
          }
        }
      }
    }

    return fd0IsPipe && fd1IsPipe;
  } catch {
    return false;
  }
}

/**
 * Signal 3 — Check command line for AI-related keywords.
 * @param {string} cmd
 * @returns {string[]} matched keywords
 */
function collectKeywords(cmd) {
  if (!cmd) return [];
  const cmdLower = cmd.toLowerCase();
  return CMD_KEYWORDS.filter((kw) => cmdLower.includes(kw));
}

/**
 * Signal 4 — Check if process has network connections to known AI endpoints.
 * @param {number} pid
 * @returns {Promise<string[]>} matched endpoint patterns
 */
async function collectNetworkEndpoints(pid) {
  try {
    const { stdout, error } = await execCommand('lsof', ['-i', '-p', String(pid), '-F', 'n']);
    if (error || !stdout) return [];

    const matched = [];
    for (const line of stdout.split('\n')) {
      if (!line.startsWith('n')) continue;
      const addr = line.slice(1);
      for (const endpoint of AI_ENDPOINTS) {
        if (addr.includes(endpoint.pattern) && !matched.includes(endpoint.pattern)) {
          matched.push(endpoint.pattern);
        }
      }
    }
    return matched;
  } catch {
    return [];
  }
}

/**
 * Signal 5 — Check TCC Full Disk Access (macOS only).
 * @param {string} procName
 * @returns {Promise<boolean>}
 */
async function collectTccAccess(procName) {
  if (!IS_MAC) return false;
  try {
    const tccDbPath = `${process.env.HOME}/Library/Application Support/com.apple.TCC/TCC.db`;
    const query = `SELECT client FROM access WHERE service='kTCCServiceSystemPolicyAllFiles' AND auth_value=2`;
    const { stdout, error } = await execCommand('sqlite3', [tccDbPath, query]);
    if (error || !stdout) return false;

    const clients = stdout.split('\n').map((l) => l.trim().toLowerCase());
    return clients.some((c) => c && procName.toLowerCase().includes(c));
  } catch {
    return false;
  }
}

/**
 * Signal 6 — Check code-signing authority (macOS only).
 * Results are cached per executable path.
 * @param {number} pid
 * @returns {Promise<string|null>} vendor name or null
 */
async function collectCodeSignVendor(pid) {
  if (!IS_MAC) return null;

  try {
    // Get executable path from /proc or ps
    const { stdout: pathOut, error: pathErr } = await execCommand(
      'ps', ['-p', String(pid), '-o', 'comm='],
    );
    if (pathErr || !pathOut.trim()) return null;

    const execPath = pathOut.trim();

    if (codeSignCache.has(execPath)) {
      return codeSignCache.get(execPath);
    }

    const { stdout, error } = await execCommand('codesign', ['-dv', execPath]);
    // codesign writes to stderr
    const { stderr } = await execCommand('codesign', ['-dv', execPath]);
    if (error && !stderr) {
      codeSignCache.set(execPath, null);
      return null;
    }

    const output = (stdout + '\n' + stderr).toLowerCase();
    const matchedVendor = AI_VENDORS.find((v) => output.includes(v.toLowerCase()));
    const result = matchedVendor || null;

    codeSignCache.set(execPath, result);
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// classifyProcess — main async classifier
// ---------------------------------------------------------------------------

/**
 * Classify a process using all 6 signals.
 *
 * @param {number} pid
 * @param {string} procName
 * @param {string} cmd
 * @returns {Promise<{
 *   score: number,
 *   verdict: string,
 *   signals: string[],
 *   aiVendor: string|null,
 *   ancestorApps: string[]
 * }>}
 */
export async function classifyProcess(pid, procName, cmd) {
  // Build process tree for ancestry check
  let processTree;
  try {
    processTree = await buildProcessTree();
  } catch {
    processTree = new Map();
  }

  // Collect all signals in parallel
  const [ancestry, pipes, networkEndpoints, tccAccess, codeSignVendor] =
    await Promise.all([
      Promise.resolve(collectAncestry(pid, processTree)),
      collectPipes(pid),
      collectNetworkEndpoints(pid),
      collectTccAccess(procName),
      collectCodeSignVendor(pid),
    ]);

  const keywords = collectKeywords(cmd);

  const { score, verdict, signals } = scoreSignals({
    ancestry,
    pipes,
    keywords,
    networkEndpoints,
    tccAccess,
    codeSignVendor,
  });

  return {
    score,
    verdict,
    signals,
    aiVendor: codeSignVendor,
    ancestorApps: [...ancestry],
  };
}

export default { classifyProcess, buildProcessTree, scoreSignals, VERDICT };
