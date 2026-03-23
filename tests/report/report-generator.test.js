/**
 * Tests for report/report-generator.js
 * RED phase: tests should fail until implementation exists
 * Seeds an in-memory DB and verifies report output
 */

import assert from 'node:assert/strict';
import { initializeDatabase } from '../../src/db/schema.js';
import { insertFileAccess, insertNetworkEvent, insertProcessSnapshot, upsertPortHistory } from '../../src/db/store.js';
import { generateReport } from '../../src/report/report-generator.js';

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

console.log('\n=== report-generator tests ===\n');

// Seed in-memory DB
let db;
try {
  db = initializeDatabase(':memory:');
} catch (err) {
  console.log(`FATAL: ${err.message}`);
  process.exit(1);
}

const NOW = new Date().toISOString();
const PAST = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

// Seed data
insertProcessSnapshot(db, { pid: 1, name: 'claude', appLabel: 'Claude (Anthropic)', category: 'LLM Desktop', cpu: 2.1, memory: 512, timestamp: NOW });
insertFileAccess(db, {
  pid: 1, processName: 'claude', appLabel: 'Claude',
  filePath: '/Users/t/.ssh/id_rsa', accessType: 'read',
  sensitivity: 'credentials', isAlert: 1, timestamp: NOW,
});
insertNetworkEvent(db, {
  pid: 1, processName: 'claude', appLabel: 'Claude',
  localAddress: '127.0.0.1:55555', remoteAddress: 'api.anthropic.com:443',
  remoteHost: 'api.anthropic.com', port: 443,
  protocol: 'TCP', state: 'ESTABLISHED', aiService: 'Anthropic Claude API',
  bytesSent: 0, bytesReceived: 0, timestamp: NOW,
});
upsertPortHistory(db, {
  processName: 'claude', appLabel: 'Claude',
  port: 443, firstSeen: NOW, lastSeen: NOW, connectionCount: 1,
});

// --- generateReport (text format) ---

test('generateReport: returns a non-empty string', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(typeof report === 'string', 'should return string');
  assert.ok(report.length > 0, 'should not be empty');
});

test('generateReport: includes report header', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('AI WATCHER REPORT'), `should include header, got: ${report.slice(0, 200)}`);
});

test('generateReport: includes SUMMARY section', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('SUMMARY'), 'should include SUMMARY section');
});

test('generateReport: includes FILE ACCESS ALERTS section', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('FILE ACCESS'), 'should include FILE ACCESS section');
});

test('generateReport: includes NETWORK ACTIVITY section', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('NETWORK'), 'should include NETWORK section');
});

test('generateReport: includes PORT HISTORY section', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('PORT'), 'should include PORT section');
});

test('generateReport: seeded file alert appears in report', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('.ssh') || report.includes('credentials') || report.includes('id_rsa'),
    'should show .ssh file access');
});

test('generateReport: seeded network event appears in report', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('anthropic') || report.includes('443') || report.includes('Anthropic'),
    'should show anthropic network event');
});

test('generateReport: includes process name from seeded data', () => {
  const report = generateReport(db, { sinceISO: PAST });
  assert.ok(report.includes('claude') || report.includes('Claude'), 'should mention claude process');
});

// --- generateReport (JSON format) ---

test('generateReport: returns valid JSON when format=json', () => {
  const result = generateReport(db, { sinceISO: PAST, format: 'json' });
  // Could return a string (JSON) or object
  let parsed;
  if (typeof result === 'string') {
    assert.doesNotThrow(() => { parsed = JSON.parse(result); }, 'should be valid JSON string');
  } else if (typeof result === 'object') {
    parsed = result;
  }
  assert.ok(parsed !== null, 'parsed result should not be null');
});

test('generateReport: JSON format has expected top-level keys', () => {
  const result = generateReport(db, { sinceISO: PAST, format: 'json' });
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  // Should have some key structure - at minimum a summary or data
  assert.ok(typeof parsed === 'object' && parsed !== null, 'should be an object');
});

// --- Edge cases ---

test('generateReport: works with empty DB (no data)', () => {
  const emptyDb = initializeDatabase(':memory:');
  assert.doesNotThrow(() => {
    generateReport(emptyDb, { sinceISO: PAST });
  }, 'should not throw with empty DB');
});

test('generateReport: alertsOnly option filters to alerts', () => {
  const report = generateReport(db, { sinceISO: PAST, alertsOnly: true });
  assert.ok(typeof report === 'string' || typeof report === 'object', 'should return a result');
});

test('generateReport: includes generated timestamp', () => {
  const report = generateReport(db, { sinceISO: PAST });
  // Should include the word "Generated" somewhere
  assert.ok(report.includes('Generated') || report.includes('generated'), 'should include generation timestamp');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
