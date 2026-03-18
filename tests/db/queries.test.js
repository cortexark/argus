/**
 * Tests for db/queries.js — all query functions with in-memory DB.
 */

import { initializeDatabase } from '../../src/db/schema.js';
import {
  getFileAccessHeatmap,
  getCorrelationTimeline,
  getEventsForExport,
  upsertNotificationConfig,
  getNotificationConfig,
  upsertBaseline,
  getBaselines,
  getAllEvents24h,
} from '../../src/db/queries.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log('\n=== queries tests ===\n');

// ─── Helpers ───────────────────────────────────────────────────────────────────

function seedDb(db) {
  const recent = new Date(Date.now() - 3_600_000).toISOString(); // 1 hour ago
  const old = new Date(Date.now() - 48 * 3_600_000).toISOString(); // 2 days ago

  db.prepare(`
    INSERT INTO file_access_events (pid, process_name, app_label, file_path, access_type, sensitivity, is_alert, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', '/home/user/.ssh/id_rsa', 'read', 'credentials', 1, recent);

  db.prepare(`
    INSERT INTO file_access_events (pid, process_name, app_label, file_path, access_type, sensitivity, is_alert, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(101, 'claude', 'claude', '/home/user/.ssh/id_rsa', 'read', 'credentials', 1, recent);

  db.prepare(`
    INSERT INTO file_access_events (pid, process_name, app_label, file_path, access_type, sensitivity, is_alert, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(102, 'cursor', 'cursor', '/home/user/docs/secret.txt', 'read', 'documents', 0, old);

  db.prepare(`
    INSERT INTO network_events (pid, process_name, app_label, remote_host, port, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'api.anthropic.com', 443, recent);

  db.prepare(`
    INSERT INTO process_snapshots (pid, name, app_label, category, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'ai-assistant', recent);

  return { recent, old };
}

// ─── getFileAccessHeatmap ──────────────────────────────────────────────────────

test('getFileAccessHeatmap: returns [] when no data', () => {
  const db = initializeDatabase(':memory:');
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const result = getFileAccessHeatmap(db, since);
  assert(Array.isArray(result), 'should return array');
  assertEqual(result.length, 0, 'should be empty for fresh DB');
  db.close();
});

test('getFileAccessHeatmap: returns results with access_count when data exists', () => {
  const db = initializeDatabase(':memory:');
  seedDb(db);
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString(); // 2 hours ago
  const result = getFileAccessHeatmap(db, since);
  assert(Array.isArray(result), 'should return array');
  assert(result.length > 0, 'should have results');
  assert('access_count' in result[0], 'should have access_count field');
  assert('file_path' in result[0], 'should have file_path field');
  db.close();
});

test('getFileAccessHeatmap: results are sorted descending by access_count', () => {
  const db = initializeDatabase(':memory:');
  seedDb(db);
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const result = getFileAccessHeatmap(db, since);
  // id_rsa was inserted twice, so it should have higher count
  if (result.length >= 2) {
    assert(result[0].access_count >= result[1].access_count, 'should be sorted descending');
  }
  db.close();
});

// ─── getCorrelationTimeline ───────────────────────────────────────────────────

test('getCorrelationTimeline: returns events from all 3 tables merged', () => {
  const db = initializeDatabase(':memory:');
  const { recent } = seedDb(db);
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const until = new Date().toISOString();
  const result = getCorrelationTimeline(db, since, until);
  assert(Array.isArray(result), 'should return array');
  // Should include FILE events and NET events and PROC events from seedDb
  const types = new Set(result.map((e) => e.event_type));
  assert(types.has('FILE'), 'should include FILE events');
  assert(types.has('NET'), 'should include NET events');
  assert(types.has('PROC'), 'should include PROC events');
  db.close();
});

test('getCorrelationTimeline: with appLabel filter returns only matching events', () => {
  const db = initializeDatabase(':memory:');
  seedDb(db);
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const until = new Date().toISOString();
  const result = getCorrelationTimeline(db, since, until, 'claude');
  for (const event of result) {
    assertEqual(event.app_label, 'claude', 'all events should belong to claude');
  }
  db.close();
});

test('getCorrelationTimeline: events are ordered by timestamp ascending', () => {
  const db = initializeDatabase(':memory:');
  seedDb(db);
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const until = new Date().toISOString();
  const result = getCorrelationTimeline(db, since, until);
  for (let i = 1; i < result.length; i++) {
    assert(
      result[i].timestamp >= result[i - 1].timestamp,
      `event at index ${i} should not be before index ${i - 1}`
    );
  }
  db.close();
});

// ─── getEventsForExport ───────────────────────────────────────────────────────

test('getEventsForExport: returns events in date range', () => {
  const db = initializeDatabase(':memory:');
  const { recent } = seedDb(db);
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const until = new Date().toISOString();
  const result = getEventsForExport(db, since, until);
  assert(Array.isArray(result), 'should return array');
  assert(result.length > 0, 'should return events in range');
  db.close();
});

test('getEventsForExport: excludes events outside date range', () => {
  const db = initializeDatabase(':memory:');
  seedDb(db);
  // Narrow window: last 30 minutes only
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const until = new Date().toISOString();
  const result = getEventsForExport(db, since, until);
  // The 'old' event (2 days ago) should not be included
  for (const event of result) {
    assert(
      event.timestamp >= since,
      `event timestamp ${event.timestamp} should be >= since ${since}`
    );
  }
  db.close();
});

// ─── upsertNotificationConfig / getNotificationConfig round-trip ──────────────

test('upsertNotificationConfig / getNotificationConfig: round-trip slack', () => {
  const db = initializeDatabase(':memory:');
  upsertNotificationConfig(db, 'slack', 'https://hooks.slack.com/test');
  const result = getNotificationConfig(db, 'slack');
  assert(result !== undefined && result !== null, 'should return saved config');
  assertEqual(result.channel, 'slack');
  assertEqual(result.target, 'https://hooks.slack.com/test');
  db.close();
});

test('upsertNotificationConfig: updates target on second upsert', () => {
  const db = initializeDatabase(':memory:');
  upsertNotificationConfig(db, 'email', 'first@example.com');
  upsertNotificationConfig(db, 'email', 'updated@example.com');
  const result = getNotificationConfig(db, 'email');
  assertEqual(result.target, 'updated@example.com', 'should have updated target');
  db.close();
});

test('getNotificationConfig: returns undefined for missing channel', () => {
  const db = initializeDatabase(':memory:');
  const result = getNotificationConfig(db, 'nonexistent');
  assert(result === undefined || result === null, 'should return undefined/null for missing channel');
  db.close();
});

// ─── upsertBaseline / getBaselines round-trip ─────────────────────────────────

test('upsertBaseline / getBaselines: round-trip', () => {
  const db = initializeDatabase(':memory:');
  upsertBaseline(db, {
    app_label: 'myapp',
    metric_type: 'connections_per_hour',
    metric_value: '5.5',
    sample_count: 10,
  });
  const results = getBaselines(db, 'myapp');
  assert(Array.isArray(results), 'should return array');
  assertEqual(results.length, 1, 'should have 1 baseline entry');
  assertEqual(results[0].app_label, 'myapp');
  assertEqual(results[0].metric_type, 'connections_per_hour');
  assertEqual(results[0].metric_value, '5.5');
  db.close();
});

test('getBaselines: returns [] for unknown app', () => {
  const db = initializeDatabase(':memory:');
  const results = getBaselines(db, 'nonexistent-app');
  assert(Array.isArray(results), 'should return array');
  assertEqual(results.length, 0, 'should be empty for unknown app');
  db.close();
});

test('upsertBaseline: updates sample_count on conflict', () => {
  const db = initializeDatabase(':memory:');
  upsertBaseline(db, {
    app_label: 'myapp',
    metric_type: 'connections_per_hour',
    metric_value: '3.0',
    sample_count: 5,
  });
  upsertBaseline(db, {
    app_label: 'myapp',
    metric_type: 'connections_per_hour',
    metric_value: '3.0',
    sample_count: 10,
  });
  const results = getBaselines(db, 'myapp');
  assertEqual(results.length, 1, 'should still have 1 entry (upsert not insert)');
  assertEqual(results[0].sample_count, 10, 'sample_count should be updated');
  db.close();
});

// ─── getAllEvents24h ───────────────────────────────────────────────────────────

test('getAllEvents24h: returns correct shape', () => {
  const db = initializeDatabase(':memory:');
  const result = getAllEvents24h(db);
  assert('fileAlerts' in result, 'should have fileAlerts');
  assert('networkEvents' in result, 'should have networkEvents');
  assert('processCount' in result, 'should have processCount');
  assert('topFiles' in result, 'should have topFiles');
  assert('topEndpoints' in result, 'should have topEndpoints');
  assert(Array.isArray(result.fileAlerts), 'fileAlerts should be array');
  assert(Array.isArray(result.networkEvents), 'networkEvents should be array');
  assert(typeof result.processCount === 'number', 'processCount should be number');
  db.close();
});

test('getAllEvents24h: counts seeded alert events correctly', () => {
  const db = initializeDatabase(':memory:');
  seedDb(db);
  const result = getAllEvents24h(db);
  assertEqual(result.fileAlerts.length, 2, 'should count 2 alert events from seed');
  assertEqual(result.networkEvents.length, 1, 'should count 1 network event from seed');
  db.close();
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
