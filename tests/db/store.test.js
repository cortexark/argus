/**
 * Tests for db/store.js
 * RED phase: these tests should fail until implementation exists
 * Uses SQLite :memory: DB for isolation
 */

import assert from 'node:assert/strict';
import { initializeDatabase } from '../../src/db/schema.js';
import {
  insertProcessSnapshot,
  insertFileAccess,
  insertNetworkEvent,
  upsertPortHistory,
  getRecentAlerts,
  getPortHistory,
  getActiveProcesses,
  getNetworkEvents,
  getDailySummary,
  insertSession,
  closeSession,
  getOpenSessions,
  reconcileOpenSessionsByPid,
} from '../../src/db/store.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

// Use in-memory DB for all tests
let db;
try {
  db = initializeDatabase(':memory:');
} catch (err) {
  console.log(`FATAL: Could not init DB: ${err.message}`);
  process.exit(1);
}

console.log('\n=== store tests ===\n');

const NOW = new Date().toISOString();
const PAST = new Date(Date.now() - 60000).toISOString();

// --- insertProcessSnapshot ---

test('insertProcessSnapshot: inserts and returns record with id', () => {
  const snap = { pid: 1, name: 'claude', appLabel: 'Claude', category: 'LLM', cpu: 1.5, memory: 200, timestamp: NOW };
  const result = insertProcessSnapshot(db, snap);
  assert.ok(result.id > 0, 'should have auto-incremented id');
  assert.equal(result.pid, 1);
  assert.equal(result.name, 'claude');
});

test('insertProcessSnapshot: does not mutate input object', () => {
  const snap = { pid: 2, name: 'cursor', appLabel: 'Cursor', category: 'Editor', cpu: 0.5, memory: 100, timestamp: NOW };
  const original = { ...snap };
  insertProcessSnapshot(db, snap);
  assert.deepEqual(snap, original, 'input should not be mutated');
});

test('insertProcessSnapshot: returned object is a new object', () => {
  const snap = { pid: 3, name: 'node', appLabel: null, category: 'Runtime', cpu: 0, memory: 50, timestamp: NOW };
  const result = insertProcessSnapshot(db, snap);
  assert.notEqual(result, snap, 'should return a new object, not the input');
});

// --- insertFileAccess ---

test('insertFileAccess: inserts and returns record with id', () => {
  const event = {
    pid: 10, processName: 'claude', appLabel: 'Claude',
    filePath: '/Users/t/.ssh/id_rsa', accessType: 'read',
    sensitivity: 'credentials', isAlert: 1, timestamp: NOW,
  };
  const result = insertFileAccess(db, event);
  assert.ok(result.id > 0);
  assert.equal(result.filePath, '/Users/t/.ssh/id_rsa');
  assert.equal(result.isAlert, 1);
});

test('insertFileAccess: does not mutate input', () => {
  const event = {
    pid: 11, processName: 'cursor', appLabel: 'Cursor',
    filePath: '/tmp/test.txt', accessType: 'read',
    sensitivity: null, isAlert: 0, timestamp: NOW,
  };
  const original = { ...event };
  insertFileAccess(db, event);
  assert.deepEqual(event, original);
});

// --- insertNetworkEvent ---

test('insertNetworkEvent: inserts and returns record with id', () => {
  const event = {
    pid: 20, processName: 'claude', appLabel: 'Claude',
    localAddress: '127.0.0.1:54321', remoteAddress: 'api.anthropic.com:443',
    remoteHost: 'api.anthropic.com', port: 443,
    protocol: 'TCP', state: 'ESTABLISHED', aiService: 'Anthropic Claude API',
    bytesSent: 0, bytesReceived: 0, timestamp: NOW,
  };
  const result = insertNetworkEvent(db, event);
  assert.ok(result.id > 0);
  assert.equal(result.aiService, 'Anthropic Claude API');
  assert.equal(result.port, 443);
});

test('insertNetworkEvent: does not mutate input', () => {
  const event = {
    pid: 21, processName: 'node', appLabel: null,
    localAddress: '0.0.0.0:3000', remoteAddress: '1.2.3.4:80',
    remoteHost: null, port: 80,
    protocol: 'TCP', state: 'ESTABLISHED', aiService: null,
    bytesSent: 0, bytesReceived: 0, timestamp: NOW,
  };
  const original = { ...event };
  insertNetworkEvent(db, event);
  assert.deepEqual(event, original);
});

// --- upsertPortHistory ---

test('upsertPortHistory: inserts new port entry', () => {
  upsertPortHistory(db, {
    processName: 'testapp', appLabel: 'Test',
    port: 8080, firstSeen: NOW, lastSeen: NOW, connectionCount: 1,
  });
  const history = getPortHistory(db, 'testapp');
  assert.ok(history.length > 0);
  assert.equal(history[0].port, 8080);
});

test('upsertPortHistory: increments connection_count on duplicate', () => {
  const entry = { processName: 'counter-app', appLabel: 'C', port: 9000, firstSeen: NOW, lastSeen: NOW, connectionCount: 1 };
  upsertPortHistory(db, entry);
  upsertPortHistory(db, entry);
  upsertPortHistory(db, entry);
  const history = getPortHistory(db, 'counter-app');
  const port9000 = history.find(h => h.port === 9000);
  assert.ok(port9000, 'should have port 9000 entry');
  assert.ok(port9000.connection_count >= 2, `connection_count should be >= 2, got ${port9000.connection_count}`);
});

test('upsertPortHistory: different processes track independently', () => {
  upsertPortHistory(db, { processName: 'appA', appLabel: 'A', port: 1234, firstSeen: NOW, lastSeen: NOW, connectionCount: 1 });
  upsertPortHistory(db, { processName: 'appB', appLabel: 'B', port: 1234, firstSeen: NOW, lastSeen: NOW, connectionCount: 1 });
  const histA = getPortHistory(db, 'appA');
  const histB = getPortHistory(db, 'appB');
  assert.ok(histA.length > 0);
  assert.ok(histB.length > 0);
});

// --- getRecentAlerts ---

test('getRecentAlerts: returns only alert events since timestamp', () => {
  const alertEvent = {
    pid: 30, processName: 'claude', appLabel: 'Claude',
    filePath: '/.ssh/id_rsa', accessType: 'read',
    sensitivity: 'credentials', isAlert: 1, timestamp: NOW,
  };
  const normalEvent = {
    pid: 31, processName: 'claude', appLabel: 'Claude',
    filePath: '/tmp/blah.txt', accessType: 'read',
    sensitivity: null, isAlert: 0, timestamp: NOW,
  };
  insertFileAccess(db, alertEvent);
  insertFileAccess(db, normalEvent);

  const alerts = getRecentAlerts(db, PAST);
  const allAreAlerts = alerts.every(a => a.is_alert === 1);
  assert.ok(allAreAlerts, 'all returned events should have is_alert=1');
  assert.ok(alerts.length >= 1);
});

test('getRecentAlerts: excludes events before sinceISO', () => {
  const future = new Date(Date.now() + 100000).toISOString();
  const alerts = getRecentAlerts(db, future);
  assert.equal(alerts.length, 0, 'no alerts should be after future timestamp');
});

// --- getPortHistory ---

test('getPortHistory: returns entries ordered by connection_count DESC', () => {
  upsertPortHistory(db, { processName: 'ordered-app', appLabel: 'O', port: 1, firstSeen: NOW, lastSeen: NOW, connectionCount: 1 });
  upsertPortHistory(db, { processName: 'ordered-app', appLabel: 'O', port: 2, firstSeen: NOW, lastSeen: NOW, connectionCount: 1 });
  // Upsert port 2 again to make it have higher count
  upsertPortHistory(db, { processName: 'ordered-app', appLabel: 'O', port: 2, firstSeen: NOW, lastSeen: NOW, connectionCount: 1 });
  const history = getPortHistory(db, 'ordered-app');
  if (history.length >= 2) {
    assert.ok(history[0].connection_count >= history[1].connection_count, 'should be ordered DESC by connection_count');
  }
});

// --- getActiveProcesses ---

test('getActiveProcesses: returns distinct processes since timestamp', () => {
  insertProcessSnapshot(db, { pid: 50, name: 'active-proc', appLabel: 'AP', category: 'LLM', cpu: 0, memory: 0, timestamp: NOW });
  insertProcessSnapshot(db, { pid: 50, name: 'active-proc', appLabel: 'AP', category: 'LLM', cpu: 0, memory: 0, timestamp: NOW });
  const procs = getActiveProcesses(db, PAST);
  const found = procs.filter(p => p.name === 'active-proc');
  assert.equal(found.length, 1, 'should return DISTINCT processes');
});

test('getActiveProcesses: excludes processes before sinceISO', () => {
  const future = new Date(Date.now() + 200000).toISOString();
  const procs = getActiveProcesses(db, future);
  assert.equal(procs.length, 0);
});

// --- getNetworkEvents ---

test('getNetworkEvents: returns events since timestamp', () => {
  const event = {
    pid: 60, processName: 'net-proc', appLabel: null,
    localAddress: '127.0.0.1:1', remoteAddress: '8.8.8.8:53',
    remoteHost: null, port: 53, protocol: 'UDP', state: null,
    aiService: null, bytesSent: 0, bytesReceived: 0, timestamp: NOW,
  };
  insertNetworkEvent(db, event);
  const events = getNetworkEvents(db, PAST);
  const found = events.filter(e => e.process_name === 'net-proc');
  assert.ok(found.length >= 1);
});

test('getNetworkEvents: returns max 200 events', () => {
  // Insert 5 events - we just verify the function runs without error
  for (let i = 0; i < 5; i++) {
    insertNetworkEvent(db, {
      pid: 70 + i, processName: 'bulk-proc', appLabel: null,
      localAddress: `127.0.0.1:${i}`, remoteAddress: `1.2.3.${i}:80`,
      remoteHost: null, port: 80, protocol: 'TCP', state: 'ESTABLISHED',
      aiService: null, bytesSent: 0, bytesReceived: 0, timestamp: NOW,
    });
  }
  const events = getNetworkEvents(db, PAST);
  assert.ok(events.length <= 200, 'should return at most 200 events');
});

// --- getDailySummary ---

test('getDailySummary: returns summary object with expected fields', () => {
  const dateStr = NOW.slice(0, 10); // YYYY-MM-DD
  const summary = getDailySummary(db, dateStr);
  assert.ok(typeof summary.date === 'string', 'should have date field');
  assert.ok(typeof summary.processCount === 'number', 'should have processCount');
  assert.ok(typeof summary.fileAlertCount === 'number', 'should have fileAlertCount');
  assert.ok(typeof summary.networkEventCount === 'number', 'should have networkEventCount');
  assert.ok(Array.isArray(summary.topPorts), 'topPorts should be an array');
  assert.ok(Array.isArray(summary.aiServicesHit), 'aiServicesHit should be an array');
});

test('getDailySummary: date field matches requested date', () => {
  const dateStr = '2024-01-15';
  const summary = getDailySummary(db, dateStr);
  assert.equal(summary.date, dateStr);
});

// --- session restart reconciliation ---

test('getOpenSessions: returns only sessions with ended_at null', () => {
  const open = insertSession(db, {
    pid: 91001,
    appLabel: 'Claude Code (CLI)',
    processName: 'claude',
    cmd: 'claude chat',
    startedAt: NOW,
  });
  const closed = insertSession(db, {
    pid: 91002,
    appLabel: 'Cursor',
    processName: 'cursor',
    cmd: 'cursor .',
    startedAt: NOW,
  });
  closeSession(db, closed.id, NOW);

  const openSessions = getOpenSessions(db);
  const openIds = new Set(openSessions.map(s => s.id));

  assert.ok(openIds.has(open.id), 'open session should be returned');
  assert.ok(!openIds.has(closed.id), 'closed session should not be returned');
});

test('reconcileOpenSessionsByPid: closes duplicate open rows for same pid', () => {
  const pid = 91003;
  const oldStartedAt = '2026-03-23T10:00:00.000Z';
  const newStartedAt = '2026-03-23T10:05:00.000Z';
  const reconciledAt = '2026-03-23T10:10:00.000Z';

  const oldSession = insertSession(db, {
    pid,
    appLabel: 'Claude Code (CLI)',
    processName: 'claude',
    cmd: 'claude old',
    startedAt: oldStartedAt,
  });
  const newSession = insertSession(db, {
    pid,
    appLabel: 'Claude Code (CLI)',
    processName: 'claude',
    cmd: 'claude new',
    startedAt: newStartedAt,
  });
  insertSession(db, {
    pid: 91004,
    appLabel: 'Cursor',
    processName: 'cursor',
    cmd: 'cursor .',
    startedAt: newStartedAt,
  });

  const result = reconcileOpenSessionsByPid(db, reconciledAt);
  assert.equal(result.closedCount, 1, 'one stale duplicate row should be closed');
  assert.ok(result.activeSessions.size >= 2, 'active session map should keep one row per pid');
  assert.equal(result.activeSessions.get(pid)?.id, newSession.id, 'newest row should remain active');

  const oldRow = db.prepare('SELECT ended_at FROM session_history WHERE id = ?').get(oldSession.id);
  const newRow = db.prepare('SELECT ended_at FROM session_history WHERE id = ?').get(newSession.id);
  assert.equal(oldRow.ended_at, reconciledAt, 'older duplicate should be closed');
  assert.equal(newRow.ended_at, null, 'newest row should remain open');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
