/**
 * Tests for lib/digest.js — generateDigestData, formatDigestForSlack, sendSlackDigest.
 */

import { initializeDatabase } from '../../src/db/schema.js';
import {
  generateDigestData,
  formatDigestForSlack,
  sendSlackDigest,
} from '../../src/lib/digest.js';

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

console.log('\n=== digest tests ===\n');

// ─── Setup in-memory DB ────────────────────────────────────────────────────────

function createTestDb() {
  const db = initializeDatabase(':memory:');

  const now = new Date().toISOString();
  const recent = new Date(Date.now() - 3_600_000).toISOString(); // 1 hour ago

  // Insert file access events (with is_alert = 1)
  db.prepare(`
    INSERT INTO file_access_events (pid, process_name, app_label, file_path, access_type, sensitivity, is_alert, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', '/home/user/.ssh/id_rsa', 'read', 'credentials', 1, recent);

  db.prepare(`
    INSERT INTO file_access_events (pid, process_name, app_label, file_path, access_type, sensitivity, is_alert, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(101, 'claude', 'claude', '/home/user/docs/secret.txt', 'read', 'documents', 1, recent);

  // Insert network events
  db.prepare(`
    INSERT INTO network_events (pid, process_name, app_label, remote_host, port, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'api.anthropic.com', 443, recent);

  db.prepare(`
    INSERT INTO network_events (pid, process_name, app_label, remote_host, port, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'api.openai.com', 443, recent);

  // Insert process snapshot
  db.prepare(`
    INSERT INTO process_snapshots (pid, name, app_label, category, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(100, 'claude', 'claude', 'ai-assistant', recent);

  return db;
}

// ─── generateDigestData ────────────────────────────────────────────────────────

await asyncTest('generateDigestData: returns object with fileAlertCount', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assert('fileAlertCount' in data, 'should have fileAlertCount');
    assert(typeof data.fileAlertCount === 'number', 'fileAlertCount should be a number');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: returns object with networkEventCount', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assert('networkEventCount' in data, 'should have networkEventCount');
    assert(typeof data.networkEventCount === 'number', 'networkEventCount should be a number');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: returns object with processCount', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assert('processCount' in data, 'should have processCount');
    assert(typeof data.processCount === 'number', 'processCount should be a number');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: returns object with topFiles array', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assert('topFiles' in data, 'should have topFiles');
    assert(Array.isArray(data.topFiles), 'topFiles should be an array');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: returns object with topEndpoints array', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assert('topEndpoints' in data, 'should have topEndpoints');
    assert(Array.isArray(data.topEndpoints), 'topEndpoints should be an array');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: fileAlertCount matches inserted alert rows', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assertEqual(data.fileAlertCount, 2, 'should count 2 file alerts');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: networkEventCount matches inserted rows', async () => {
  const db = createTestDb();
  try {
    const data = await generateDigestData(db);
    assertEqual(data.networkEventCount, 2, 'should count 2 network events');
  } finally {
    db.close();
  }
});

await asyncTest('generateDigestData: empty DB returns zeros', async () => {
  const db = initializeDatabase(':memory:');
  try {
    const data = await generateDigestData(db);
    assertEqual(data.fileAlertCount, 0);
    assertEqual(data.networkEventCount, 0);
    assertEqual(data.processCount, 0);
  } finally {
    db.close();
  }
});

// ─── formatDigestForSlack ─────────────────────────────────────────────────────

const SAMPLE_DATA = {
  date: '2024-01-01',
  processCount: 3,
  fileAlertCount: 2,
  networkEventCount: 5,
  topFiles: [{ file_path: '/home/user/.ssh/id_rsa', access_count: 3 }],
  topEndpoints: [{ remote_host: 'api.anthropic.com', connection_count: 10 }],
  aiServices: ['Anthropic'],
};

test('formatDigestForSlack: returns object with blocks array', () => {
  const result = formatDigestForSlack(SAMPLE_DATA);
  assert(result !== null && typeof result === 'object', 'should return an object');
  assert('blocks' in result, 'should have blocks property');
  assert(Array.isArray(result.blocks), 'blocks should be an array');
});

test('formatDigestForSlack: blocks array is non-empty', () => {
  const result = formatDigestForSlack(SAMPLE_DATA);
  assert(result.blocks.length > 0, 'blocks should not be empty');
});

test('formatDigestForSlack: first block has type header', () => {
  const result = formatDigestForSlack(SAMPLE_DATA);
  assertEqual(result.blocks[0].type, 'header', 'first block should be header type');
});

test('formatDigestForSlack: header block contains date', () => {
  const result = formatDigestForSlack(SAMPLE_DATA);
  const headerText = result.blocks[0].text?.text ?? '';
  assert(headerText.includes('2024-01-01'), 'header should contain date');
});

test('formatDigestForSlack: includes process count in section', () => {
  const result = formatDigestForSlack(SAMPLE_DATA);
  const payload = JSON.stringify(result);
  assert(payload.includes('3'), 'payload should include processCount');
});

test('formatDigestForSlack: works with empty topFiles', () => {
  const data = { ...SAMPLE_DATA, topFiles: [], topEndpoints: [] };
  const result = formatDigestForSlack(data);
  assert(result.blocks.length > 0, 'should still produce blocks');
  const payload = JSON.stringify(result);
  assert(payload.includes('No file accesses'), 'should show empty state for topFiles');
});

// ─── sendSlackDigest ──────────────────────────────────────────────────────────

await asyncTest('sendSlackDigest: invalid URL returns { success: false }', async () => {
  const result = await sendSlackDigest('https://invalid.example.invalid/webhook', { blocks: [] });
  assertEqual(result.success, false, 'should fail for invalid/unreachable URL');
  assert('error' in result, 'should include error field');
});

await asyncTest('sendSlackDigest: non-https URL returns { success: false }', async () => {
  // The fetch will fail on a non-reachable URL
  const result = await sendSlackDigest('http://localhost:0/webhook', { blocks: [] });
  assertEqual(result.success, false, 'should fail for unreachable URL');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
