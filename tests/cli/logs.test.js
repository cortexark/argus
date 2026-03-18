/**
 * Tests for cli/commands/logs.js
 * TDD RED phase — tests written before implementation
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

console.log('\n=== logs command tests ===\n');

const { parseDuration, formatLogLine } = await import(
  '../../src/cli/commands/logs.js'
);

// --- parseDuration ---

test('parseDuration exports as function', () => {
  assert.equal(typeof parseDuration, 'function');
});

test('parseDuration("1h") returns 3600000', () => {
  assert.equal(parseDuration('1h'), 3600000);
});

test('parseDuration("30m") returns 1800000', () => {
  assert.equal(parseDuration('30m'), 1800000);
});

test('parseDuration("2d") returns 172800000', () => {
  assert.equal(parseDuration('2d'), 172800000);
});

test('parseDuration("24h") returns 86400000', () => {
  assert.equal(parseDuration('24h'), 86400000);
});

test('parseDuration("5m") returns 300000', () => {
  assert.equal(parseDuration('5m'), 300000);
});

test('parseDuration("7d") returns 604800000', () => {
  assert.equal(parseDuration('7d'), 604800000);
});

test('parseDuration("60s") returns 60000', () => {
  assert.equal(parseDuration('60s'), 60000);
});

test('parseDuration("0h") returns 0', () => {
  assert.equal(parseDuration('0h'), 0);
});

test('parseDuration(null) returns null', () => {
  assert.equal(parseDuration(null), null);
});

test('parseDuration(undefined) returns null', () => {
  assert.equal(parseDuration(undefined), null);
});

test('parseDuration("") returns null', () => {
  assert.equal(parseDuration(''), null);
});

test('parseDuration("invalid") returns null', () => {
  assert.equal(parseDuration('invalid'), null);
});

test('parseDuration("abc") returns null', () => {
  assert.equal(parseDuration('abc'), null);
});

// --- formatLogLine ---

test('formatLogLine exports as function', () => {
  assert.equal(typeof formatLogLine, 'function');
});

test('formatLogLine returns string for valid pino JSON', () => {
  const pinoLine = JSON.stringify({
    level: 30,
    time: new Date('2024-01-15T10:30:00.000Z').getTime(),
    msg: 'Test message',
    pid: 1234,
  });
  const result = formatLogLine(pinoLine, false);
  assert.equal(typeof result, 'string');
});

test('formatLogLine includes message content', () => {
  const pinoLine = JSON.stringify({
    level: 30,
    time: new Date('2024-01-15T10:30:00.000Z').getTime(),
    msg: 'Hello world',
    pid: 1234,
  });
  const result = formatLogLine(pinoLine, false);
  assert.ok(result.includes('Hello world'), `Expected "Hello world" in: ${result}`);
});

test('formatLogLine includes log level label', () => {
  const pinoLine = JSON.stringify({
    level: 30,
    time: Date.now(),
    msg: 'info message',
  });
  const result = formatLogLine(pinoLine, false);
  // Should contain level label (INFO, info, or similar)
  assert.ok(
    result.toLowerCase().includes('info'),
    `Expected level label in: ${result}`
  );
});

test('formatLogLine with useJson=true returns raw JSON string', () => {
  const pinoLine = JSON.stringify({ level: 30, time: Date.now(), msg: 'raw' });
  const result = formatLogLine(pinoLine, true);
  // In JSON mode, should return the line as-is or parseable JSON
  assert.ok(typeof result === 'string');
  // Should be valid JSON
  const parsed = JSON.parse(result);
  assert.equal(parsed.msg, 'raw');
});

test('formatLogLine handles error level (50)', () => {
  const pinoLine = JSON.stringify({
    level: 50,
    time: Date.now(),
    msg: 'Error occurred',
  });
  const result = formatLogLine(pinoLine, false);
  assert.ok(
    result.toLowerCase().includes('error'),
    `Expected error label in: ${result}`
  );
});

test('formatLogLine handles warn level (40)', () => {
  const pinoLine = JSON.stringify({
    level: 40,
    time: Date.now(),
    msg: 'Warning occurred',
  });
  const result = formatLogLine(pinoLine, false);
  assert.ok(
    result.toLowerCase().includes('warn'),
    `Expected warn label in: ${result}`
  );
});

test('formatLogLine handles malformed JSON gracefully', () => {
  const result = formatLogLine('not-valid-json', false);
  // Must not throw; returns the raw line or error indicator
  assert.equal(typeof result, 'string');
});

test('formatLogLine handles empty string', () => {
  const result = formatLogLine('', false);
  assert.equal(typeof result, 'string');
});

test('formatLogLine includes time component', () => {
  const pinoLine = JSON.stringify({
    level: 30,
    time: new Date('2024-01-15T10:30:45.000Z').getTime(),
    msg: 'Timed message',
  });
  const result = formatLogLine(pinoLine, false);
  // Should include some time representation
  // Accept HH:MM or full ISO or date portion
  assert.ok(
    result.includes('10:30') || result.includes('2024'),
    `Expected time in: ${result}`
  );
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
