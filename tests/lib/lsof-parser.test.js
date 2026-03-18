/**
 * Tests for lsof-parser.js
 * RED phase: these tests should fail until implementation exists
 */

import assert from 'node:assert/strict';
import { parseFileOutput, parseNetworkOutput } from '../../src/lib/lsof-parser.js';

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

console.log('\n=== lsof-parser tests ===\n');

// --- parseFileOutput ---

test('parseFileOutput: returns empty array for empty string', () => {
  const result = parseFileOutput('');
  assert.deepEqual(result, []);
});

test('parseFileOutput: parses single process with one file', () => {
  const input = `p12345\ncClaude\nf3r\nttxt\nn/Users/t/Documents/foo.txt\n`;
  const result = parseFileOutput(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].pid, 12345);
  assert.equal(result[0].command, 'Claude');
  assert.equal(result[0].filePath, '/Users/t/Documents/foo.txt');
});

test('parseFileOutput: parses multiple files for same process', () => {
  const input = [
    'p99\ncMyApp',
    'f1\ntreg\nn/tmp/a.txt',
    'f2\ntreg\nn/tmp/b.txt',
  ].join('\n');
  const result = parseFileOutput(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].pid, 99);
  assert.equal(result[0].filePath, '/tmp/a.txt');
  assert.equal(result[1].filePath, '/tmp/b.txt');
});

test('parseFileOutput: parses multiple processes', () => {
  const input = [
    'p100\ncProcA\nf0\nttxt\nn/etc/hosts',
    'p200\ncProcB\nf0\nttxt\nn/etc/passwd',
  ].join('\n');
  const result = parseFileOutput(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].pid, 100);
  assert.equal(result[0].command, 'ProcA');
  assert.equal(result[1].pid, 200);
  assert.equal(result[1].command, 'ProcB');
});

test('parseFileOutput: skips lines without file path (no n-line)', () => {
  const input = 'p55\ncFoo\nf0\ntreg\n';
  const result = parseFileOutput(input);
  // No n-line means no file entry
  assert.equal(result.length, 0);
});

test('parseFileOutput: handles malformed lines gracefully', () => {
  const input = 'garbage\nmore garbage\np1\ncApp\nf0\nttxt\nn/valid/path\n';
  const result = parseFileOutput(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].filePath, '/valid/path');
});

test('parseFileOutput: pid is a number not a string', () => {
  const input = 'p42\ncApp\nf0\nttxt\nn/tmp/x\n';
  const result = parseFileOutput(input);
  assert.equal(typeof result[0].pid, 'number');
  assert.equal(result[0].pid, 42);
});

test('parseFileOutput: captures fd and type fields', () => {
  const input = 'p1\ncApp\nf7w\ntreg\nn/tmp/out.log\n';
  const result = parseFileOutput(input);
  assert.equal(result[0].fd, '7w');
  assert.equal(result[0].type, 'reg');
});

// --- parseNetworkOutput ---

test('parseNetworkOutput: returns empty array for empty string', () => {
  const result = parseNetworkOutput('');
  assert.deepEqual(result, []);
});

test('parseNetworkOutput: parses a basic TCP ESTABLISHED connection', () => {
  // lsof -F format: t=type/protocol, s=state (ESTABLISHED/LISTEN/etc.)
  const input = [
    'p1234',
    'ccurl',
    'tTCP',
    'n192.168.1.1:54321->104.20.1.1:443',
    'sESTABLISHED',
  ].join('\n');
  const result = parseNetworkOutput(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].pid, 1234);
  assert.equal(result[0].command, 'curl');
  assert.equal(result[0].protocol, 'TCP');
  assert.equal(result[0].state, 'ESTABLISHED');
  assert.ok(result[0].localAddress.includes('192.168.1.1'));
  assert.ok(result[0].remoteAddress.includes('104.20.1.1'));
});

test('parseNetworkOutput: parses UDP connection without state', () => {
  const input = [
    'p5555',
    'cMyApp',
    'tUDP',
    'n0.0.0.0:53->8.8.8.8:53',
  ].join('\n');
  const result = parseNetworkOutput(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].protocol, 'UDP');
  assert.equal(result[0].pid, 5555);
});

test('parseNetworkOutput: parses multiple connections across processes', () => {
  const input = [
    'p100',
    'cProcA',
    'sTCP',
    'n10.0.0.1:1111->1.2.3.4:443',
    'tESTABLISHED',
    'p200',
    'cProcB',
    'sTCP',
    'n10.0.0.1:2222->5.6.7.8:80',
    'tESTABLISHED',
  ].join('\n');
  const result = parseNetworkOutput(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].pid, 100);
  assert.equal(result[1].pid, 200);
});

test('parseNetworkOutput: handles malformed/empty n-lines gracefully', () => {
  const input = 'p1\ncFoo\nsUDP\nn\n';
  // n-line with empty address - should still return entry or skip
  const result = parseNetworkOutput(input);
  // Must not throw; result may be empty or have partial data
  assert.ok(Array.isArray(result));
});

test('parseNetworkOutput: pid is a number', () => {
  const input = 'p9999\ncApp\nsTCP\nn127.0.0.1:8080->127.0.0.1:9090\ntESTABLISHED\n';
  const result = parseNetworkOutput(input);
  assert.equal(typeof result[0].pid, 'number');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
