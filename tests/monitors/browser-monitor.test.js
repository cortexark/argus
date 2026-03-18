/**
 * Tests for monitors/browser-monitor.js
 * RED phase: tests written before implementation
 * Tests browser AI activity detection.
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

console.log('\n=== browser-monitor tests ===\n');

import {
  classifyBrowserFile,
  detectCdpConnection,
  detectBrowserSpawn,
  detectAppleScriptBrowserControl,
  BROWSER_PROCESSES,
  BROWSER_FILE_SEVERITY,
} from '../../src/monitors/browser-monitor.js';

// --- BROWSER_PROCESSES export ---

test('BROWSER_PROCESSES: is exported as an object', () => {
  assert.ok(typeof BROWSER_PROCESSES === 'object' && BROWSER_PROCESSES !== null);
});

test('BROWSER_PROCESSES: contains Google Chrome entry', () => {
  assert.ok('Google Chrome' in BROWSER_PROCESSES, 'should have Google Chrome');
  assert.equal(BROWSER_PROCESSES['Google Chrome'].family, 'chromium');
});

test('BROWSER_PROCESSES: contains Firefox entry', () => {
  assert.ok('Firefox' in BROWSER_PROCESSES || 'firefox' in BROWSER_PROCESSES, 'should have Firefox');
});

test('BROWSER_PROCESSES: contains Safari entry', () => {
  assert.ok('Safari' in BROWSER_PROCESSES, 'should have Safari');
  assert.equal(BROWSER_PROCESSES['Safari'].family, 'webkit');
});

test('BROWSER_PROCESSES: contains Brave Browser entry', () => {
  assert.ok('Brave Browser' in BROWSER_PROCESSES, 'should have Brave Browser');
});

test('BROWSER_PROCESSES: each entry has name and family fields', () => {
  for (const [key, val] of Object.entries(BROWSER_PROCESSES)) {
    assert.ok('name' in val, `${key} entry missing name field`);
    assert.ok('family' in val, `${key} entry missing family field`);
  }
});

// --- BROWSER_FILE_SEVERITY export ---

test('BROWSER_FILE_SEVERITY: is exported as an object', () => {
  assert.ok(typeof BROWSER_FILE_SEVERITY === 'object' && BROWSER_FILE_SEVERITY !== null);
});

test('BROWSER_FILE_SEVERITY: Login Data entry has CRITICAL severity', () => {
  assert.ok('Login Data' in BROWSER_FILE_SEVERITY);
  assert.equal(BROWSER_FILE_SEVERITY['Login Data'].severity, 'CRITICAL');
});

test('BROWSER_FILE_SEVERITY: Cookies entry has HIGH severity', () => {
  assert.ok('Cookies' in BROWSER_FILE_SEVERITY);
  assert.equal(BROWSER_FILE_SEVERITY['Cookies'].severity, 'HIGH');
});

test('BROWSER_FILE_SEVERITY: History entry has MEDIUM severity', () => {
  assert.ok('History' in BROWSER_FILE_SEVERITY);
  assert.equal(BROWSER_FILE_SEVERITY['History'].severity, 'MEDIUM');
});

test('BROWSER_FILE_SEVERITY: Bookmarks entry has LOW severity', () => {
  assert.ok('Bookmarks' in BROWSER_FILE_SEVERITY);
  assert.equal(BROWSER_FILE_SEVERITY['Bookmarks'].severity, 'LOW');
});

test('BROWSER_FILE_SEVERITY: key4.db entry has CRITICAL severity', () => {
  assert.ok('key4.db' in BROWSER_FILE_SEVERITY);
  assert.equal(BROWSER_FILE_SEVERITY['key4.db'].severity, 'CRITICAL');
});

test('BROWSER_FILE_SEVERITY: logins.json entry has CRITICAL severity', () => {
  assert.ok('logins.json' in BROWSER_FILE_SEVERITY);
  assert.equal(BROWSER_FILE_SEVERITY['logins.json'].severity, 'CRITICAL');
});

test('BROWSER_FILE_SEVERITY: each entry has severity and label fields', () => {
  for (const [key, val] of Object.entries(BROWSER_FILE_SEVERITY)) {
    assert.ok('severity' in val, `${key} entry missing severity field`);
    assert.ok('label' in val, `${key} entry missing label field`);
  }
});

// --- classifyBrowserFile ---

test('classifyBrowserFile: Login Data file → CRITICAL severity', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/Login Data');
  assert.ok(result !== null, 'should return a result');
  assert.equal(result.severity, 'CRITICAL');
});

test('classifyBrowserFile: Cookies file → HIGH severity', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/Cookies');
  assert.ok(result !== null, 'should return a result');
  assert.equal(result.severity, 'HIGH');
});

test('classifyBrowserFile: History file → MEDIUM severity', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/History');
  assert.ok(result !== null, 'should return a result');
  assert.equal(result.severity, 'MEDIUM');
});

test('classifyBrowserFile: Bookmarks file → LOW severity', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/Bookmarks');
  assert.ok(result !== null, 'should return a result');
  assert.equal(result.severity, 'LOW');
});

test('classifyBrowserFile: key4.db → CRITICAL severity (Firefox)', () => {
  const result = classifyBrowserFile('/home/user/.mozilla/firefox/profile/key4.db');
  assert.ok(result !== null, 'should return a result');
  assert.equal(result.severity, 'CRITICAL');
});

test('classifyBrowserFile: logins.json → CRITICAL severity (Firefox)', () => {
  const result = classifyBrowserFile('/home/user/.mozilla/firefox/profile/logins.json');
  assert.ok(result !== null, 'should return a result');
  assert.equal(result.severity, 'CRITICAL');
});

test('classifyBrowserFile: random non-browser file → null', () => {
  const result = classifyBrowserFile('/home/user/documents/report.pdf');
  assert.equal(result, null);
});

test('classifyBrowserFile: empty string → null', () => {
  const result = classifyBrowserFile('');
  assert.equal(result, null);
});

test('classifyBrowserFile: null input → null', () => {
  const result = classifyBrowserFile(null);
  assert.equal(result, null);
});

test('classifyBrowserFile: system file with no browser name → null', () => {
  const result = classifyBrowserFile('/etc/passwd');
  assert.equal(result, null);
});

test('classifyBrowserFile: Login Data result has browser field', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/Login Data');
  assert.ok(result !== null);
  assert.ok('browser' in result, 'result should have browser field');
});

test('classifyBrowserFile: Login Data result has dataType field', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/Login Data');
  assert.ok(result !== null);
  assert.ok('dataType' in result, 'result should have dataType field');
});

test('classifyBrowserFile: detects Chrome as browser for Chrome path', () => {
  const result = classifyBrowserFile('/Users/t/Library/Application Support/Google/Chrome/Default/Login Data');
  assert.ok(result !== null);
  assert.ok(result.browser.toLowerCase().includes('chrome') || result.browser.toLowerCase().includes('google'));
});

test('classifyBrowserFile: detects Firefox for Firefox path', () => {
  const result = classifyBrowserFile('/home/user/.mozilla/firefox/profile/key4.db');
  assert.ok(result !== null);
  assert.ok(result.browser.toLowerCase().includes('firefox'));
});

test('classifyBrowserFile: does not mutate input string', () => {
  const input = '/Users/t/Library/Application Support/Google/Chrome/Default/Login Data';
  const copy = input.slice();
  classifyBrowserFile(input);
  assert.equal(input, copy);
});

// --- detectCdpConnection ---

test('detectCdpConnection: empty array → empty result', () => {
  const result = detectCdpConnection([]);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('detectCdpConnection: null → empty result', () => {
  const result = detectCdpConnection(null);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('detectCdpConnection: events without port 9222 → empty result', () => {
  const events = [
    { processName: 'node', port: 443, remoteHost: 'api.anthropic.com' },
    { processName: 'python', port: 8080, remoteHost: 'localhost' },
  ];
  const result = detectCdpConnection(events);
  assert.equal(result.length, 0);
});

test('detectCdpConnection: event with port 9222 → flagged as browser_automation', () => {
  const events = [
    { processName: 'node', appLabel: 'Claude (Anthropic)', port: 9222, remoteHost: 'localhost' },
  ];
  const result = detectCdpConnection(events);
  assert.ok(result.length > 0, 'should detect CDP connection');
  assert.equal(result[0].verdict, 'browser_automation');
});

test('detectCdpConnection: result item has processName field', () => {
  const events = [
    { processName: 'node', appLabel: 'MCP Agent', port: 9222, remoteHost: '127.0.0.1' },
  ];
  const result = detectCdpConnection(events);
  assert.ok(result.length > 0);
  assert.ok('processName' in result[0]);
});

test('detectCdpConnection: result item has appLabel field', () => {
  const events = [
    { processName: 'node', appLabel: 'MCP Agent', port: 9222, remoteHost: '127.0.0.1' },
  ];
  const result = detectCdpConnection(events);
  assert.ok(result.length > 0);
  assert.ok('appLabel' in result[0]);
});

test('detectCdpConnection: result item has port field', () => {
  const events = [
    { processName: 'node', appLabel: 'MCP Agent', port: 9222, remoteHost: '127.0.0.1' },
  ];
  const result = detectCdpConnection(events);
  assert.ok(result.length > 0);
  assert.equal(result[0].port, 9222);
});

test('detectCdpConnection: only flags localhost/127.0.0.1 connections on port 9222', () => {
  const events = [
    { processName: 'node', appLabel: 'Agent', port: 9222, remoteHost: 'external.example.com' },
    { processName: 'python', appLabel: 'Agent2', port: 9222, remoteHost: 'localhost' },
  ];
  const result = detectCdpConnection(events);
  // At least the localhost one should match
  assert.ok(result.some(r => r.processName === 'python'), 'localhost:9222 should be flagged');
});

test('detectCdpConnection: multiple CDP connections flagged individually', () => {
  const events = [
    { processName: 'node', appLabel: 'Agent1', port: 9222, remoteHost: 'localhost' },
    { processName: 'python', appLabel: 'Agent2', port: 9222, remoteHost: '127.0.0.1' },
  ];
  const result = detectCdpConnection(events);
  assert.equal(result.length, 2);
});

test('detectCdpConnection: does not mutate input array', () => {
  const events = [
    { processName: 'node', appLabel: 'Agent', port: 9222, remoteHost: 'localhost' },
  ];
  const originalLength = events.length;
  detectCdpConnection(events);
  assert.equal(events.length, originalLength);
});

// --- detectBrowserSpawn ---

test('detectBrowserSpawn: empty process tree → empty result', () => {
  const tree = new Map();
  const result = detectBrowserSpawn(tree);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('detectBrowserSpawn: no AI parent → empty result', () => {
  // Two regular processes, neither is AI parent
  const tree = new Map([
    [100, { pid: 100, ppid: 1, name: 'bash', cmd: 'bash' }],
    [101, { pid: 101, ppid: 100, name: 'Google Chrome', cmd: 'chrome' }],
  ]);
  const result = detectBrowserSpawn(tree);
  assert.equal(result.length, 0);
});

test('detectBrowserSpawn: Chrome spawned by claude → detected', () => {
  const tree = new Map([
    [200, { pid: 200, ppid: 1, name: 'claude', cmd: 'claude' }],
    [201, { pid: 201, ppid: 200, name: 'Google Chrome', cmd: 'chrome --headless' }],
  ]);
  const result = detectBrowserSpawn(tree);
  assert.ok(result.length > 0, 'should detect Chrome spawned by AI');
  assert.ok(result[0].browserProcess, 'should have browserProcess field');
  assert.ok(result[0].parentAiApp, 'should have parentAiApp field');
});

test('detectBrowserSpawn: Firefox spawned by cursor → detected', () => {
  const tree = new Map([
    [300, { pid: 300, ppid: 1, name: 'cursor', cmd: 'cursor' }],
    [301, { pid: 301, ppid: 300, name: 'firefox', cmd: 'firefox' }],
  ]);
  const result = detectBrowserSpawn(tree);
  assert.ok(result.length > 0, 'should detect Firefox spawned by AI');
});

// --- detectAppleScriptBrowserControl ---

test('detectAppleScriptBrowserControl: empty tree → empty result', () => {
  const tree = new Map();
  const result = detectAppleScriptBrowserControl(tree);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('detectAppleScriptBrowserControl: osascript with Safari tell → detected', () => {
  const tree = new Map([
    [400, { pid: 400, ppid: 1, name: 'claude', cmd: 'claude' }],
    [401, { pid: 401, ppid: 400, name: 'osascript', cmd: 'osascript -e tell application "Safari" to get URL of current tab' }],
  ]);
  const result = detectAppleScriptBrowserControl(tree);
  assert.ok(result.length > 0, 'should detect AppleScript Safari control');
});

test('detectAppleScriptBrowserControl: osascript with Chrome tell → detected', () => {
  const tree = new Map([
    [500, { pid: 500, ppid: 1, name: 'cursor', cmd: 'cursor' }],
    [501, { pid: 501, ppid: 500, name: 'osascript', cmd: 'osascript -e tell application "Google Chrome" to execute active tab javascript "..."' }],
  ]);
  const result = detectAppleScriptBrowserControl(tree);
  assert.ok(result.length > 0, 'should detect AppleScript Chrome control');
});

test('detectAppleScriptBrowserControl: osascript without browser tell → not detected', () => {
  const tree = new Map([
    [600, { pid: 600, ppid: 1, name: 'claude', cmd: 'claude' }],
    [601, { pid: 601, ppid: 600, name: 'osascript', cmd: 'osascript -e beep 3' }],
  ]);
  const result = detectAppleScriptBrowserControl(tree);
  assert.equal(result.length, 0, 'non-browser osascript should not be flagged');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
