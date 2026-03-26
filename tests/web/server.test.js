/**
 * Tests for src/web/server.js and src/web/ws-broadcaster.js
 * Uses in-memory DB seeded with test data.
 * Uses Node.js built-in fetch (Node 18+).
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase } from '../../src/db/schema.js';
import {
  insertProcessSnapshot,
  insertFileAccess,
  insertNetworkEvent,
  upsertPortHistory,
  insertSession,
  closeSession,
} from '../../src/db/store.js';
import { startWebServer, WEB_PORT } from '../../src/web/server.js';
import { createBroadcaster } from '../../src/web/ws-broadcaster.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // async test — handled by asyncTest
      throw new Error('Use asyncTest() for async tests');
    }
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

// --- Setup in-memory DB with seed data ---
let db;
try {
  db = initializeDatabase(':memory:');
} catch (err) {
  console.log(`FATAL: Could not init DB: ${err.message}`);
  process.exit(1);
}

const NOW = new Date().toISOString();
const PAST_1H = new Date(Date.now() - 3600 * 1000).toISOString();

const TEST_SETTINGS_DIR = mkdtempSync(join(tmpdir(), 'argus-web-settings-'));
const TEST_SETTINGS_PATH = join(TEST_SETTINGS_DIR, 'settings.json');
process.env.ARGUS_SETTINGS_PATH = TEST_SETTINGS_PATH;
process.env.ARGUS_SKIP_RESTART = '1';
process.env.ARGUS_SKIP_DAEMON_UNINSTALL = '1';
process.env.ARGUS_SKIP_DATA_DELETE = '1';

// Seed process snapshots
insertProcessSnapshot(db, {
  pid: 101, name: 'Claude', appLabel: 'Claude Desktop', category: 'LLM',
  cpu: 2.5, memory: 512, timestamp: NOW,
});
insertProcessSnapshot(db, {
  pid: 102, name: 'cursor', appLabel: 'Cursor', category: 'Editor',
  cpu: 1.0, memory: 256, timestamp: NOW,
});

// Seed file access events (alerts)
insertFileAccess(db, {
  pid: 101, processName: 'Claude', appLabel: 'Claude Desktop',
  filePath: '/Users/t/.ssh/id_rsa', accessType: 'read',
  sensitivity: 'credentials', isAlert: 1, timestamp: NOW,
});
insertFileAccess(db, {
  pid: 102, processName: 'cursor', appLabel: 'Cursor',
  filePath: '/Users/t/Documents/project.txt', accessType: 'read',
  sensitivity: 'documents', isAlert: 1, timestamp: NOW,
});

// Seed network events
insertNetworkEvent(db, {
  pid: 101, processName: 'Claude', appLabel: 'Claude Desktop',
  localAddress: '127.0.0.1:54321', remoteAddress: '18.184.1.1:443',
  remoteHost: 'api.anthropic.com', port: 443, protocol: 'TCP',
  state: 'ESTABLISHED', aiService: 'Anthropic',
  bytesSent: 0, bytesReceived: 0, timestamp: NOW,
});

// Seed port history
upsertPortHistory(db, {
  processName: 'Claude', appLabel: 'Claude Desktop',
  port: 443, firstSeen: PAST_1H, lastSeen: NOW,
});

// Seed sessions (one running, one ended)
const runningSession = insertSession(db, {
  pid: 9001,
  appLabel: 'Claude Desktop',
  processName: 'Claude',
  cmd: 'Claude',
  startedAt: NOW,
});
const endedSession = insertSession(db, {
  pid: 9002,
  appLabel: 'Cursor',
  processName: 'cursor',
  cmd: 'cursor',
  startedAt: PAST_1H,
});
closeSession(db, endedSession.id, NOW);

// Start server on a different port from default to avoid conflicts
const TEST_PORT = 13131;
let server;
let serverHandle;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

console.log('\n=== web/server tests ===\n');

// Start server before tests
try {
  serverHandle = startWebServer(db, TEST_PORT);
  server = serverHandle.server;
  // Give server a moment to bind
  await new Promise(resolve => setTimeout(resolve, 50));
} catch (err) {
  console.log(`FATAL: Could not start web server: ${err.message}`);
  process.exit(1);
}

// --- API endpoint tests ---

await asyncTest('GET /api/status returns correct shape', async () => {
  const res = await fetch(`${BASE_URL}/api/status`);
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert.ok(typeof body.running === 'boolean', 'running should be boolean');
  assert.ok(typeof body.uptime === 'number', 'uptime should be number');
  assert.ok(typeof body.privacyMode === 'string', 'privacyMode should be string');
  assert.ok(typeof body.processCount === 'number', 'processCount should be number');
  assert.ok(typeof body.alertCount === 'number', 'alertCount should be number');
});

await asyncTest('GET /api/status includes mode configuration metadata', async () => {
  const res = await fetch(`${BASE_URL}/api/status`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(['basic', 'deep'].includes(body.privacyMode), 'privacyMode should be basic|deep');
  assert.ok(['basic', 'deep'].includes(body.configuredPrivacyMode), 'configuredPrivacyMode should be basic|deep');
  assert.ok(typeof body.restartRequired === 'boolean', 'restartRequired should be boolean');
});

await asyncTest('GET /api/status returns processCount > 0 with seeded data', async () => {
  const res = await fetch(`${BASE_URL}/api/status`);
  const body = await res.json();
  assert.ok(body.processCount >= 1, `processCount should be >= 1, got ${body.processCount}`);
});

await asyncTest('GET /api/status returns alertCount > 0 with seeded data', async () => {
  const res = await fetch(`${BASE_URL}/api/status`);
  const body = await res.json();
  assert.ok(body.alertCount >= 1, `alertCount should be >= 1, got ${body.alertCount}`);
});

await asyncTest('GET /api/processes returns an array', async () => {
  const res = await fetch(`${BASE_URL}/api/processes`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'processes should be an array');
});

await asyncTest('GET /api/processes contains seeded process', async () => {
  const res = await fetch(`${BASE_URL}/api/processes`);
  const body = await res.json();
  assert.ok(body.length >= 1, `processes should have >= 1 entry, got ${body.length}`);
});

await asyncTest('GET /api/alerts returns an array', async () => {
  const res = await fetch(`${BASE_URL}/api/alerts`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'alerts should be an array');
});

await asyncTest('GET /api/alerts contains seeded alert', async () => {
  const res = await fetch(`${BASE_URL}/api/alerts`);
  const body = await res.json();
  assert.ok(body.length >= 1, `alerts should have >= 1 entry, got ${body.length}`);
});

await asyncTest('GET /api/network returns an array', async () => {
  const res = await fetch(`${BASE_URL}/api/network`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'network should be an array');
});

await asyncTest('GET /api/network contains seeded event', async () => {
  const res = await fetch(`${BASE_URL}/api/network`);
  const body = await res.json();
  assert.ok(body.length >= 1, `network should have >= 1 entry, got ${body.length}`);
});

await asyncTest('GET /api/ports returns an array', async () => {
  const res = await fetch(`${BASE_URL}/api/ports`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'ports should be an array');
});

await asyncTest('GET /api/report returns an object with generated field', async () => {
  const res = await fetch(`${BASE_URL}/api/report`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body === 'object' && body !== null, 'report should be an object');
  assert.ok(typeof body.generated === 'string', 'report.generated should be a string');
});

await asyncTest('GET /api/injections returns an array', async () => {
  const res = await fetch(`${BASE_URL}/api/injections`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'injections should be an array');
});

await asyncTest('GET /api/approvals returns pending sensitive alerts', async () => {
  const res = await fetch(`${BASE_URL}/api/approvals`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'approvals should be an array');
  assert.ok(body.length >= 1, 'approvals should include seeded credentials alert');
  assert.ok(
    body.every((row) => ['pending', 'approved', 'denied'].includes(row.decision)),
    'each approval row should include a valid decision state',
  );
});

await asyncTest('POST /api/approvals/decide persists decision and reflects in GET /api/approvals', async () => {
  const approvalsRes = await fetch(`${BASE_URL}/api/approvals`);
  const approvals = await approvalsRes.json();
  assert.ok(approvals.length >= 1, 'need at least one approval row to test decisions');
  const target = approvals[0];

  const decideRes = await fetch(`${BASE_URL}/api/approvals/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: target.id, decision: 'approved' }),
  });
  assert.equal(decideRes.status, 200, `Expected 200, got ${decideRes.status}`);
  const decideBody = await decideRes.json();
  assert.equal(decideBody.ok, true, 'decision endpoint should return ok=true');

  const recheckRes = await fetch(`${BASE_URL}/api/approvals`);
  const recheck = await recheckRes.json();
  const updated = recheck.find((row) => row.id === target.id);
  assert.ok(updated, 'updated approval row should still be present');
  assert.equal(updated.decision, 'approved', 'decision should persist as approved');
});

await asyncTest('POST /api/approvals/decide with invalid decision returns 400', async () => {
  const res = await fetch(`${BASE_URL}/api/approvals/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, decision: 'maybe' }),
  });
  assert.equal(res.status, 400);
});

await asyncTest('POST /api/privacy-mode persists requested mode to settings file', async () => {
  const res = await fetch(`${BASE_URL}/api/privacy-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'deep' }),
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert.equal(body.ok, true, 'privacy mode endpoint should return ok=true');
  assert.equal(body.configuredPrivacyMode, 'deep');

  const persisted = JSON.parse(readFileSync(TEST_SETTINGS_PATH, 'utf8'));
  assert.equal(persisted.privacyMode, 'deep', 'settings file should persist deep mode');
});

await asyncTest('POST /api/privacy-mode with invalid mode returns 400', async () => {
  const res = await fetch(`${BASE_URL}/api/privacy-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'invalid' }),
  });
  assert.equal(res.status, 400);
});

await asyncTest('POST /api/app/restart returns restarting acknowledgement', async () => {
  const res = await fetch(`${BASE_URL}/api/app/restart`, { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.restarting, true);
});

await asyncTest('GET /api/app/uninstall-info returns uninstall metadata', async () => {
  const res = await fetch(`${BASE_URL}/api/app/uninstall-info`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.appPath === 'string' && body.appPath.length > 0, 'appPath should be present');
  assert.ok(typeof body.dataDir === 'string' && body.dataDir.length > 0, 'dataDir should be present');
  assert.ok(typeof body.serviceCommand === 'string', 'serviceCommand should be present');
});

await asyncTest('POST /api/app/uninstall-service returns success payload', async () => {
  const res = await fetch(`${BASE_URL}/api/app/uninstall-service`, { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(typeof body.message === 'string' && body.message.length > 0, 'message should be present');
});

await asyncTest('POST /api/app/uninstall-data requires explicit confirmation', async () => {
  const res = await fetch(`${BASE_URL}/api/app/uninstall-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: false }),
  });
  assert.equal(res.status, 400);
});

await asyncTest('POST /api/app/uninstall-data with confirmation returns success payload', async () => {
  const res = await fetch(`${BASE_URL}/api/app/uninstall-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(typeof body.message === 'string' && body.message.length > 0, 'message should be present');
});

await asyncTest('GET /api/sessions includes started_at and ended_at fields', async () => {
  const res = await fetch(`${BASE_URL}/api/sessions`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), 'sessions should be an array');
  assert.ok(body.length >= 2, 'sessions should include seeded running + ended sessions');
  assert.ok(body.some((s) => typeof s.started_at === 'string' && s.started_at.length > 0), 'at least one session should have started_at');
  assert.ok(body.some((s) => typeof s.ended_at === 'string' && s.ended_at.length > 0), 'at least one session should have ended_at');
});

// --- Routing and error handling ---

await asyncTest('Unknown route returns 404', async () => {
  const res = await fetch(`${BASE_URL}/api/does-not-exist`);
  assert.equal(res.status, 404);
});

await asyncTest('GET / serves HTML (index.html)', async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert.equal(res.status, 200);
  const contentType = res.headers.get('content-type') || '';
  assert.ok(contentType.includes('text/html'), `Expected text/html, got: ${contentType}`);
});

// --- Security: CORS ---

await asyncTest('CORS: localhost origin is allowed', async () => {
  const res = await fetch(`${BASE_URL}/api/status`, {
    headers: { Origin: 'http://localhost:3131' },
  });
  assert.equal(res.status, 200);
  const acaoHeader = res.headers.get('access-control-allow-origin');
  assert.ok(
    acaoHeader === 'http://localhost:3131' || acaoHeader === '*' || acaoHeader === null,
    `CORS header unexpected: ${acaoHeader}`,
  );
});

await asyncTest('CORS: non-localhost origin is rejected', async () => {
  const res = await fetch(`${BASE_URL}/api/status`, {
    headers: { Origin: 'http://evil.com' },
  });
  // Should either reject with 403 or not echo back the origin in ACAO header
  const acaoHeader = res.headers.get('access-control-allow-origin');
  const isEvil = acaoHeader === 'http://evil.com';
  assert.ok(!isEvil, 'Should not reflect evil.com in Access-Control-Allow-Origin');
});

// --- Security: CSP header ---

await asyncTest('GET / includes Content-Security-Policy header', async () => {
  const res = await fetch(`${BASE_URL}/`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp !== null, 'Content-Security-Policy header should be present');
  assert.ok(csp.includes("default-src 'self'"), `CSP should include default-src 'self', got: ${csp}`);
});

// --- Security: server only binds to 127.0.0.1 ---

test('Server address is 127.0.0.1 (not 0.0.0.0)', () => {
  const addr = server.address();
  assert.equal(addr.address, '127.0.0.1', `Expected 127.0.0.1, got ${addr.address}`);
});

// --- WebSocket broadcaster unit tests ---

test('createBroadcaster: clientCount starts at 0', () => {
  const broadcaster = createBroadcaster();
  assert.equal(broadcaster.clientCount, 0);
});

test('createBroadcaster: addClient increments clientCount', () => {
  const broadcaster = createBroadcaster();
  const fakeSocket = { send: () => {}, readyState: 1 };
  broadcaster.addClient(fakeSocket);
  assert.equal(broadcaster.clientCount, 1);
});

test('createBroadcaster: removeClient decrements clientCount', () => {
  const broadcaster = createBroadcaster();
  const fakeSocket = { send: () => {}, readyState: 1 };
  broadcaster.addClient(fakeSocket);
  broadcaster.removeClient(fakeSocket);
  assert.equal(broadcaster.clientCount, 0);
});

test('broadcast: sends JSON to all connected clients', () => {
  const broadcaster = createBroadcaster();
  const received = [];
  const fakeSocket1 = { send: (data) => received.push({ client: 1, data }), readyState: 1 };
  const fakeSocket2 = { send: (data) => received.push({ client: 2, data }), readyState: 1 };
  broadcaster.addClient(fakeSocket1);
  broadcaster.addClient(fakeSocket2);

  const event = { type: 'file_alert', data: { filePath: '/tmp/test' } };
  broadcaster.broadcast(event);

  assert.equal(received.length, 2, 'Both clients should receive the event');
  const parsed1 = JSON.parse(received[0].data);
  assert.equal(parsed1.type, 'file_alert');
  assert.equal(parsed1.data.filePath, '/tmp/test');
});

test('broadcast: handles disconnected clients without throwing', () => {
  const broadcaster = createBroadcaster();
  // readyState !== 1 means not open
  const closedSocket = { send: () => { throw new Error('socket closed'); }, readyState: 3 };
  broadcaster.addClient(closedSocket);

  assert.doesNotThrow(() => {
    broadcaster.broadcast({ type: 'process', data: {} });
  });
});

test('broadcast: skips sending to closed sockets', () => {
  const broadcaster = createBroadcaster();
  let sentCount = 0;
  const openSocket = { send: () => sentCount++, readyState: 1 };
  const closedSocket = { send: () => sentCount++, readyState: 3 };
  broadcaster.addClient(openSocket);
  broadcaster.addClient(closedSocket);

  broadcaster.broadcast({ type: 'network', data: {} });
  assert.equal(sentCount, 1, 'Only open socket should receive message');
});

test('broadcast: with no clients does not throw', () => {
  const broadcaster = createBroadcaster();
  assert.doesNotThrow(() => {
    broadcaster.broadcast({ type: 'process', data: {} });
  });
});

test('createBroadcaster: broadcast returns object with broadcast function', () => {
  const broadcaster = createBroadcaster();
  assert.equal(typeof broadcaster.broadcast, 'function');
  assert.equal(typeof broadcaster.addClient, 'function');
  assert.equal(typeof broadcaster.removeClient, 'function');
});

// --- Cleanup ---
server.close();
rmSync(TEST_SETTINGS_DIR, { recursive: true, force: true });
delete process.env.ARGUS_SETTINGS_PATH;
delete process.env.ARGUS_SKIP_RESTART;
delete process.env.ARGUS_SKIP_DAEMON_UNINSTALL;
delete process.env.ARGUS_SKIP_DATA_DELETE;

export const results = { passed, failed };
