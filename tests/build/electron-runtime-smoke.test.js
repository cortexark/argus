/**
 * Electron runtime smoke test.
 *
 * Why this exists:
 * We hit a production failure where Argus launched, but backend startup failed
 * because better-sqlite3 was compiled for Node ABI and not Electron ABI:
 *   "compiled against NODE_MODULE_VERSION 127, requires 132"
 *
 * This test runs Argus backend startup inside Electron's runtime (headless,
 * via ELECTRON_RUN_AS_NODE) and asserts /api/status becomes reachable.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ELECTRON_BIN = join(ROOT, 'node_modules', '.bin', 'electron');
const SMOKE_SCRIPT = join(ROOT, 'tests', 'build', 'fixtures', 'electron-runtime-smoke.cjs');

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

function skip(name, reason) {
  console.log(`  SKIP: ${name} (${reason})`);
  passed++;
}

console.log('\n--- Electron Runtime Smoke Tests ---');

if (process.env.ARGUS_RUN_ELECTRON_SMOKE !== '1') {
  skip('electron runtime smoke', 'set ARGUS_RUN_ELECTRON_SMOKE=1 to enable');
} else {
  test('Electron runtime starts backend and serves /api/status', () => {
    assert.ok(existsSync(ELECTRON_BIN), 'electron binary not found');
    assert.ok(existsSync(SMOKE_SCRIPT), 'smoke fixture script not found');

    const run = spawnSync(ELECTRON_BIN, [SMOKE_SCRIPT], {
      cwd: ROOT,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      encoding: 'utf8',
      timeout: 45000,
    });

    if (run.status !== 0) {
      const output = [run.stdout, run.stderr].filter(Boolean).join('\n');
      const hint = output.includes('NODE_MODULE_VERSION')
        ? '\nHint: run `npm run electron:rebuild` before packaging/running Electron.'
        : '';
      assert.fail(`electron runtime smoke failed (exit ${run.status}).\n${output}${hint}`);
    }
  });
}

console.log('\n------------------------------------');
console.log(`  Total: ${passed} passed, ${failed} failed`);
console.log('------------------------------------\n');

process.exit(failed > 0 ? 1 : 0);

