/**
 * Tests for netstat-parser.js — macOS netstat -anv output parser.
 */

import { parseNetstatOutput } from '../../src/lib/netstat-parser.js';

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

console.log('\n=== netstat-parser tests ===\n');

test('parseNetstatOutput: returns empty array for empty string', () => {
  assertEqual(parseNetstatOutput('').length, 0);
});

test('parseNetstatOutput: returns empty array for null', () => {
  assertEqual(parseNetstatOutput(null).length, 0);
});

test('parseNetstatOutput: skips header lines', () => {
  const input = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)      rxbytes txbytes   pid
tcp4       0      0  192.168.1.5.43210      142.250.80.46.443      ESTABLISHED  131072  131072  12345 0`;
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 1);
});

test('parseNetstatOutput: parses basic TCP4 ESTABLISHED with PID', () => {
  const input = `tcp4  0  0  192.168.1.5.43210  142.250.80.46.443  ESTABLISHED  131072  131072  12345  0`;
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 1);
  const conn = result[0];
  assertEqual(conn.pid, 12345);
  assertEqual(conn.protocol, 'IPv4');
  assertEqual(conn.state, 'ESTABLISHED');
  assertEqual(conn.localAddress, '192.168.1.5:43210');
  assertEqual(conn.remoteAddress, '142.250.80.46:443');
});

test('parseNetstatOutput: parses TCP6 connection', () => {
  const input = `tcp6  0  0  fe80::1.54321  2607:f8b0::1.443  ESTABLISHED  131072  131072  9999  0`;
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 1);
  assertEqual(result[0].protocol, 'IPv6');
  assertEqual(result[0].pid, 9999);
});

test('parseNetstatOutput: skips wildcard/listen entries', () => {
  const input = `tcp4  0  0  *.80  *.*  LISTEN  0  0  1234  0`;
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 0, 'wildcard remote should be skipped');
});

test('parseNetstatOutput: skips lines with *.*  remote', () => {
  const input = `tcp4  0  0  127.0.0.1.8080  *.*  LISTEN  0  0  5678  0`;
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 0);
});

test('parseNetstatOutput: pid is 0 when -v columns not present', () => {
  // Without -v, only 6 columns: proto, recv-q, send-q, local, foreign, state
  const input = `tcp4  0  0  192.168.1.5.443  10.0.0.1.52000  ESTABLISHED`;
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 1);
  assertEqual(result[0].pid, 0, 'pid should be 0 when not present');
});

test('parseNetstatOutput: normalises macOS dot-notation addresses', () => {
  const input = `tcp4  0  0  10.0.0.1.54321  8.8.8.8.443  ESTABLISHED  0  0  777  0`;
  const result = parseNetstatOutput(input);
  assertEqual(result[0].localAddress, '10.0.0.1:54321');
  assertEqual(result[0].remoteAddress, '8.8.8.8:443');
});

test('parseNetstatOutput: parses multiple connections', () => {
  const input = [
    `tcp4  0  0  10.0.0.1.50001  1.2.3.4.443  ESTABLISHED  0  0  100  0`,
    `tcp4  0  0  10.0.0.1.50002  5.6.7.8.443  ESTABLISHED  0  0  200  0`,
    `tcp4  0  0  *.8080          *.*          LISTEN        0  0  300  0`,
  ].join('\n');
  const result = parseNetstatOutput(input);
  assertEqual(result.length, 2, 'LISTEN with wildcard remote should be excluded');
  const pids = result.map((r) => r.pid);
  assert(pids.includes(100));
  assert(pids.includes(200));
});

test('parseNetstatOutput: command field is empty string', () => {
  const input = `tcp4  0  0  10.0.0.1.9999  8.8.8.8.443  ESTABLISHED  0  0  555  0`;
  const result = parseNetstatOutput(input);
  assertEqual(result[0].command, '');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
