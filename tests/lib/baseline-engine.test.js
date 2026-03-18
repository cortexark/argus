/**
 * Tests for lib/baseline-engine.js — checkDeviations, updateBaselines, getBaselineSummary.
 */

import { initializeDatabase } from '../../src/db/schema.js';
import {
  checkDeviations,
  updateBaselines,
  getBaselineSummary,
} from '../../src/lib/baseline-engine.js';
import { upsertBaseline } from '../../src/db/queries.js';

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

async function asyncTest(name, fn) {
  try {
    await fn();
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

console.log('\n=== baseline-engine tests ===\n');

// ─── checkDeviations ──────────────────────────────────────────────────────────

test('checkDeviations: returns [] for app with no baseline data', () => {
  const db = initializeDatabase(':memory:');
  const result = checkDeviations(db, 'nonexistent-app');
  assert(Array.isArray(result), 'should return array');
  assertEqual(result.length, 0, 'should return empty array when no baselines');
  db.close();
});

test('checkDeviations: returns [] when sample_count < 168', () => {
  const db = initializeDatabase(':memory:');
  // Insert a connections_per_hour baseline with only 10 samples (< 168 required)
  upsertBaseline(db, {
    app_label: 'myapp',
    metric_type: 'connections_per_hour',
    metric_value: '5.0',
    sample_count: 10,
  });
  const result = checkDeviations(db, 'myapp');
  assert(Array.isArray(result), 'should return array');
  assertEqual(result.length, 0, 'should return empty array with insufficient samples');
  db.close();
});

test('checkDeviations: returns array type regardless of data', () => {
  const db = initializeDatabase(':memory:');
  const result = checkDeviations(db, 'some-app');
  assert(Array.isArray(result), 'checkDeviations should always return an array');
  db.close();
});

test('checkDeviations: deviation objects have type, description, severity fields when triggered', () => {
  const db = initializeDatabase(':memory:');
  // Insert baseline with enough samples and a very low avg to trigger spike
  upsertBaseline(db, {
    app_label: 'testapp',
    metric_type: 'connections_per_hour',
    metric_value: '1.0', // very low avg
    sample_count: 168, // meets threshold
  });

  // Insert many network events in last hour to simulate spike
  const recent = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min ago
  for (let i = 0; i < 10; i++) {
    db.prepare(`
      INSERT INTO network_events (pid, process_name, app_label, remote_host, port, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(100 + i, 'testapp', 'testapp', `endpoint${i}.example.com`, 443, recent);
  }

  const deviations = checkDeviations(db, 'testapp');
  assert(Array.isArray(deviations), 'should return array');
  if (deviations.length > 0) {
    assert('type' in deviations[0], 'deviation should have type');
    assert('description' in deviations[0], 'deviation should have description');
    assert('severity' in deviations[0], 'deviation should have severity');
  }
  db.close();
});

// ─── updateBaselines ─────────────────────────────────────────────────────────

await asyncTest('updateBaselines: runs without throwing on empty DB', async () => {
  const db = initializeDatabase(':memory:');
  try {
    await updateBaselines(db);
    // If we got here, no exception was thrown
    assert(true, 'should complete without error');
  } finally {
    db.close();
  }
});

await asyncTest('updateBaselines: runs without throwing when process_snapshots has data', async () => {
  const db = initializeDatabase(':memory:');
  const recent = new Date(Date.now() - 3_600_000).toISOString();
  db.prepare(`
    INSERT INTO process_snapshots (pid, name, app_label, category, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'ai-assistant', recent);

  try {
    await updateBaselines(db);
    assert(true, 'should complete without error');
  } finally {
    db.close();
  }
});

await asyncTest('updateBaselines: creates baseline entries for active apps', async () => {
  const db = initializeDatabase(':memory:');
  const recent = new Date(Date.now() - 3_600_000).toISOString();
  db.prepare(`
    INSERT INTO process_snapshots (pid, name, app_label, category, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'ai-assistant', recent);

  await updateBaselines(db);

  // After update, should have at least 1 baseline for 'claude'
  const rows = db.prepare('SELECT * FROM baselines WHERE app_label = ?').all('claude');
  assert(rows.length >= 1, 'should create at least one baseline entry for active app');
  db.close();
});

// ─── getBaselineSummary ───────────────────────────────────────────────────────

test('getBaselineSummary: returns correct shape', () => {
  const db = initializeDatabase(':memory:');
  const summary = getBaselineSummary(db, 'myapp');
  assert(summary !== null && typeof summary === 'object', 'should return object');
  assert('appLabel' in summary, 'should have appLabel');
  assert('endpoints' in summary, 'should have endpoints');
  assert('filePaths' in summary, 'should have filePaths');
  assert('avgConnectionsPerHour' in summary, 'should have avgConnectionsPerHour');
  assert('sampleCount' in summary, 'should have sampleCount');
  db.close();
});

test('getBaselineSummary: appLabel matches requested label', () => {
  const db = initializeDatabase(':memory:');
  const summary = getBaselineSummary(db, 'cursor');
  assertEqual(summary.appLabel, 'cursor', 'appLabel should match requested label');
  db.close();
});

test('getBaselineSummary: endpoints is an array', () => {
  const db = initializeDatabase(':memory:');
  const summary = getBaselineSummary(db, 'myapp');
  assert(Array.isArray(summary.endpoints), 'endpoints should be array');
  db.close();
});

test('getBaselineSummary: filePaths is an array', () => {
  const db = initializeDatabase(':memory:');
  const summary = getBaselineSummary(db, 'myapp');
  assert(Array.isArray(summary.filePaths), 'filePaths should be array');
  db.close();
});

test('getBaselineSummary: avgConnectionsPerHour is a number', () => {
  const db = initializeDatabase(':memory:');
  const summary = getBaselineSummary(db, 'myapp');
  assert(typeof summary.avgConnectionsPerHour === 'number', 'avgConnectionsPerHour should be a number');
  db.close();
});

test('getBaselineSummary: sampleCount is a number', () => {
  const db = initializeDatabase(':memory:');
  const summary = getBaselineSummary(db, 'myapp');
  assert(typeof summary.sampleCount === 'number', 'sampleCount should be a number');
  db.close();
});

test('getBaselineSummary: returns populated data for app with baselines', () => {
  const db = initializeDatabase(':memory:');
  upsertBaseline(db, {
    app_label: 'claude',
    metric_type: 'connections_per_hour',
    metric_value: '7.5',
    sample_count: 50,
  });
  upsertBaseline(db, {
    app_label: 'claude',
    metric_type: 'endpoint',
    metric_value: 'api.anthropic.com',
    sample_count: 30,
  });
  upsertBaseline(db, {
    app_label: 'claude',
    metric_type: 'file_path_prefix',
    metric_value: '/home/user',
    sample_count: 20,
  });

  const summary = getBaselineSummary(db, 'claude');
  assertEqual(summary.appLabel, 'claude');
  assertEqual(summary.sampleCount, 50, 'sampleCount from conn baseline');
  assert(summary.avgConnectionsPerHour > 0, 'avgConnectionsPerHour should be > 0');
  assert(summary.endpoints.includes('api.anthropic.com'), 'endpoints should include saved endpoint');
  assert(summary.filePaths.includes('/home/user'), 'filePaths should include saved prefix');
  db.close();
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
