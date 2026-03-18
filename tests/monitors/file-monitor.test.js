/**
 * Tests for monitors/file-monitor.js
 * RED phase: tests should fail until implementation exists
 */

import assert from 'node:assert/strict';
import { classifyPath } from '../../src/monitors/file-monitor.js';

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

console.log('\n=== file-monitor tests ===\n');

// --- classifyPath ---

test('classifyPath: returns null for non-sensitive path', () => {
  const result = classifyPath('/usr/lib/libsystem.dylib');
  assert.equal(result, null);
});

test('classifyPath: returns null for empty string', () => {
  const result = classifyPath('');
  assert.equal(result, null);
});

test('classifyPath: detects .ssh path as credentials', () => {
  const result = classifyPath('/Users/alice/.ssh/id_rsa');
  assert.equal(result, 'credentials');
});

test('classifyPath: detects .aws path as credentials', () => {
  const result = classifyPath('/Users/alice/.aws/credentials');
  assert.equal(result, 'credentials');
});

test('classifyPath: detects .gnupg path as credentials', () => {
  const result = classifyPath('/Users/alice/.gnupg/secring.gpg');
  assert.equal(result, 'credentials');
});

test('classifyPath: detects 1Password path as credentials', () => {
  const result = classifyPath('/Users/alice/Library/Application Support/1Password/data.sqlite');
  assert.equal(result, 'credentials');
});

test('classifyPath: detects .npmrc as credentials', () => {
  const result = classifyPath('/Users/alice/.npmrc');
  assert.equal(result, 'credentials');
});

test('classifyPath: detects Chrome profile as browserData', () => {
  const result = classifyPath('/Users/alice/Library/Application Support/Google/Chrome/Default/History');
  assert.equal(result, 'browserData');
});

test('classifyPath: detects Firefox profile as browserData', () => {
  const result = classifyPath('/Users/alice/Library/Application Support/Firefox/Profiles/abc.default/cookies.sqlite');
  assert.equal(result, 'browserData');
});

test('classifyPath: detects Safari as browserData', () => {
  const result = classifyPath('/Users/alice/Library/Safari/History.db');
  assert.equal(result, 'browserData');
});

test('classifyPath: detects /Documents path as documents', () => {
  const result = classifyPath('/Users/alice/Documents/secret.pdf');
  assert.equal(result, 'documents');
});

test('classifyPath: detects /Downloads path as documents', () => {
  const result = classifyPath('/Users/alice/Downloads/invoice.pdf');
  assert.equal(result, 'documents');
});

test('classifyPath: detects /Desktop path as documents', () => {
  const result = classifyPath('/Users/alice/Desktop/notes.txt');
  assert.equal(result, 'documents');
});

test('classifyPath: detects .env file as system', () => {
  const result = classifyPath('/home/user/project/.env');
  assert.equal(result, 'system');
});

test('classifyPath: detects /etc/passwd as system', () => {
  const result = classifyPath('/etc/passwd');
  assert.equal(result, 'system');
});

test('classifyPath: detects /etc/hosts as system', () => {
  const result = classifyPath('/etc/hosts');
  assert.equal(result, 'system');
});

test('classifyPath: credentials takes priority (credentials path returned, not null)', () => {
  // /Library/Keychains is credentials
  const result = classifyPath('/Library/Keychains/login.keychain-db');
  assert.equal(result, 'credentials');
});

test('classifyPath: Library/Keychains (without leading slash) is credentials', () => {
  const result = classifyPath('/Users/alice/Library/Keychains/login.keychain');
  assert.equal(result, 'credentials');
});

test('classifyPath: returns string (not null) for known sensitive paths', () => {
  const result = classifyPath('/Users/alice/.ssh/config');
  assert.equal(typeof result, 'string');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
