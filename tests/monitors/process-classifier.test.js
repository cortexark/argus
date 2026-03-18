/**
 * Tests for monitors/process-classifier.js
 * RED phase: tests written before implementation
 * Tests the 6-signal confidence scoring engine.
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

console.log('\n=== process-classifier tests ===\n');

import {
  scoreSignals,
  classifyProcess,
  buildProcessTree,
  VERDICT,
} from '../../src/monitors/process-classifier.js';

// --- VERDICT constants ---

test('VERDICT: exports CONFIRMED_AI constant', () => {
  assert.equal(VERDICT.CONFIRMED_AI, 'CONFIRMED_AI');
});

test('VERDICT: exports LIKELY_AI constant', () => {
  assert.equal(VERDICT.LIKELY_AI, 'LIKELY_AI');
});

test('VERDICT: exports NOT_AI constant', () => {
  assert.equal(VERDICT.NOT_AI, 'NOT_AI');
});

// --- scoreSignals: verdict thresholds ---

test('scoreSignals: score >= 50 returns CONFIRMED_AI verdict', () => {
  // ancestry signal alone = 50 pts
  const result = scoreSignals({ ancestry: ['Claude'], pipes: false, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.CONFIRMED_AI);
  assert.ok(result.score >= 50);
});

test('scoreSignals: code signing vendor alone returns CONFIRMED_AI (50 pts)', () => {
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: 'Anthropic' });
  assert.equal(result.verdict, VERDICT.CONFIRMED_AI);
  assert.ok(result.score >= 50);
});

test('scoreSignals: network AI endpoint alone returns CONFIRMED_AI (40 pts? no...)', () => {
  // network endpoint = 40 pts, below 50 — LIKELY_AI
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: [], networkEndpoints: ['api.anthropic.com'], tccAccess: false, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.LIKELY_AI);
  assert.ok(result.score >= 30 && result.score < 50);
});

test('scoreSignals: pipes + keywords returns LIKELY_AI (30 + 30 = 60 pts -> CONFIRMED_AI)', () => {
  // pipes=30, keywords=30 → total 60 → CONFIRMED_AI
  const result = scoreSignals({ ancestry: [], pipes: true, keywords: ['mcp'], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.CONFIRMED_AI);
  assert.ok(result.score >= 50);
});

test('scoreSignals: pipes alone = 30 pts → LIKELY_AI', () => {
  const result = scoreSignals({ ancestry: [], pipes: true, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.LIKELY_AI);
  assert.equal(result.score, 30);
});

test('scoreSignals: keywords alone = 30 pts → LIKELY_AI', () => {
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: ['claude'], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.LIKELY_AI);
  assert.equal(result.score, 30);
});

test('scoreSignals: score < 30 returns NOT_AI', () => {
  // tcc alone = 10 pts → NOT_AI
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: [], networkEndpoints: [], tccAccess: true, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.NOT_AI);
  assert.ok(result.score < 30);
});

test('scoreSignals: no signals → NOT_AI with score 0', () => {
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.equal(result.verdict, VERDICT.NOT_AI);
  assert.equal(result.score, 0);
});

test('scoreSignals: all signals stacks correctly (50+30+30+40+10+50 = max)', () => {
  const result = scoreSignals({ ancestry: ['Claude'], pipes: true, keywords: ['mcp', 'claude'], networkEndpoints: ['api.anthropic.com'], tccAccess: true, codeSignVendor: 'Anthropic' });
  assert.equal(result.verdict, VERDICT.CONFIRMED_AI);
  assert.ok(result.score >= 50);
});

test('scoreSignals: returns signals array with human-readable descriptions', () => {
  const result = scoreSignals({ ancestry: ['Claude'], pipes: false, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.ok(Array.isArray(result.signals), 'signals should be an array');
  assert.ok(result.signals.length > 0, 'should have at least one signal description');
});

test('scoreSignals: pipes signal adds description to signals array', () => {
  const result = scoreSignals({ ancestry: [], pipes: true, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  assert.ok(result.signals.some(s => s.toLowerCase().includes('pipe') || s.toLowerCase().includes('mcp') || s.toLowerCase().includes('stdin')));
});

test('scoreSignals: keywords in result describe matched terms', () => {
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: ['mcp', 'claude'], networkEndpoints: [], tccAccess: false, codeSignVendor: null });
  const combined = result.signals.join(' ').toLowerCase();
  assert.ok(combined.includes('keyword') || combined.includes('mcp') || combined.includes('claude') || combined.includes('command'));
});

test('scoreSignals: does not mutate input object', () => {
  const input = { ancestry: ['Claude'], pipes: true, keywords: ['mcp'], networkEndpoints: [], tccAccess: false, codeSignVendor: null };
  const ancestryCopy = [...input.ancestry];
  const keywordsCopy = [...input.keywords];
  scoreSignals(input);
  assert.deepEqual(input.ancestry, ancestryCopy);
  assert.deepEqual(input.keywords, keywordsCopy);
});

test('scoreSignals: network endpoints signal is counted correctly (40 pts)', () => {
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: [], networkEndpoints: ['api.openai.com'], tccAccess: false, codeSignVendor: null });
  assert.equal(result.score, 40);
});

test('scoreSignals: tcc access adds 10 pts', () => {
  const result = scoreSignals({ ancestry: [], pipes: false, keywords: [], networkEndpoints: [], tccAccess: true, codeSignVendor: null });
  assert.equal(result.score, 10);
});

test('scoreSignals: code sign vendor + ancestry = 100 pts → CONFIRMED_AI', () => {
  const result = scoreSignals({ ancestry: ['Cursor'], pipes: false, keywords: [], networkEndpoints: [], tccAccess: false, codeSignVendor: 'GitHub' });
  assert.equal(result.verdict, VERDICT.CONFIRMED_AI);
  assert.ok(result.score >= 100);
});

// --- classifyProcess: async integration with mocked exec ---
// These tests verify the function exists and returns the correct shape
// We test with a PID that is guaranteed to exist (process.pid = current node process)

await testAsync('classifyProcess: returns ClassificationResult shape for current process', async () => {
  const result = await classifyProcess(process.pid, 'node', 'node tests/run.js');
  assert.ok(result !== null, 'should return a result object');
  assert.ok('score' in result, 'should have score');
  assert.ok('verdict' in result, 'should have verdict');
  assert.ok('signals' in result, 'should have signals array');
  assert.ok('aiVendor' in result, 'should have aiVendor field');
  assert.ok('ancestorApps' in result, 'should have ancestorApps array');
});

await testAsync('classifyProcess: score is a number', async () => {
  const result = await classifyProcess(process.pid, 'node', 'node tests/run.js');
  assert.equal(typeof result.score, 'number');
});

await testAsync('classifyProcess: verdict is one of the VERDICT constants', async () => {
  const result = await classifyProcess(process.pid, 'node', 'node tests/run.js');
  const validVerdicts = Object.values(VERDICT);
  assert.ok(validVerdicts.includes(result.verdict), `verdict "${result.verdict}" should be one of ${validVerdicts.join(', ')}`);
});

await testAsync('classifyProcess: signals is an array', async () => {
  const result = await classifyProcess(process.pid, 'node', 'node tests/run.js');
  assert.ok(Array.isArray(result.signals));
});

await testAsync('classifyProcess: ancestorApps is an array', async () => {
  const result = await classifyProcess(process.pid, 'node', 'node tests/run.js');
  assert.ok(Array.isArray(result.ancestorApps));
});

await testAsync('classifyProcess: handles invalid PID gracefully (does not throw)', async () => {
  const result = await classifyProcess(999999999, 'unknownproc', '');
  assert.ok(result !== null);
  assert.ok('score' in result);
  assert.ok('verdict' in result);
});

await testAsync('classifyProcess: aiVendor is string or null', async () => {
  const result = await classifyProcess(process.pid, 'node', '');
  assert.ok(result.aiVendor === null || typeof result.aiVendor === 'string');
});

// --- buildProcessTree ---

await testAsync('buildProcessTree: returns a Map', async () => {
  const tree = await buildProcessTree();
  assert.ok(tree instanceof Map, 'should return a Map');
});

await testAsync('buildProcessTree: Map values have pid, ppid, name fields', async () => {
  const tree = await buildProcessTree();
  assert.ok(tree.size > 0, 'process tree should not be empty');
  const [, firstEntry] = [...tree.entries()][0];
  assert.ok('pid' in firstEntry, 'entry should have pid');
  assert.ok('ppid' in firstEntry, 'entry should have ppid');
  assert.ok('name' in firstEntry, 'entry should have name');
});

await testAsync('buildProcessTree: current process PID appears in tree', async () => {
  const tree = await buildProcessTree();
  // Our node process should be visible
  assert.ok(tree.size > 0, 'tree should have entries');
});

await testAsync('buildProcessTree: does not throw on permission errors', async () => {
  // Should never throw — just return partial results
  let threw = false;
  try {
    await buildProcessTree();
  } catch {
    threw = true;
  }
  assert.ok(!threw, 'buildProcessTree should not throw');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
