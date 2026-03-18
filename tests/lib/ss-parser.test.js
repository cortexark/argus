/**
 * Tests for ss-parser.js — Linux ss -tunap output parser.
 */

import { parseSsOutput } from '../../src/lib/ss-parser.js';

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

console.log('\n=== ss-parser tests ===\n');

test('parseSsOutput: returns empty array for empty string', () => {
  const result = parseSsOutput('');
  assert(Array.isArray(result), 'should be array');
  assertEqual(result.length, 0);
});

test('parseSsOutput: returns empty array for null', () => {
  const result = parseSsOutput(null);
  assert(Array.isArray(result));
  assertEqual(result.length, 0);
});

test('parseSsOutput: skips header line', () => {
  const input = `Netid  State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
tcp    ESTAB   0       0       192.168.1.5:43210  142.250.80.46:443  users:(("node",pid=12345,fd=22))`;
  const result = parseSsOutput(input);
  assertEqual(result.length, 1);
});

test('parseSsOutput: parses basic TCP ESTABLISHED connection', () => {
  const input = `tcp   ESTAB  0  0  192.168.1.5:43210  142.250.80.46:443  users:(("node",pid=12345,fd=22))`;
  const result = parseSsOutput(input);
  assertEqual(result.length, 1);
  const conn = result[0];
  assertEqual(conn.pid, 12345);
  assertEqual(conn.command, 'node');
  assertEqual(conn.state, 'ESTABLISHED');
  assertEqual(conn.remoteAddress, '142.250.80.46:443');
  assertEqual(conn.localAddress, '192.168.1.5:43210');
  assertEqual(conn.protocol, 'IPv4');
});

test('parseSsOutput: parses IPv6 connection', () => {
  const input = `tcp6  ESTAB  0  0  [::1]:54321  [2607:f8b0::1]:443  users:(("claude",pid=9999,fd=10))`;
  const result = parseSsOutput(input);
  assertEqual(result.length, 1);
  assertEqual(result[0].protocol, 'IPv6');
  assertEqual(result[0].pid, 9999);
  assertEqual(result[0].command, 'claude');
});

test('parseSsOutput: normalises ESTAB to ESTABLISHED', () => {
  const input = `tcp  ESTAB  0  0  127.0.0.1:12345  8.8.8.8:443  users:(("cursor",pid=1111,fd=5))`;
  const result = parseSsOutput(input);
  assertEqual(result[0].state, 'ESTABLISHED');
});

test('parseSsOutput: skips lines without users field', () => {
  const input = `tcp  LISTEN  0  128  0.0.0.0:8080  0.0.0.0:*`;
  const result = parseSsOutput(input);
  assertEqual(result.length, 0);
});

test('parseSsOutput: skips wildcard remote address', () => {
  const input = `tcp  LISTEN  0  128  0.0.0.0:443  *:*  users:(("nginx",pid=500,fd=6))`;
  const result = parseSsOutput(input);
  assertEqual(result.length, 0);
});

test('parseSsOutput: parses multiple connections', () => {
  const input = [
    `tcp  ESTAB  0  0  192.168.1.5:50001  1.2.3.4:443  users:(("node",pid=100,fd=3))`,
    `tcp  ESTAB  0  0  192.168.1.5:50002  5.6.7.8:443  users:(("cursor",pid=200,fd=4))`,
    `udp  UNCONN 0  0  0.0.0.0:5353  *:*  users:(("avahi",pid=300,fd=12))`,
  ].join('\n');
  const result = parseSsOutput(input);
  // udp with wildcard remote is skipped
  assert(result.length >= 2, `expected >= 2 results, got ${result.length}`);
  const pids = result.map((r) => r.pid);
  assert(pids.includes(100), 'should include pid 100');
  assert(pids.includes(200), 'should include pid 200');
});

test('parseSsOutput: handles process name with spaces in users field', () => {
  const input = `tcp  ESTAB  0  0  10.0.0.1:60000  10.0.0.2:443  users:(("Claude Desktop",pid=7777,fd=8))`;
  const result = parseSsOutput(input);
  // The first quoted token is captured
  assertEqual(result[0].pid, 7777);
});

test('parseSsOutput: pid is a number not a string', () => {
  const input = `tcp  ESTAB  0  0  127.0.0.1:1111  8.8.8.8:443  users:(("ollama",pid=42,fd=1))`;
  const result = parseSsOutput(input);
  assertEqual(typeof result[0].pid, 'number');
  assertEqual(result[0].pid, 42);
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
