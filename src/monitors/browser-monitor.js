/**
 * Browser monitor — detects browser-related AI activity.
 * Identifies when AI agents access browser data, automate browsers,
 * or use browser-based APIs.
 */

import { AI_APPS, AI_ENDPOINTS } from '../ai-apps.js';

// ---------------------------------------------------------------------------
// Browser process registry
// ---------------------------------------------------------------------------

export const BROWSER_PROCESSES = Object.freeze({
  'Google Chrome': { name: 'Google Chrome', family: 'chromium' },
  'Google Chrome Helper': { name: 'Google Chrome', family: 'chromium' },
  'Chromium': { name: 'Chromium', family: 'chromium' },
  'firefox': { name: 'Firefox', family: 'gecko' },
  'Firefox': { name: 'Firefox', family: 'gecko' },
  'Safari': { name: 'Safari', family: 'webkit' },
  'Safari Web Content': { name: 'Safari', family: 'webkit' },
  'Brave Browser': { name: 'Brave', family: 'chromium' },
  'Microsoft Edge': { name: 'Edge', family: 'chromium' },
  'Arc': { name: 'Arc', family: 'chromium' },
});

// ---------------------------------------------------------------------------
// Browser file severity mapping
// ---------------------------------------------------------------------------

export const BROWSER_FILE_SEVERITY = Object.freeze({
  'Login Data': { severity: 'CRITICAL', label: 'Saved passwords' },
  'Cookies': { severity: 'HIGH', label: 'Session cookies' },
  'History': { severity: 'MEDIUM', label: 'Browsing history' },
  'Bookmarks': { severity: 'LOW', label: 'Bookmarks' },
  'key4.db': { severity: 'CRITICAL', label: 'Firefox password database' },
  'logins.json': { severity: 'CRITICAL', label: 'Firefox saved logins' },
  'cookies.sqlite': { severity: 'HIGH', label: 'Firefox cookies' },
  'places.sqlite': { severity: 'MEDIUM', label: 'Firefox history & bookmarks' },
});

// Map browser directory patterns to browser names
const BROWSER_DIR_PATTERNS = [
  { pattern: 'google/chrome', browser: 'Google Chrome' },
  { pattern: 'google\\chrome', browser: 'Google Chrome' },
  { pattern: 'bravesoftware', browser: 'Brave Browser' },
  { pattern: 'firefox', browser: 'Firefox' },
  { pattern: 'mozilla/firefox', browser: 'Firefox' },
  { pattern: '.mozilla', browser: 'Firefox' },
  { pattern: 'safari', browser: 'Safari' },
  { pattern: 'microsoft edge', browser: 'Microsoft Edge' },
  { pattern: 'microsoft\\edge', browser: 'Microsoft Edge' },
  { pattern: '/arc', browser: 'Arc' },
  { pattern: 'chromium', browser: 'Chromium' },
];

// CDP port
const CDP_PORT = 9222;
const CDP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// AppleScript browser application names
const APPLESCRIPT_BROWSER_APPS = ['Safari', 'Google Chrome', 'Brave Browser', 'Firefox', 'Microsoft Edge', 'Arc'];

// ---------------------------------------------------------------------------
// Category 1: Classify browser file access
// ---------------------------------------------------------------------------

/**
 * Classify a file path as a browser sensitive file.
 * Returns null if the file is not a known browser data file.
 *
 * @param {string|null} filePath
 * @returns {{ browser: string, dataType: string, severity: string } | null}
 */
export function classifyBrowserFile(filePath) {
  if (!filePath) return null;

  const pathLower = filePath.toLowerCase();

  // Extract the basename (last path component)
  const basename = filePath.split(/[/\\]/).pop() || '';

  // Check if basename is a known browser data file
  const fileEntry = BROWSER_FILE_SEVERITY[basename];
  if (!fileEntry) return null;

  // Determine which browser this belongs to
  let browser = 'Unknown Browser';
  for (const { pattern, browser: browserName } of BROWSER_DIR_PATTERNS) {
    if (pathLower.includes(pattern.toLowerCase())) {
      browser = browserName;
      break;
    }
  }

  return {
    browser,
    dataType: fileEntry.label,
    severity: fileEntry.severity,
  };
}

// ---------------------------------------------------------------------------
// Category 2: Detect Chrome DevTools Protocol connections
// ---------------------------------------------------------------------------

/**
 * Detect AI agents connecting to Chrome via CDP (port 9222).
 * This indicates direct browser automation — the AI can read DOM,
 * execute JS, take screenshots.
 *
 * @param {Array<{processName: string, appLabel?: string, port: number, remoteHost: string}>|null} networkEvents
 * @returns {Array<{processName: string, appLabel: string, port: number, verdict: string}>}
 */
export function detectCdpConnection(networkEvents) {
  if (!networkEvents || !Array.isArray(networkEvents)) return [];

  const results = [];

  for (const event of networkEvents) {
    const port = typeof event.port === 'number' ? event.port : parseInt(event.port, 10);
    if (port !== CDP_PORT) continue;

    const host = (event.remoteHost || '').toLowerCase();
    if (!CDP_HOSTS.has(host)) continue;

    results.push({
      processName: event.processName,
      appLabel: event.appLabel || event.processName,
      port: CDP_PORT,
      verdict: 'browser_automation',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Category 3: Detect browser processes spawned by AI
// ---------------------------------------------------------------------------

/**
 * Detect if a browser process appears as a child of an AI process.
 * This means the AI launched a (possibly headless) browser.
 *
 * @param {Map<number, {pid: number, ppid: number, name: string, cmd: string}>} processTree
 * @returns {Array<{browserProcess: string, parentAiApp: string}>}
 */
export function detectBrowserSpawn(processTree) {
  if (!processTree || !(processTree instanceof Map)) return [];

  const results = [];
  const aiAppNames = new Set(Object.keys(AI_APPS).map((k) => k.toLowerCase()));
  const browserNames = new Set(Object.keys(BROWSER_PROCESSES).map((k) => k.toLowerCase()));

  for (const [, proc] of processTree) {
    const nameLower = proc.name.toLowerCase();
    if (!browserNames.has(nameLower)) continue;

    // Walk up to find an AI parent
    const parent = processTree.get(proc.ppid);
    if (!parent) continue;

    const parentNameLower = parent.name.toLowerCase();
    if (!aiAppNames.has(parentNameLower)) continue;

    const aiInfo = AI_APPS[parent.name] || AI_APPS[parentNameLower];
    const browserInfo = BROWSER_PROCESSES[proc.name] || BROWSER_PROCESSES[nameLower];

    results.push({
      browserProcess: browserInfo ? browserInfo.name : proc.name,
      parentAiApp: aiInfo ? aiInfo.name : parent.name,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Category 4: Detect AppleScript browser control
// ---------------------------------------------------------------------------

/**
 * Detect AI agents using osascript to control Safari or Chrome.
 *
 * @param {Map<number, {pid: number, ppid: number, name: string, cmd: string}>} processTree
 * @returns {Array<{pid: number, aiApp: string, browser: string, cmd: string}>}
 */
export function detectAppleScriptBrowserControl(processTree) {
  if (!processTree || !(processTree instanceof Map)) return [];

  const results = [];
  const aiAppNames = new Set(Object.keys(AI_APPS).map((k) => k.toLowerCase()));

  for (const [, proc] of processTree) {
    if (proc.name.toLowerCase() !== 'osascript') continue;

    const cmd = proc.cmd || '';

    // Check if this osascript call targets a known browser
    const targetedBrowser = APPLESCRIPT_BROWSER_APPS.find(
      (app) => cmd.toLowerCase().includes(`tell application "${app.toLowerCase()}`),
    );
    if (!targetedBrowser) continue;

    // Check if parent is an AI app
    const parent = processTree.get(proc.ppid);
    if (!parent) continue;

    const parentNameLower = parent.name.toLowerCase();
    if (!aiAppNames.has(parentNameLower)) continue;

    const aiInfo = AI_APPS[parent.name] || AI_APPS[parentNameLower];

    results.push({
      pid: proc.pid,
      aiApp: aiInfo ? aiInfo.name : parent.name,
      browser: targetedBrowser,
      cmd,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Category 5: Detect browser extension AI calls (DB query)
// ---------------------------------------------------------------------------

/**
 * Detect browser processes making connections to AI endpoints.
 * Indicates a browser extension is calling AI APIs.
 *
 * @param {object} db - better-sqlite3 Database instance
 * @param {string} sinceISO - ISO timestamp — only look at events since this time
 * @returns {Array<{processName: string, remoteHost: string, aiService: string, timestamp: string}>}
 */
export function detectBrowserExtensionAiCalls(db, sinceISO) {
  if (!db) return [];

  try {
    const browserNameList = Object.keys(BROWSER_PROCESSES)
      .map((n) => n.toLowerCase());

    const rows = db
      .prepare(
        `SELECT process_name, remote_host, ai_service, timestamp
         FROM network_events
         WHERE timestamp >= ?
         ORDER BY timestamp DESC`,
      )
      .all(sinceISO || new Date(0).toISOString());

    return rows
      .filter((row) => {
        const nameLower = (row.process_name || '').toLowerCase();
        const isBrowser = browserNameList.some((bn) => nameLower.includes(bn));
        const hasAiService = Boolean(row.ai_service);
        return isBrowser && hasAiService;
      })
      .map((row) => ({
        processName: row.process_name,
        remoteHost: row.remote_host,
        aiService: row.ai_service,
        timestamp: row.timestamp,
      }));
  } catch {
    return [];
  }
}

export default {
  classifyBrowserFile,
  detectCdpConnection,
  detectBrowserSpawn,
  detectAppleScriptBrowserControl,
  detectBrowserExtensionAiCalls,
  BROWSER_PROCESSES,
  BROWSER_FILE_SEVERITY,
};
