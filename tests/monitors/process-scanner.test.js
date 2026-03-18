/**
 * Tests for monitors/process-scanner.js
 * RED phase: tests should fail until implementation exists
 * Mocks ps-list to control process list
 */

import assert from 'node:assert/strict';

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

console.log('\n=== process-scanner tests ===\n');

// We inject a mock ps-list via module mock pattern
// Since ESM doesn't support easy monkey-patching, we test the pure classifier logic
// by importing the internal helpers if exported, or testing via integration

import { scanProcesses, classifyProcess } from '../../src/monitors/process-scanner.js';

// Test classifyProcess helper (pure function, no external deps)

test('classifyProcess: identifies claude by exact name match', () => {
  const proc = { pid: 1, name: 'claude', cmd: '' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should detect claude');
  assert.equal(result.name, 'claude');
  assert.ok(result.appLabel.toLowerCase().includes('claude') || result.appLabel.toLowerCase().includes('anthropic'));
});

test('classifyProcess: identifies Claude (capital C) by name match', () => {
  const proc = { pid: 2, name: 'Claude', cmd: '' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should detect Claude');
});

test('classifyProcess: identifies cursor by name match', () => {
  const proc = { pid: 3, name: 'cursor', cmd: '' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should detect cursor');
});

test('classifyProcess: identifies node.js process with AI keyword in cmd', () => {
  const proc = { pid: 4, name: 'node', cmd: '/usr/local/bin/node /home/user/langchain/app.js' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should detect node + langchain keyword');
});

test('classifyProcess: identifies python process with AI keyword in cmd', () => {
  const proc = { pid: 5, name: 'python3', cmd: 'python3 openai_chat.py' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should detect python3 + openai keyword');
});

test('classifyProcess: returns null for unrelated process', () => {
  const proc = { pid: 6, name: 'Safari', cmd: '' };
  const result = classifyProcess(proc);
  assert.equal(result, null, 'Safari should not be detected');
});

test('classifyProcess: returns null for node without AI keywords', () => {
  const proc = { pid: 7, name: 'node', cmd: 'node ./server.js --port 3000' };
  const result = classifyProcess(proc);
  assert.equal(result, null, 'plain node server should not be detected');
});

test('classifyProcess: case-insensitive keyword matching for cmd', () => {
  const proc = { pid: 8, name: 'python', cmd: 'python OpenAI_test.py' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should match OpenAI case-insensitively in cmd');
});

test('classifyProcess: identifies ollama', () => {
  const proc = { pid: 9, name: 'ollama', cmd: '' };
  const result = classifyProcess(proc);
  assert.ok(result !== null, 'should detect ollama');
});

test('classifyProcess: returned object has required fields', () => {
  const proc = { pid: 10, name: 'claude', cmd: '' };
  const result = classifyProcess(proc);
  assert.ok(result !== null);
  assert.ok('pid' in result, 'should have pid');
  assert.ok('name' in result, 'should have name');
  assert.ok('appLabel' in result, 'should have appLabel');
  assert.ok('category' in result, 'should have category');
});

// scanProcesses integration (real ps-list, limited assertions)
await testAsync('scanProcesses: returns an array', async () => {
  const result = await scanProcesses();
  assert.ok(Array.isArray(result), 'should return an array');
});

await testAsync('scanProcesses: each item has pid, name, appLabel, category', async () => {
  const result = await scanProcesses();
  for (const item of result) {
    assert.ok('pid' in item, `item missing pid: ${JSON.stringify(item)}`);
    assert.ok('name' in item, `item missing name: ${JSON.stringify(item)}`);
    assert.ok('appLabel' in item, `item missing appLabel: ${JSON.stringify(item)}`);
    assert.ok('category' in item, `item missing category: ${JSON.stringify(item)}`);
  }
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
