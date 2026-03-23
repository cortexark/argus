/**
 * Tests for Electron build configuration and prerequisites.
 * Validates that all required files, configs, and assets exist
 * before attempting a build.
 *
 * TDD: RED phase — these test the build contract.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

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

console.log('\n--- Build Configuration Tests ---');

// ==========================================
// 1. Package.json build config
// ==========================================

test('package.json exists and is valid JSON', () => {
  const pkgPath = join(ROOT, 'package.json');
  assert.ok(existsSync(pkgPath), 'package.json not found');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.name, 'package.json missing name');
  assert.ok(pkg.version, 'package.json missing version');
});

test('package.json has build config for electron-builder', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.build, 'missing build config');
  assert.ok(pkg.build.appId, 'missing build.appId');
  assert.ok(pkg.build.productName, 'missing build.productName');
});

test('build.appId follows reverse-domain convention', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const appId = pkg.build.appId;
  assert.ok(appId.includes('.'), 'appId should use reverse-domain notation');
  assert.ok(appId.split('.').length >= 3, 'appId should have at least 3 segments');
});

test('build config has mac target (dmg)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.build.mac, 'missing build.mac config');
  assert.equal(pkg.build.mac.target, 'dmg', 'mac target should be dmg');
  assert.ok(pkg.build.mac.category, 'missing mac category');
});

test('build config has linux target (AppImage)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.build.linux, 'missing build.linux config');
  assert.equal(pkg.build.linux.target, 'AppImage', 'linux target should be AppImage');
  assert.ok(pkg.build.linux.category, 'missing linux category');
});

test('build config has darkModeSupport for mac', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.build.mac.darkModeSupport, true, 'mac should support dark mode');
});

test('build.extraMetadata.main points to electron/main.js', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.build.extraMetadata, 'missing extraMetadata');
  assert.equal(pkg.build.extraMetadata.main, 'electron/main.js', 'main entry should be electron/main.js');
});

test('build.files includes required directories', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = pkg.build.files;
  assert.ok(Array.isArray(files), 'build.files should be an array');
  assert.ok(files.some(f => f.includes('src')), 'build.files should include src/');
  assert.ok(files.some(f => f.includes('electron')), 'build.files should include electron/');
  assert.ok(files.some(f => f.includes('package.json')), 'build.files should include package.json');
});

// ==========================================
// 2. Electron entry points
// ==========================================

test('electron/main.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'electron', 'main.js')), 'electron/main.js not found');
});

test('electron/preload.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'electron', 'preload.js')), 'electron/preload.js not found');
});

test('electron/tray.js exists', () => {
  assert.ok(existsSync(join(ROOT, 'electron', 'tray.js')), 'electron/tray.js not found');
});

// ==========================================
// 3. Icon assets
// ==========================================

test('icon.png exists and is valid PNG (512x512 app icon)', () => {
  const iconPath = join(ROOT, 'electron', 'assets', 'icon.png');
  assert.ok(existsSync(iconPath), 'icon.png not found');
  const stat = statSync(iconPath);
  assert.ok(stat.size > 100, 'icon.png is too small — likely corrupt');
  // Check PNG magic bytes
  const buf = readFileSync(iconPath);
  assert.equal(buf[0], 0x89, 'icon.png missing PNG magic byte');
  assert.equal(buf[1], 0x50, 'icon.png missing PNG magic byte (P)');
  assert.equal(buf[2], 0x4E, 'icon.png missing PNG magic byte (N)');
  assert.equal(buf[3], 0x47, 'icon.png missing PNG magic byte (G)');
});

test('iconTemplate.png exists (macOS tray 16x16)', () => {
  const iconPath = join(ROOT, 'electron', 'assets', 'iconTemplate.png');
  assert.ok(existsSync(iconPath), 'iconTemplate.png not found');
  const buf = readFileSync(iconPath);
  assert.equal(buf[0], 0x89, 'not a valid PNG');
  assert.ok(buf.length > 50, 'icon too small');
});

test('iconTemplate@2x.png exists (macOS tray 32x32 retina)', () => {
  const iconPath = join(ROOT, 'electron', 'assets', 'iconTemplate@2x.png');
  assert.ok(existsSync(iconPath), 'iconTemplate@2x.png not found');
  const buf = readFileSync(iconPath);
  assert.equal(buf[0], 0x89, 'not a valid PNG');
  assert.ok(buf.length > 50, 'icon too small');
});

test('build config icon path references existing file', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const macIcon = join(ROOT, pkg.build.mac.icon);
  const linuxIcon = join(ROOT, pkg.build.linux.icon);
  assert.ok(existsSync(macIcon), `mac icon not found: ${pkg.build.mac.icon}`);
  assert.ok(existsSync(linuxIcon), `linux icon not found: ${pkg.build.linux.icon}`);
});

// ==========================================
// 4. Source files included in build
// ==========================================

test('src/index.js exists (backend entry)', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'index.js')), 'src/index.js not found');
});

test('src/web/ui/index.html exists (dashboard)', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'web', 'ui', 'index.html')), 'dashboard HTML not found');
});

test('src/web/server.js exists (web server)', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'web', 'server.js')), 'web server not found');
});

test('src/cli.js exists (CLI entry)', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'cli.js')), 'CLI entry not found');
});

// ==========================================
// 5. Dependencies
// ==========================================

test('electron is in devDependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies.electron, 'electron not in devDependencies');
});

test('electron-builder is in devDependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies['electron-builder'], 'electron-builder not in devDependencies');
});

test('menubar is in devDependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies.menubar, 'menubar not in devDependencies');
});

test('better-sqlite3 is in dependencies (native module)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['better-sqlite3'], 'better-sqlite3 not in dependencies');
});

test('@electron/rebuild is in devDependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies['@electron/rebuild'], '@electron/rebuild not in devDependencies');
});

// ==========================================
// 6. Build scripts
// ==========================================

test('npm scripts include electron:build for mac', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['electron:build'], 'missing electron:build script');
  assert.ok(pkg.scripts['electron:build'].includes('--mac'), 'electron:build should target mac');
});

test('npm scripts include electron:build:linux', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['electron:build:linux'], 'missing electron:build:linux script');
  assert.ok(pkg.scripts['electron:build:linux'].includes('--linux'), 'should target linux');
});

test('npm scripts include electron:rebuild for native modules', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['electron:rebuild'], 'missing electron:rebuild script');
  assert.ok(pkg.scripts['electron:rebuild'].includes('better-sqlite3'), 'should rebuild better-sqlite3');
});

test('npm scripts include electron:dev for development', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['electron:dev'], 'missing electron:dev script');
});

// ==========================================
// 7. Package metadata for distribution
// ==========================================

test('package.json has repository field', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.repository, 'missing repository field');
  assert.ok(pkg.repository.url.includes('cortexark/argus'), 'repository URL should point to cortexark/argus');
});

test('package.json has license field', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.license, 'MIT', 'license should be MIT');
});

test('package.json has keywords for npm discoverability', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.keywords), 'keywords should be an array');
  assert.ok(pkg.keywords.length >= 5, 'should have at least 5 keywords');
  assert.ok(pkg.keywords.includes('ai'), 'should include ai keyword');
  assert.ok(pkg.keywords.includes('security'), 'should include security keyword');
});

test('package.json has homepage field', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.homepage, 'missing homepage');
  assert.ok(pkg.homepage.includes('github.com'), 'homepage should be GitHub URL');
});

test('LICENSE file exists', () => {
  assert.ok(existsSync(join(ROOT, 'LICENSE')), 'LICENSE file not found');
});

// ==========================================
// 8. Platform-specific source code checks
// ==========================================

test('main.js selects correct icon for platform', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(mainJs.includes("process.platform === 'darwin'"), 'should check for darwin platform');
  assert.ok(mainJs.includes('iconTemplate.png'), 'should use iconTemplate.png on macOS');
  assert.ok(mainJs.includes('icon.png'), 'should use icon.png on non-macOS');
});

test('main.js hides dock icon on macOS', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(mainJs.includes('dock?.hide'), 'should hide dock icon on macOS');
});

test('main.js uses single instance lock', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(mainJs.includes('requestSingleInstanceLock'), 'should use single instance lock');
});

test('preload.js uses contextBridge (secure pattern)', () => {
  const preload = readFileSync(join(ROOT, 'electron', 'preload.js'), 'utf8');
  assert.ok(preload.includes('contextBridge'), 'should use contextBridge');
  assert.ok(preload.includes('exposeInMainWorld'), 'should use exposeInMainWorld');
});

test('main.js disables nodeIntegration in renderer', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(mainJs.includes('nodeIntegration: false'), 'should disable nodeIntegration');
  assert.ok(mainJs.includes('contextIsolation: true'), 'should enable contextIsolation');
});

export const results = { passed, failed };
