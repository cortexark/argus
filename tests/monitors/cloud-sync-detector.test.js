/**
 * Tests for monitors/cloud-sync-detector.js
 * Validates cloud sync path detection and provider identification.
 */

import assert from 'node:assert/strict';
import { isCloudSyncedPath } from '../../src/monitors/cloud-sync-detector.js';
import { HOME } from '../../src/lib/platform.js';

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

console.log('\n=== cloud-sync-detector tests ===\n');

// --- iCloud detection ---

test('detects iCloud Documents path', () => {
  const result = isCloudSyncedPath(`${HOME}/Library/Mobile Documents/com~apple~CloudDocs/notes.txt`);
  assert.equal(result.synced, true);
  assert.equal(result.provider, 'iCloud');
});

test('detects iCloud Mobile Documents path', () => {
  const result = isCloudSyncedPath(`${HOME}/Library/Mobile Documents/some-app/data.json`);
  assert.equal(result.synced, true);
  assert.equal(result.provider, 'iCloud');
});

// --- Dropbox detection ---

test('detects Dropbox path', () => {
  const result = isCloudSyncedPath(`${HOME}/Dropbox/projects/secret.env`);
  assert.equal(result.synced, true);
  assert.equal(result.provider, 'Dropbox');
});

// --- Google Drive detection ---

test('detects Google Drive path', () => {
  const result = isCloudSyncedPath(`${HOME}/Google Drive/shared/report.pdf`);
  assert.equal(result.synced, true);
  assert.equal(result.provider, 'Google Drive');
});

// --- OneDrive detection ---

test('detects OneDrive path', () => {
  const result = isCloudSyncedPath(`${HOME}/OneDrive/Documents/budget.xlsx`);
  assert.equal(result.synced, true);
  assert.equal(result.provider, 'OneDrive');
});

// --- Non-synced paths ---

test('returns synced: false for regular home directory file', () => {
  const result = isCloudSyncedPath(`${HOME}/projects/myapp/index.js`);
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('returns synced: false for /tmp path', () => {
  const result = isCloudSyncedPath('/tmp/scratch.txt');
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('returns synced: false for /usr path', () => {
  const result = isCloudSyncedPath('/usr/local/bin/node');
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

// --- Edge cases ---

test('returns synced: false for null input', () => {
  const result = isCloudSyncedPath(null);
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('returns synced: false for undefined input', () => {
  const result = isCloudSyncedPath(undefined);
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('returns synced: false for empty string', () => {
  const result = isCloudSyncedPath('');
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('returns synced: false for non-string input', () => {
  const result = isCloudSyncedPath(42);
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('does not false-positive on partial path match', () => {
  // "DropboxBackup" should not match "Dropbox"
  const result = isCloudSyncedPath(`${HOME}/DropboxBackup/file.txt`);
  assert.equal(result.synced, false);
  assert.equal(result.provider, null);
});

test('matches exact cloud sync directory (no trailing slash)', () => {
  const result = isCloudSyncedPath(`${HOME}/Dropbox`);
  assert.equal(result.synced, true);
  assert.equal(result.provider, 'Dropbox');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

export const results = { passed, failed };
