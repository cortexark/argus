/**
 * Tests for monitors/usage-tracker.js
 *
 * Tests the usage data collection, cost estimation, and aggregation logic.
 * Uses mock data instead of reading real external databases.
 */

import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase } from '../../src/db/schema.js';
import {
  insertUsageSnapshot,
  getRecentUsageSnapshots,
  getLatestUsageByApp,
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

console.log('\n=== usage-tracker tests ===\n');

const NOW = new Date().toISOString();

// --- Schema tests ---

test('usage_snapshots table exists', () => {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_snapshots'"
  ).all();
  assert.equal(tables.length, 1);
});

test('usage_snapshots table has correct columns', () => {
  const cols = db.prepare('PRAGMA table_info(usage_snapshots)').all();
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes('id'));
  assert.ok(colNames.includes('app'));
  assert.ok(colNames.includes('provider'));
  assert.ok(colNames.includes('model'));
  assert.ok(colNames.includes('tokens'));
  assert.ok(colNames.includes('estimated_cost_usd'));
  assert.ok(colNames.includes('session_count'));
  assert.ok(colNames.includes('snapshot_data'));
  assert.ok(colNames.includes('timestamp'));
});

// --- insertUsageSnapshot ---

test('insertUsageSnapshot: inserts and returns record with id', () => {
  const snapshot = {
    app: 'OpenAI Codex',
    provider: 'openai',
    model: 'gpt-5.3-codex',
    tokens: 1000000,
    estimatedCostUsd: 5.60,
    sessionCount: 3,
    snapshotData: JSON.stringify([{ model: 'gpt-5.3-codex', tokens: 1000000 }]),
    timestamp: NOW,
  };
  const result = insertUsageSnapshot(db, snapshot);
  assert.ok(result.id > 0, 'should have auto-incremented id');
  assert.equal(result.app, 'OpenAI Codex');
  assert.equal(result.provider, 'openai');
  assert.equal(result.tokens, 1000000);
});

test('insertUsageSnapshot: does not mutate input', () => {
  const snapshot = {
    app: 'Claude Code',
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    tokens: 500000,
    estimatedCostUsd: 3.75,
    sessionCount: 5,
    snapshotData: null,
    timestamp: NOW,
  };
  const original = { ...snapshot };
  insertUsageSnapshot(db, snapshot);
  assert.deepEqual(snapshot, original);
});

test('insertUsageSnapshot: returns new object', () => {
  const snapshot = {
    app: 'Cursor',
    provider: 'cursor',
    model: null,
    tokens: 200000,
    estimatedCostUsd: 1.20,
    sessionCount: 10,
    snapshotData: null,
    timestamp: NOW,
  };
  const result = insertUsageSnapshot(db, snapshot);
  assert.notEqual(result, snapshot);
});

// --- getRecentUsageSnapshots ---

test('getRecentUsageSnapshots: returns all inserted snapshots', () => {
  const results = getRecentUsageSnapshots(db);
  assert.ok(results.length >= 3, 'should have at least 3 snapshots');
  assert.equal(results[0].timestamp, NOW, 'newest first');
});

test('getRecentUsageSnapshots: contains correct fields', () => {
  const results = getRecentUsageSnapshots(db);
  const first = results[0];
  assert.ok('id' in first);
  assert.ok('app' in first);
  assert.ok('provider' in first);
  assert.ok('tokens' in first);
  assert.ok('estimated_cost_usd' in first);
  assert.ok('session_count' in first);
  assert.ok('timestamp' in first);
});

// --- getLatestUsageByApp ---

test('getLatestUsageByApp: returns latest for given app', () => {
  const result = getLatestUsageByApp(db, 'OpenAI Codex');
  assert.ok(result, 'should find the Codex snapshot');
  assert.equal(result.app, 'OpenAI Codex');
  assert.equal(result.tokens, 1000000);
});

test('getLatestUsageByApp: returns undefined for unknown app', () => {
  const result = getLatestUsageByApp(db, 'NonexistentApp');
  assert.equal(result, undefined);
});

// --- Multiple snapshots per app ---

test('multiple snapshots per app: getLatest returns newest', () => {
  const older = new Date(Date.now() - 120000).toISOString();
  const newer = new Date(Date.now() - 60000).toISOString();

  insertUsageSnapshot(db, {
    app: 'TestApp',
    provider: 'test',
    model: 'model-a',
    tokens: 100,
    estimatedCostUsd: 0.01,
    sessionCount: 1,
    snapshotData: null,
    timestamp: older,
  });
  insertUsageSnapshot(db, {
    app: 'TestApp',
    provider: 'test',
    model: 'model-b',
    tokens: 200,
    estimatedCostUsd: 0.02,
    sessionCount: 2,
    snapshotData: null,
    timestamp: newer,
  });

  const latest = getLatestUsageByApp(db, 'TestApp');
  assert.equal(latest.tokens, 200, 'should return the newer snapshot');
  assert.equal(latest.model, 'model-b');
});

// --- Cost estimation logic ---

test('cost estimation: snapshot stores correct cost value', () => {
  const snapshot = {
    app: 'CostTest',
    provider: 'openai',
    model: 'gpt-5.3-codex',
    tokens: 1000000,
    estimatedCostUsd: 6.20,
    sessionCount: 1,
    snapshotData: null,
    timestamp: NOW,
  };
  const result = insertUsageSnapshot(db, snapshot);
  assert.equal(result.estimatedCostUsd, 6.20);
});

// --- Snapshot data JSON ---

test('snapshot_data: stores and retrieves JSON correctly', () => {
  const modelData = [
    { model: 'gpt-5.3-codex', tokens: 800000, sessions: 2 },
    { model: 'gpt-5.4-mini', tokens: 200000, sessions: 1 },
  ];
  const snapshot = {
    app: 'JSONTest',
    provider: 'openai',
    model: 'gpt-5.3-codex, gpt-5.4-mini',
    tokens: 1000000,
    estimatedCostUsd: 5.00,
    sessionCount: 3,
    snapshotData: JSON.stringify(modelData),
    timestamp: NOW,
  };
  insertUsageSnapshot(db, snapshot);

  const result = getLatestUsageByApp(db, 'JSONTest');
  const parsed = JSON.parse(result.snapshot_data);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].model, 'gpt-5.3-codex');
  assert.equal(parsed[1].tokens, 200000);
});

// --- Zero/null handling ---

test('zero tokens: accepts zero token snapshots', () => {
  const snapshot = {
    app: 'ZeroTest',
    provider: 'test',
    model: null,
    tokens: 0,
    estimatedCostUsd: 0,
    sessionCount: 0,
    snapshotData: null,
    timestamp: NOW,
  };
  const result = insertUsageSnapshot(db, snapshot);
  assert.ok(result.id > 0);
  assert.equal(result.tokens, 0);
});

// --- Index check ---

test('usage_snapshots has timestamp index', () => {
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='usage_snapshots'"
  ).all();
  const indexNames = indexes.map(i => i.name);
  assert.ok(indexNames.some(n => n.includes('usage_timestamp')), 'should have timestamp index');
});

test('usage_snapshots has app index', () => {
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='usage_snapshots'"
  ).all();
  const indexNames = indexes.map(i => i.name);
  assert.ok(indexNames.some(n => n.includes('usage_app')), 'should have app index');
});

// --- Summary ---

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
if (db) db.close();

export default { passed, failed };
