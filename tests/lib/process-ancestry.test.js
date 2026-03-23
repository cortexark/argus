/**
 * Tests for lib/process-ancestry.js — process ancestry chain tracking.
 */

import {
  getProcessAncestry,
  formatAncestryChain,
  clearAncestryCache,
  MAX_DEPTH,
} from '../../src/lib/process-ancestry.js';

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

async function testAsync(name, fn) {
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

console.log('\n=== process-ancestry tests ===\n');

// --- formatAncestryChain tests ---

test('formatAncestryChain: formats single process', () => {
  const chain = [{ pid: 1, name: 'launchd', cmd: '/sbin/launchd' }];
  assertEqual(formatAncestryChain(chain), 'launchd');
});

test('formatAncestryChain: formats multi-process chain in reverse (root → target)', () => {
  const chain = [
    { pid: 400, name: 'Claude Code', cmd: 'claude' },
    { pid: 300, name: 'node', cmd: '/usr/bin/node index.js' },
    { pid: 200, name: 'npm', cmd: 'npm start' },
    { pid: 100, name: 'zsh', cmd: '/bin/zsh' },
  ];
  assertEqual(
    formatAncestryChain(chain),
    'zsh \u2192 npm \u2192 node \u2192 Claude Code',
  );
});

test('formatAncestryChain: returns empty string for empty array', () => {
  assertEqual(formatAncestryChain([]), '');
});

test('formatAncestryChain: returns empty string for non-array', () => {
  assertEqual(formatAncestryChain(null), '');
  assertEqual(formatAncestryChain(undefined), '');
});

// --- getProcessAncestry tests ---

await testAsync('getProcessAncestry: returns an array for current process PID', async () => {
  clearAncestryCache();
  const result = await getProcessAncestry(process.pid);
  assert(Array.isArray(result), 'result should be an array');
  assert(result.length > 0, 'should have at least one entry for current process');
  assert(typeof result[0].pid === 'number', 'entry should have numeric pid');
  assert(typeof result[0].name === 'string', 'entry should have string name');
  assert(typeof result[0].cmd === 'string', 'entry should have string cmd');
});

await testAsync('getProcessAncestry: handles invalid PID gracefully (negative)', async () => {
  clearAncestryCache();
  const result = await getProcessAncestry(-1);
  assert(Array.isArray(result), 'should return array');
  assertEqual(result.length, 0, 'should return empty array for invalid PID');
});

await testAsync('getProcessAncestry: handles invalid PID gracefully (NaN)', async () => {
  clearAncestryCache();
  const result = await getProcessAncestry(NaN);
  assert(Array.isArray(result), 'should return array');
  assertEqual(result.length, 0, 'should return empty array for NaN PID');
});

await testAsync('getProcessAncestry: handles non-existent PID gracefully', async () => {
  clearAncestryCache();
  const result = await getProcessAncestry(9999999);
  assert(Array.isArray(result), 'should return array');
  assertEqual(result.length, 0, 'should return empty array for non-existent PID');
});

// --- Depth cap test ---

test('MAX_DEPTH: is capped at 10', () => {
  assertEqual(MAX_DEPTH, 10, 'MAX_DEPTH should be 10');
});

// --- Cache behavior tests ---

await testAsync('getProcessAncestry: returns cached result on second call', async () => {
  clearAncestryCache();
  const first = await getProcessAncestry(process.pid);
  const second = await getProcessAncestry(process.pid);
  // Both should be the same reference (cached)
  assert(first === second, 'second call should return cached (same reference) result');
});

await testAsync('getProcessAncestry: clearAncestryCache invalidates cache', async () => {
  const first = await getProcessAncestry(process.pid);
  clearAncestryCache();
  const second = await getProcessAncestry(process.pid);
  assert(first !== second, 'after cache clear, should return a new array reference');
  assertEqual(first.length, second.length, 'results should have same length');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
