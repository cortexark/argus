/**
 * Tests for GitHub release workflow behavior.
 *
 * These checks are intentionally compatible with both the current
 * "test then release" workflow and newer artifact-based release variants.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RELEASE_WORKFLOW = join(ROOT, '.github', 'workflows', 'release.yml');

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

console.log('\n--- Release Workflow Tests ---');

test('release workflow file exists', () => {
  assert.ok(existsSync(RELEASE_WORKFLOW), 'release workflow not found');
});

test('release workflow triggers on version tags', () => {
  const yml = readFileSync(RELEASE_WORKFLOW, 'utf8');
  assert.ok(yml.includes("tags:"), 'workflow should define tag trigger');
  assert.ok(yml.includes("v*.*.*"), 'workflow should run on semantic version tags');
});

test('release workflow runs tests before release', () => {
  const yml = readFileSync(RELEASE_WORKFLOW, 'utf8');
  assert.ok(yml.includes('npm test'), 'workflow should execute npm test in validation job');
  assert.ok(yml.includes('needs: test'), 'release job should depend on test job');
});

test('release workflow uses softprops/action-gh-release', () => {
  const yml = readFileSync(RELEASE_WORKFLOW, 'utf8');
  assert.ok(
    yml.includes('softprops/action-gh-release@v2'),
    'workflow should create releases via softprops/action-gh-release'
  );
});

test('artifact release mode is internally consistent when enabled', () => {
  const yml = readFileSync(RELEASE_WORKFLOW, 'utf8');
  const hasBuildArtifactMode =
    yml.includes('npm run electron:build') ||
    yml.includes('actions/upload-artifact') ||
    yml.includes('actions/download-artifact') ||
    yml.includes('files:');

  if (!hasBuildArtifactMode) return;

  assert.ok(
    yml.includes('npm run electron:build'),
    'if artifact mode is enabled, workflow should build the Electron release artifact'
  );
  assert.ok(
    yml.includes('actions/upload-artifact') && yml.includes('actions/download-artifact'),
    'if artifact mode is enabled, upload/download artifact steps should both exist'
  );
  assert.ok(
    yml.includes('files:') && yml.includes('.dmg'),
    'if artifact mode is enabled, the release step should attach DMG assets'
  );
});

console.log('\n------------------------------------');
console.log(`  Total: ${passed} passed, ${failed} failed`);
console.log('------------------------------------\n');

export const results = { passed, failed };
