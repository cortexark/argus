/**
 * Local web server for Argus dashboard.
 * Serves static UI at http://localhost:3131
 * REST API at /api/*
 * WebSocket at /ws for real-time event streaming
 *
 * Binds to localhost ONLY (127.0.0.1) — never 0.0.0.0
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createBroadcaster } from './ws-broadcaster.js';
import { generateReport } from '../report/report-generator.js';
import {
  getRecentAlerts,
  getActiveProcesses,
  getNetworkEvents,
} from '../db/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const WEB_PORT = Number(process.env.ARGUS_WEB_PORT) || 3131;

// Magic GUID required by the WebSocket spec
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

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
export function startWebServer(db, port) {
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
      try { processCount = getActiveProcesses(db, sinceISO).length; } catch { /* ignore */ }
      try { alertCount = getRecentAlerts(db, sinceISO).length; } catch { /* ignore */ }

      sendJson(res, 200, {
        running: true,
        uptime: Math.floor(process.uptime()),
        processCount,
        alertCount,
      }, allowOrigin);
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
