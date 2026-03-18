/**
 * Tests for lib/duration.js — parseDuration utility.
 */

import { parseDuration } from '../../src/lib/duration.js';

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

console.log('\n=== duration tests ===\n');

test("parseDuration: '1h' → 3600000", () => {
  assertEqual(parseDuration('1h'), 3_600_000);
});

test("parseDuration: '30m' → 1800000", () => {
  assertEqual(parseDuration('30m'), 1_800_000);
});

test("parseDuration: '7d' → 604800000", () => {
  assertEqual(parseDuration('7d'), 604_800_000);
});

test("parseDuration: '45s' → 45000", () => {
  assertEqual(parseDuration('45s'), 45_000);
});

test("parseDuration: '24h' → 86400000", () => {
  assertEqual(parseDuration('24h'), 86_400_000);
});

test("parseDuration: invalid string → default 86400000", () => {
  assertEqual(parseDuration('notvalid'), 86_400_000);
});

test("parseDuration: empty string → default 86400000", () => {
  assertEqual(parseDuration(''), 86_400_000);
});

test("parseDuration: null → default 86400000", () => {
  assertEqual(parseDuration(null), 86_400_000);
});

test("parseDuration: undefined → default 86400000", () => {
  assertEqual(parseDuration(undefined), 86_400_000);
});

test("parseDuration: '2d' → 172800000", () => {
  assertEqual(parseDuration('2d'), 2 * 86_400_000);
});

test("parseDuration: '60m' → 3600000", () => {
  assertEqual(parseDuration('60m'), 3_600_000);
});

test("parseDuration: returns a number", () => {
  assert(typeof parseDuration('1h') === 'number', 'should return number');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
