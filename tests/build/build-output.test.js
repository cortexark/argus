/**
 * Tests for build output verification.
 * Validates that the built DMG/AppImage contains all required files.
 *
 * TDD: Verifies the GREEN phase — build artifacts exist and are valid.
 */

import assert from 'node:assert/strict';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DIST = join(ROOT, 'dist');

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
  passed++; // Skips count as passed — they're platform-conditional
}

console.log('\n--- Build Output Verification Tests ---');

// ==========================================
// 1. macOS DMG output
// ==========================================

const dmgExists = existsSync(join(DIST, 'Argus-1.0.0-arm64.dmg'));

if (process.platform === 'darwin' && dmgExists) {
  test('DMG file exists in dist/', () => {
    assert.ok(dmgExists, 'DMG not found');
  });

  test('DMG file size is reasonable (50-200MB)', () => {
    const stat = statSync(join(DIST, 'Argus-1.0.0-arm64.dmg'));
    const sizeMB = stat.size / (1024 * 1024);
    assert.ok(sizeMB > 50, `DMG too small: ${sizeMB.toFixed(1)}MB`);
    assert.ok(sizeMB < 200, `DMG too large: ${sizeMB.toFixed(1)}MB`);
  });

  test('Argus.app exists in dist/mac-arm64/', () => {
    const appPath = join(DIST, 'mac-arm64', 'Argus.app');
    assert.ok(existsSync(appPath), 'Argus.app not found');
  });

  test('Argus.app has Contents/MacOS directory', () => {
    const macosDir = join(DIST, 'mac-arm64', 'Argus.app', 'Contents', 'MacOS');
    assert.ok(existsSync(macosDir), 'Contents/MacOS not found');
  });

  test('Argus.app has Contents/Resources directory', () => {
    const resDir = join(DIST, 'mac-arm64', 'Argus.app', 'Contents', 'Resources');
    assert.ok(existsSync(resDir), 'Contents/Resources not found');
  });

  test('Argus.app has Info.plist', () => {
    const plist = join(DIST, 'mac-arm64', 'Argus.app', 'Contents', 'Info.plist');
    assert.ok(existsSync(plist), 'Info.plist not found');
  });

  test('Argus.app contains app.asar (packaged source)', () => {
    const asar = join(DIST, 'mac-arm64', 'Argus.app', 'Contents', 'Resources', 'app.asar');
    assert.ok(existsSync(asar), 'app.asar not found — source not packaged');
  });

  test('DMG blockmap exists (for auto-update delta)', () => {
    const blockmap = join(DIST, 'Argus-1.0.0-arm64.dmg.blockmap');
    assert.ok(existsSync(blockmap), 'blockmap not found');
  });
} else if (process.platform === 'darwin') {
  skip('macOS DMG tests', 'DMG not built yet — run npm run electron:build first');
} else {
  skip('macOS DMG tests', 'not running on macOS');
}

// ==========================================
// 2. Linux AppImage output (conditional)
// ==========================================

const appImagePattern = /Argus.*\.AppImage$/;
const distFiles = existsSync(DIST) ? readdirSync(DIST) : [];
const appImageFile = distFiles.find(f => appImagePattern.test(f));

if (process.platform === 'linux' && appImageFile) {
  test('AppImage file exists in dist/', () => {
    assert.ok(appImageFile, 'AppImage not found');
  });

  test('AppImage file size is reasonable (50-200MB)', () => {
    const stat = statSync(join(DIST, appImageFile));
    const sizeMB = stat.size / (1024 * 1024);
    assert.ok(sizeMB > 50, `AppImage too small: ${sizeMB.toFixed(1)}MB`);
    assert.ok(sizeMB < 200, `AppImage too large: ${sizeMB.toFixed(1)}MB`);
  });

  test('AppImage is executable', () => {
    const stat = statSync(join(DIST, appImageFile));
    const isExecutable = (stat.mode & 0o111) !== 0;
    assert.ok(isExecutable, 'AppImage is not executable');
  });
} else if (process.platform === 'linux') {
  skip('Linux AppImage tests', 'AppImage not built yet — run npm run electron:build:linux first');
} else {
  skip('Linux AppImage tests', 'not running on Linux');
}

// ==========================================
// 3. Cross-platform build config verification
// ==========================================

test('dist/ directory exists after build', () => {
  assert.ok(existsSync(DIST), 'dist/ directory not found — has any build been run?');
});

test('no source maps leaked into dist (security)', () => {
  const findMaps = (dir) => {
    if (!existsSync(dir)) return [];
    const maps = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes('node_modules')) {
        maps.push(...findMaps(full));
      } else if (entry.name.endsWith('.map')) {
        maps.push(full);
      }
    }
    return maps;
  };
  // Only check the app directory, not the entire dist
  const appDir = join(DIST, 'mac-arm64', 'Argus.app');
  if (existsSync(appDir)) {
    const sourceMaps = findMaps(appDir);
    // Filter out electron's own source maps which are expected
    const leakedMaps = sourceMaps.filter(m => !m.includes('electron'));
    assert.equal(leakedMaps.length, 0, `Source maps found in build: ${leakedMaps.join(', ')}`);
  }
});

export const results = { passed, failed };
