/**
 * Tests for src/monitors/canary-monitor.js
 * TDD: Canary/honeypot file system for detecting AI agent scanning.
 */

import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  isCanaryFile,
  getCanaryPaths,
  CANARY_FILES,
} from '../../src/monitors/canary-monitor.js';

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

console.log('\n--- Canary Monitor Tests ---');

// ==========================================
// CANARY_FILES constant
// ==========================================

test('CANARY_FILES has at least 3 entries', () => {
  assert.ok(CANARY_FILES.length >= 3, `only ${CANARY_FILES.length} canary files defined`);
});

test('each canary file has path, content, and description', () => {
  for (const canary of CANARY_FILES) {
    assert.ok(canary.path, 'missing path');
    assert.ok(canary.content, 'missing content');
    assert.ok(canary.description, 'missing description');
  }
});

test('canary files are in ~/.argus/canary/ directory', () => {
  const home = homedir();
  const canaryDir = join(home, '.argus', 'canary');
  for (const canary of CANARY_FILES) {
    assert.ok(canary.path.startsWith(canaryDir), `${canary.path} not in canary dir`);
  }
});

test('canary content generators produce non-empty strings', () => {
  for (const canary of CANARY_FILES) {
    const content = typeof canary.content === 'function' ? canary.content() : canary.content;
    assert.ok(content.length > 50, `canary content too short: ${content.length} chars`);
  }
});

test('canary content includes ARGUS or canary marker', () => {
  for (const canary of CANARY_FILES) {
    const content = typeof canary.content === 'function' ? canary.content() : canary.content;
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('argus') || lower.includes('canary') || lower.includes('honeypot'),
      `canary content should contain identifier: ${canary.path}`,
    );
  }
});

test('canary content generates unique values on each call', () => {
  for (const canary of CANARY_FILES) {
    if (typeof canary.content === 'function') {
      const a = canary.content();
      const b = canary.content();
      assert.notEqual(a, b, `canary content should be randomized: ${canary.path}`);
    }
  }
});

// ==========================================
// isCanaryFile
// ==========================================

test('isCanaryFile: detects canary paths', () => {
  const home = homedir();
  assert.ok(isCanaryFile(join(home, '.argus', 'canary', 'id_rsa')));
  assert.ok(isCanaryFile(join(home, '.argus', 'canary', '.env.production')));
  assert.ok(isCanaryFile(join(home, '.argus', 'canary', 'credentials.json')));
});

test('isCanaryFile: rejects non-canary paths', () => {
  const home = homedir();
  assert.ok(!isCanaryFile(join(home, '.ssh', 'id_rsa')));
  assert.ok(!isCanaryFile('/tmp/test.txt'));
  assert.ok(!isCanaryFile(join(home, '.argus', 'data.db')));
});

test('isCanaryFile: handles null/empty', () => {
  assert.ok(!isCanaryFile(null));
  assert.ok(!isCanaryFile(''));
  assert.ok(!isCanaryFile(undefined));
});

// ==========================================
// getCanaryPaths
// ==========================================

test('getCanaryPaths: returns array of strings', () => {
  const paths = getCanaryPaths();
  assert.ok(Array.isArray(paths));
  assert.ok(paths.length >= 3);
  for (const p of paths) {
    assert.equal(typeof p, 'string');
  }
});

test('getCanaryPaths: all paths match CANARY_FILES', () => {
  const paths = getCanaryPaths();
  for (let i = 0; i < CANARY_FILES.length; i++) {
    assert.equal(paths[i], CANARY_FILES[i].path);
  }
});

// ==========================================
// CANARY_FILES is frozen (immutable)
// ==========================================

test('CANARY_FILES is frozen (cannot be modified)', () => {
  assert.ok(Object.isFrozen(CANARY_FILES), 'CANARY_FILES should be frozen');
});

export const results = { passed, failed };
