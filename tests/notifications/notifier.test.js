/**
 * Tests for notifications/notifier.js
 * TDD RED phase — tests written before implementation
 */

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

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

console.log('\n=== notifier tests ===\n');

const { sendAlert, clearThrottle, notify } = await import(
  '../../src/notifications/notifier.js'
);

// --- Exports shape ---

test('exports sendAlert function', () => {
  assert.equal(typeof sendAlert, 'function');
});

test('exports clearThrottle function', () => {
  assert.equal(typeof clearThrottle, 'function');
});

test('exports notify object', () => {
  assert.equal(typeof notify, 'object');
  assert.ok(notify !== null);
});

test('notify has fileAlert helper', () => {
  assert.equal(typeof notify.fileAlert, 'function');
});

test('notify has newConnection helper', () => {
  assert.equal(typeof notify.newConnection, 'function');
});

test('notify has newAppDetected helper', () => {
  assert.equal(typeof notify.newAppDetected, 'function');
});

// --- Throttling ---

test('sendAlert returns true on first call', () => {
  clearThrottle(); // reset all throttle state
  const result = sendAlert('TestApp', 'test_alert', 'Test message');
  assert.equal(result, true);
});

test('sendAlert returns false on second call within throttle window', () => {
  clearThrottle();
  sendAlert('TestApp', 'test_alert', 'First message');
  const result = sendAlert('TestApp', 'test_alert', 'Second message');
  assert.equal(result, false);
});

test('sendAlert allows different alertType for same app', () => {
  clearThrottle();
  sendAlert('TestApp', 'file_alert', 'File message');
  const result = sendAlert('TestApp', 'new_connection', 'Network message');
  assert.equal(result, true);
});

test('sendAlert allows different appName for same alertType', () => {
  clearThrottle();
  sendAlert('AppA', 'file_alert', 'Message A');
  const result = sendAlert('AppB', 'file_alert', 'Message B');
  assert.equal(result, true);
});

test('sendAlert throttle key is appName:alertType combination', () => {
  clearThrottle();
  // Two different apps, two different types — all 4 should pass
  assert.equal(sendAlert('App1', 'type1', 'msg'), true);
  assert.equal(sendAlert('App1', 'type2', 'msg'), true);
  assert.equal(sendAlert('App2', 'type1', 'msg'), true);
  assert.equal(sendAlert('App2', 'type2', 'msg'), true);
  // Now repeats should all be throttled
  assert.equal(sendAlert('App1', 'type1', 'msg'), false);
  assert.equal(sendAlert('App1', 'type2', 'msg'), false);
  assert.equal(sendAlert('App2', 'type1', 'msg'), false);
  assert.equal(sendAlert('App2', 'type2', 'msg'), false);
});

// --- clearThrottle ---

test('clearThrottle() clears all throttle state', () => {
  clearThrottle();
  sendAlert('TestApp', 'test_alert', 'First');
  clearThrottle();
  const result = sendAlert('TestApp', 'test_alert', 'After clear');
  assert.equal(result, true);
});

test('clearThrottle(key) clears only that specific key', () => {
  clearThrottle();
  sendAlert('AppA', 'file_alert', 'First A');
  sendAlert('AppB', 'file_alert', 'First B');

  // Clear only AppA:file_alert
  clearThrottle('AppA:file_alert');

  // AppA should fire again
  assert.equal(sendAlert('AppA', 'file_alert', 'Second A'), true);
  // AppB should still be throttled
  assert.equal(sendAlert('AppB', 'file_alert', 'Second B'), false);
});

// --- notify helpers return boolean ---

test('notify.fileAlert returns boolean', () => {
  clearThrottle();
  const result = notify.fileAlert('Claude', '/Users/t/.ssh/id_rsa', 'high');
  assert.equal(typeof result, 'boolean');
});

test('notify.newConnection returns boolean', () => {
  clearThrottle();
  const result = notify.newConnection('Claude', 'api.anthropic.com', 443);
  assert.equal(typeof result, 'boolean');
});

test('notify.newAppDetected returns boolean', () => {
  clearThrottle();
  const result = notify.newAppDetected('Cursor', 'code-editor');
  assert.equal(typeof result, 'boolean');
});

// --- sendAlert does not mutate opts ---

test('sendAlert does not mutate opts argument', () => {
  clearThrottle();
  const opts = { sound: false };
  const original = { ...opts };
  sendAlert('App', 'type', 'msg', opts);
  assert.deepEqual(opts, original);
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
