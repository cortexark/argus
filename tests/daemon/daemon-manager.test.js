/**
 * Tests for daemon-manager.js (cross-platform daemon orchestrator)
 * TDD RED phase — tests written before implementation
 */

import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // async test — handled below
      return result.then(() => {
        console.log(`  PASS: ${name}`);
        passed++;
      }).catch(err => {
        console.log(`  FAIL: ${name}`);
        console.log(`    ${err.message}`);
        failed++;
      });
    }
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
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

console.log('\n=== daemon-manager tests ===\n');

// Import the module under test
const { install, uninstall, start, stop, status, restart } = await import(
  '../../src/daemon/daemon-manager.js'
);

// --- Exports shape ---

test('exports install function', () => {
  assert.equal(typeof install, 'function');
});

test('exports uninstall function', () => {
  assert.equal(typeof uninstall, 'function');
});

test('exports start function', () => {
  assert.equal(typeof start, 'function');
});

test('exports stop function', () => {
  assert.equal(typeof stop, 'function');
});

test('exports status function', () => {
  assert.equal(typeof status, 'function');
});

test('exports restart function', () => {
  assert.equal(typeof restart, 'function');
});

// --- status returns correct shape ---

await testAsync('status returns object with success and running fields', async () => {
  const result = await status();
  assert.equal(typeof result, 'object');
  assert.ok(result !== null);
  // Must have success (boolean) and running (boolean)
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.running, 'boolean');
});

await testAsync('status returns message string', async () => {
  const result = await status();
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
});

// --- install returns correct shape ---

await testAsync('install returns object with success boolean and message string', async () => {
  const nodePath = process.execPath;
  const scriptPath = join(tmpdir(), 'test-cli.js');
  const logDir = tmpdir();
  const result = await install(nodePath, scriptPath, logDir);
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.message, 'string');
});

// --- uninstall returns correct shape ---

await testAsync('uninstall returns object with success boolean and message string', async () => {
  const result = await uninstall();
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.message, 'string');
});

// --- start/stop return correct shape ---

await testAsync('start returns object with success and message', async () => {
  const result = await start();
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.message, 'string');
});

await testAsync('stop returns object with success and message', async () => {
  const result = await stop();
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.message, 'string');
});

await testAsync('restart returns object with success and message', async () => {
  const result = await restart();
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.message, 'string');
});

// --- does not mutate input ---

await testAsync('install does not mutate passed arguments', async () => {
  const nodePath = process.execPath;
  const scriptPath = '/tmp/test.js';
  const logDir = tmpdir();
  const originalNodePath = nodePath;
  await install(nodePath, scriptPath, logDir);
  assert.equal(nodePath, originalNodePath);
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
