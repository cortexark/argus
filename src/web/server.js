/**
 * Local web server for Argus dashboard.
 * Serves static UI at http://localhost:3131
 * REST API at /api/*
 * WebSocket at /ws for real-time event streaming
 *
 * Binds to localhost ONLY (127.0.0.1) — never 0.0.0.0
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { createBroadcaster } from './ws-broadcaster.js';
import { config } from '../lib/config.js';
import { generateReport } from '../report/report-generator.js';
import {
  getRecentAlerts,
  getActiveProcesses,
  getNetworkEvents,
  setApprovalDecision,
  getApprovalDecisions,
  getRecentSessions,
  getRecentUsageSnapshots,
} from '../db/store.js';
import { collectAllUsage } from '../monitors/usage-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const WEB_PORT = Number(process.env.ARGUS_WEB_PORT) || 3131;

// Magic GUID required by the WebSocket spec
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function normalizePrivacyMode(mode) {
  return mode === 'deep' ? 'deep' : 'basic';
}

function getSettingsPath() {
  return process.env.ARGUS_SETTINGS_PATH || join(homedir(), '.argus', 'settings.json');
}

function readSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (!existsSync(settingsPath)) return {};
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function getConfiguredPrivacyMode() {
  const settings = readSettings();
  if (!settings.privacyMode) return config.PRIVACY_MODE;
  return normalizePrivacyMode(settings.privacyMode);
}

function savePrivacyMode(mode) {
  const nextMode = normalizePrivacyMode(mode);
  const settingsPath = getSettingsPath();
  const settings = readSettings();
  settings.onboardingVersion = Number(settings.onboardingVersion) || 1;
  settings.privacyMode = nextMode;
  settings.updatedAt = new Date().toISOString();
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return nextMode;
}

async function uninstallService() {
  if (process.env.ARGUS_SKIP_DAEMON_UNINSTALL === '1') {
    return { success: true, message: 'Service uninstall skipped (test mode).' };
  }
  try {
    const daemonManager = await import('../daemon/daemon-manager.js');
    if (daemonManager?.uninstall) {
      return await daemonManager.uninstall();
    }
  } catch (err) {
    return { success: false, message: err?.message || 'Service uninstall failed.' };
  }
  return { success: false, message: 'Service manager unavailable.' };
}

function uninstallLocalData(confirm) {
  if (!confirm) {
    return { success: false, message: 'Confirmation required.' };
  }
  if (process.env.ARGUS_SKIP_DATA_DELETE === '1') {
    return { success: true, message: 'Data deletion skipped (test mode).' };
  }
  try {
    rmSync(config.DATA_DIR, { recursive: true, force: true });
    return { success: true, message: `Removed local data at ${config.DATA_DIR}` };
  } catch (err) {
    return { success: false, message: err?.message || 'Could not remove local data.' };
  }
}

async function triggerAppRestart() {
  // Test guard: allow endpoint behavior to be validated without terminating test process.
  if (process.env.ARGUS_SKIP_RESTART === '1') return;

  if (process.versions?.electron) {
    try {
      const electronMod = await import('electron');
      const electronApp = electronMod?.app || electronMod?.default?.app;
      if (electronApp) {
        electronApp.relaunch();
        electronApp.exit(0);
        return;
      }
    } catch {
      // Fallback to process exit below.
    }
  }

  // In daemon/service mode, supervisor can relaunch after exit.
  process.exit(0);
}

/**
 * Check whether an origin header value is a localhost origin.
 * Accepts any port on localhost/127.0.0.1.
 * @param {string|undefined} origin
 * @returns {boolean}
 */
function isLocalhostOrigin(origin) {
  if (!origin) return true; // no Origin header = same-origin or non-browser
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Return the CORS origin to reflect, or null if the origin is rejected.
 * @param {string|undefined} origin
 * @returns {string|null}
 */
function corsOriginHeader(origin) {
  if (!origin) return null;
  return isLocalhostOrigin(origin) ? origin : null;
}

/**
 * Sanitize data for safe JSON serialisation.
 * Strips undefined values, converts to plain objects.
 * @param {unknown} data
 * @returns {unknown}
 */
function sanitize(data) {
  return JSON.parse(JSON.stringify(data, (_k, v) => (v === undefined ? null : v)));
}

/**
 * Send a JSON API response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {string|null} allowOrigin
 */
function sendJson(res, status, body, allowOrigin = null) {
  const payload = JSON.stringify(sanitize(body));
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
  }
  res.writeHead(status, headers);
  res.end(payload);
}

/**
 * Compute the Sec-WebSocket-Accept header value per RFC 6455.
 * @param {string} key - Sec-WebSocket-Key from the request
 * @returns {string}
 */
function computeWebSocketAccept(key) {
  return createHash('sha1').update(key + WS_GUID).digest('base64');
}

/**
 * Wrap a raw net.Socket in a minimal WebSocket-compatible object.
 * Provides .send(string) and .readyState (always 1 if open, 3 if closed).
 * Only handles sending text frames; does not parse incoming frames.
 * @param {import('node:net').Socket} socket
 * @returns {{ send: (data: string) => void, readyState: number }}
 */
function wrapWebSocket(socket) {
  let readyState = 1; // OPEN

  socket.on('close', () => { readyState = 3; });
  socket.on('error', () => { readyState = 3; });

  return {
    get readyState() { return readyState; },
    send(data) {
      if (readyState !== 1) return;
      const buf = Buffer.from(data, 'utf8');
      const len = buf.length;
      let header;
      if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text opcode
        header[1] = len;
      } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
      }
      try {
        socket.write(Buffer.concat([header, buf]));
      } catch {
        readyState = 3;
      }
    },
  };
}

/**
 * Return an ISO timestamp for 24 hours ago.
 * @returns {string}
 */
function since24h() {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

/**
 * Query injection alerts from the file_access_events table.
 * @param {import('better-sqlite3').Database} db
 * @returns {object[]}
 */
function getInjectionAlerts(db) {
  try {
    return db.prepare(`
      SELECT * FROM file_access_events
      WHERE (sensitivity = 'injection' OR access_type = 'injection')
        AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 100
    `).all(since24h());
  } catch {
    return [];
  }
}

/**
 * Get all port history rows ordered by connection count descending.
 * @param {import('better-sqlite3').Database} db
 * @returns {object[]}
 */
function getAllPortHistory(db) {
  try {
    return db.prepare(`
      SELECT * FROM port_history
      ORDER BY connection_count DESC
      LIMIT 200
    `).all();
  } catch {
    return [];
  }
}

/**
 * Start the local web server.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} [port] - Port override (defaults to WEB_PORT)
 * @returns {{ server: import('node:http').Server, broadcast: (event: object) => void }}
 */
export function startWebServer(db, port, controller = null) {
  const listenPort = port != null ? port : WEB_PORT;
  const broadcaster = createBroadcaster();

  // Load UI HTML once at startup (may be null if file not yet present)
  const uiPath = join(__dirname, 'ui', 'index.html');
  let uiHtml = null;
  if (existsSync(uiPath)) {
    uiHtml = readFileSync(uiPath, 'utf8');
  }

  const server = createServer((req, res) => {
    const origin = req.headers['origin'];

    // Reject requests from non-localhost origins
    if (origin && !isLocalhostOrigin(origin)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const allowOrigin = corsOriginHeader(origin);
    const url = new URL(req.url || '/', `http://127.0.0.1:${listenPort}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    // --- Static UI ---
    if (path === '/' || path === '/index.html') {
      if (!uiHtml) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('UI not found');
        return;
      }
      const buf = Buffer.from(uiHtml, 'utf8');
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      };
      if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
      res.writeHead(200, headers);
      res.end(buf);
      return;
    }

    // --- REST API ---
    if (path === '/api/status') {
      const sinceISO = since24h();
      let processCount = 0;
      let alertCount = 0;
      let hasCritical = false;
      const configuredPrivacyMode = getConfiguredPrivacyMode();
      try { processCount = getActiveProcesses(db, sinceISO).length; } catch { /* ignore */ }
      try {
        const alerts = getRecentAlerts(db, sinceISO);
        alertCount = alerts.length;
        hasCritical = alerts.some(a =>
          a.sensitivity === 'credentials' || a.sensitivity === 'browserData',
        );
      } catch { /* ignore */ }

      sendJson(res, 200, {
        running: true,
        paused: controller ? controller.paused : false,
        uptime: Math.floor(process.uptime()),
        privacyMode: config.PRIVACY_MODE,
        configuredPrivacyMode,
        restartRequired: configuredPrivacyMode !== config.PRIVACY_MODE,
        processCount,
        alertCount,
        hasCritical,
      }, allowOrigin);
      return;
    }

    if (path === '/api/monitoring/toggle' && method === 'POST') {
      if (controller) controller.paused = !controller.paused;
      sendJson(res, 200, { paused: controller ? controller.paused : false }, allowOrigin);
      return;
    }

    if (path === '/api/privacy-mode' && method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const mode = parsed?.mode;
          if (!['basic', 'deep'].includes(mode)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request');
            return;
          }
          const configuredPrivacyMode = savePrivacyMode(mode);
          sendJson(res, 200, {
            ok: true,
            configuredPrivacyMode,
            activePrivacyMode: config.PRIVACY_MODE,
            restartRequired: configuredPrivacyMode !== config.PRIVACY_MODE,
          }, allowOrigin);
        } catch {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad Request');
        }
      });
      return;
    }

    if (path === '/api/app/uninstall-info' && method === 'GET') {
      sendJson(res, 200, {
        appPath: process.execPath,
        dataDir: config.DATA_DIR,
        serviceCommand: 'argus uninstall',
        appRemovalHint: 'Quit Argus, then move Argus.app to Trash.',
      }, allowOrigin);
      return;
    }

    if (path === '/api/app/uninstall-service' && method === 'POST') {
      uninstallService().then((result) => {
        sendJson(res, 200, {
          ok: Boolean(result?.success),
          message: result?.message || (result?.success ? 'Service uninstalled.' : 'Service uninstall failed.'),
        }, allowOrigin);
      }).catch((err) => {
        sendJson(res, 500, {
          ok: false,
          message: err?.message || 'Service uninstall failed.',
        }, allowOrigin);
      });
      return;
    }

    if (path === '/api/app/uninstall-data' && method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const result = uninstallLocalData(parsed?.confirm === true);
          if (!result.success && result.message === 'Confirmation required.') {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request');
            return;
          }
          sendJson(res, 200, {
            ok: Boolean(result.success),
            message: result.message,
          }, allowOrigin);
        } catch {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad Request');
        }
      });
      return;
    }

    if (path === '/api/app/restart' && method === 'POST') {
      sendJson(res, 200, { ok: true, restarting: true }, allowOrigin);
      // Delay restart very slightly to ensure response flushes to client.
      setTimeout(() => {
        triggerAppRestart().catch(() => {
          // Worst-case fallback if restart flow errors.
          process.exit(0);
        });
      }, 120);
      return;
    }

    if (path === '/api/processes') {
      let data = [];
      try { data = getActiveProcesses(db, since24h()); } catch { /* ignore */ }
      sendJson(res, 200, data, allowOrigin);
      return;
    }

    if (path === '/api/alerts') {
      let data = [];
      try { data = getRecentAlerts(db, since24h()); } catch { /* ignore */ }
      sendJson(res, 200, data, allowOrigin);
      return;
    }

    if (path === '/api/network') {
      let data = [];
      try { data = getNetworkEvents(db, since24h()); } catch { /* ignore */ }
      sendJson(res, 200, data, allowOrigin);
      return;
    }

    if (path === '/api/ports') {
      sendJson(res, 200, getAllPortHistory(db), allowOrigin);
      return;
    }

    if (path === '/api/report') {
      let data = {};
      try {
        const reportStr = generateReport(db, { format: 'json' });
        data = JSON.parse(reportStr);
      } catch {
        data = { error: 'Report generation failed' };
      }
      sendJson(res, 200, data, allowOrigin);
      return;
    }

    if (path === '/api/injections') {
      sendJson(res, 200, getInjectionAlerts(db), allowOrigin);
      return;
    }

    // Approvals: GET pending, POST approve/deny
    if (path === '/api/approvals' && method === 'GET') {
      let alerts = [];
      let decisions = new Map();
      try { alerts = getRecentAlerts(db, since24h()); } catch { /* ignore */ }
      try { decisions = getApprovalDecisions(db); } catch { /* ignore */ }
      const pending = alerts
        .filter(a => a.sensitivity === 'credentials' || a.sensitivity === 'browserData')
        .slice(0, 20)
        .map(a => ({ ...a, decision: decisions.get(a.id) || 'pending' }));
      sendJson(res, 200, pending, allowOrigin);
      return;
    }

    if (path === '/api/approvals/decide' && method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { id, decision } = JSON.parse(body);
          if (!id || !['approved', 'denied'].includes(decision)) {
            res.writeHead(400); res.end('Bad Request'); return;
          }
          setApprovalDecision(db, Number(id), decision);
          sendJson(res, 200, { ok: true, id, decision }, allowOrigin);
        } catch {
          res.writeHead(400); res.end('Bad Request');
        }
      });
      return;
    }

    // Session history
    if (path === '/api/sessions' && method === 'GET') {
      let sessions = [];
      try { sessions = getRecentSessions(db); } catch { /* ignore */ }
      sendJson(res, 200, sessions, allowOrigin);
      return;
    }

    // AI tool usage: token counts, costs, model breakdown (TermTracker-inspired)
    if (path === '/api/usage' && method === 'GET') {
      try {
        const live = collectAllUsage();
        let snapshots = [];
        try { snapshots = getRecentUsageSnapshots(db); } catch { /* ignore */ }
        sendJson(res, 200, { ...live, history: snapshots }, allowOrigin);
      } catch (err) {
        sendJson(res, 200, { tools: [], summary: {}, history: [], error: err.message }, allowOrigin);
      }
      return;
    }

    // App activity: per-app summary of ports + recent files
    if (path === '/api/activity' && method === 'GET') {
      let processes = [];
      let alerts = [];
      let ports = [];
      try { processes = getActiveProcesses(db, since24h()); } catch { /* ignore */ }
      try { alerts = getRecentAlerts(db, since24h()); } catch { /* ignore */ }
      try { ports = getAllPortHistory(db); } catch { /* ignore */ }

      // Group by app_label — seed from processes, then fill from alerts/ports
      const byApp = {};
      for (const p of processes) {
        const label = p.app_label || p.name;
        if (!byApp[label]) byApp[label] = { label, category: p.category, ports: [], files: [] };
      }
      // Ensure apps that generated alerts are always represented
      for (const a of alerts) {
        const label = a.app_label || a.process_name;
        if (label && !byApp[label]) byApp[label] = { label, category: 'Unknown', ports: [], files: [] };
      }
      for (const p of ports) {
        const label = p.app_label || p.process_name;
        if (byApp[label]) byApp[label].ports.push(p.port);
      }
      for (const a of alerts) {
        const label = a.app_label || a.process_name;
        if (label && byApp[label]) {
          byApp[label].files.push({ path: a.file_path, sensitivity: a.sensitivity, ts: a.timestamp });
        }
      }

      // Dedupe ports, cap files at 5 most recent
      const activity = Object.values(byApp).map(app => ({
        ...app,
        ports: [...new Set(app.ports)].sort((a, b) => a - b),
        files: app.files.slice(0, 5),
      }));
      sendJson(res, 200, activity, allowOrigin);
      return;
    }

    // 404 for all other paths
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // WebSocket upgrade: only allow connections to /ws
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${listenPort}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = computeWebSocketAccept(key);
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n'));

    const ws = wrapWebSocket(socket);
    broadcaster.addClient(ws);
    socket.on('close', () => broadcaster.removeClient(ws));
    socket.on('error', () => broadcaster.removeClient(ws));
  });

  // Bind to loopback only — non-fatal if port is in use
  let listening = false;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[argus] Web dashboard port ${listenPort} already in use — skipping web server`);
    } else {
      console.error(`[argus] Web server error: ${err.message}`);
    }
  });
  server.listen(listenPort, '127.0.0.1', () => { listening = true; });

  return {
    server,
    broadcast(event) {
      if (listening) broadcaster.broadcast(event);
    },
  };
}

export default { startWebServer, WEB_PORT };
