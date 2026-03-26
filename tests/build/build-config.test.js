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

test('menubar is in dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies.menubar, 'menubar not in dependencies');
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

test('electron:dev rebuilds native modules before launching Electron', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts['electron:dev'];
  assert.ok(script, 'missing electron:dev script');
  assert.ok(script.includes('electron:rebuild'), 'electron:dev must run electron:rebuild first');
});

test('npm scripts include electron:build for mac', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts['electron:build'];
  assert.ok(script, 'missing electron:build script');
  assert.ok(script.includes('electron:rebuild'), 'electron:build must run electron:rebuild first');
  assert.ok(script.includes('--mac'), 'electron:build should target mac');
});

test('npm scripts include electron:build:linux', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts['electron:build:linux'];
  assert.ok(script, 'missing electron:build:linux script');
  assert.ok(script.includes('electron:rebuild'), 'electron:build:linux must run electron:rebuild first');
  assert.ok(script.includes('--linux'), 'should target linux');
});

test('npm scripts include electron:rebuild for native modules', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['electron:rebuild'], 'missing electron:rebuild script');
  assert.ok(pkg.scripts['electron:rebuild'].includes('better-sqlite3'), 'should rebuild better-sqlite3');
});

test('npm scripts include node:rebuild for Node test ABI', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['node:rebuild'], 'missing node:rebuild script');
  assert.ok(pkg.scripts['node:rebuild'].includes('better-sqlite3'), 'node:rebuild should rebuild better-sqlite3');
});

test('npm test rebuilds native modules for Node before running tests', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts.test;
  assert.ok(script, 'missing test script');
  assert.ok(script.includes('node:rebuild'), 'test must run node:rebuild first');
});

test('npm scripts include standalone electron runtime smoke test', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts['test:electron-runtime'];
  assert.ok(script, 'missing test:electron-runtime script');
  assert.ok(script.includes('electron:rebuild'), 'test:electron-runtime must run electron:rebuild first');
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

test('main.js does not reload webContents on menubar show', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(!mainJs.includes("mb.on('after-show'"), 'should not bind after-show reload handler');
  assert.ok(!mainJs.includes('webContents.reload'), 'should avoid forced reloads that can blank the UI');
});

test('main.js enables GPU-safe settings for menubar stability', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(
    mainJs.includes("appendSwitch('disable-gpu-compositing')"),
    'should disable GPU compositing for stability'
  );
});

test('main.js shows clear first-run install messaging with mode choice', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(mainJs.includes('Welcome to Argus'), 'should show welcome messaging on first launch');
  assert.ok(mainJs.includes('Start in Basic Mode'), 'should offer low-permission basic mode');
  assert.ok(mainJs.includes('Enable Deep Monitoring'), 'should offer opt-in deep mode');
  assert.ok(mainJs.includes('ARGUS_PRIVACY_MODE'), 'should persist selected privacy mode');
});

test('main.js sets explicit BrowserWindow background color', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(
    mainJs.includes("backgroundColor: '#0a0e14'"),
    'should set a deterministic window background color'
  );
});

test('main.js does not preload menubar window (reduce idle memory)', () => {
  const mainJs = readFileSync(join(ROOT, 'electron', 'main.js'), 'utf8');
  assert.ok(
    mainJs.includes('preloadWindow: false'),
    'preloadWindow should be false to avoid keeping hidden renderer alive'
  );
});

test('config.js exposes privacy mode flags', () => {
  const cfg = readFileSync(join(ROOT, 'src', 'lib', 'config.js'), 'utf8');
  assert.ok(cfg.includes('PRIVACY_MODE'), 'config should expose PRIVACY_MODE');
  assert.ok(cfg.includes('DEEP_MONITORING'), 'config should expose DEEP_MONITORING');
});

test('dashboard switchTab has safe fallback to overview', () => {
  const uiHtml = readFileSync(join(ROOT, 'src', 'web', 'ui', 'index.html'), 'utf8');
  assert.ok(
    uiHtml.includes("if (typeof name !== 'string' || !name) name = 'overview';"),
    'switchTab should fallback to overview when tab name is invalid'
  );
  assert.ok(
    uiHtml.includes("target = document.getElementById('tab-overview');"),
    'switchTab should recover by activating tab-overview'
  );
});

test('dashboard CSS avoids backdrop-filter to reduce compositor glitches', () => {
  const uiHtml = readFileSync(join(ROOT, 'src', 'web', 'ui', 'index.html'), 'utf8');
  assert.ok(
    !uiHtml.includes('backdrop-filter'),
    'dashboard should avoid backdrop-filter to reduce black-window rendering glitches'
  );
});

test('dashboard pauses refresh loop when hidden to reduce background usage', () => {
  const uiHtml = readFileSync(join(ROOT, 'src', 'web', 'ui', 'index.html'), 'utf8');
  assert.ok(
    uiHtml.includes("document.addEventListener('visibilitychange'"),
    'dashboard should react to visibility changes'
  );
  assert.ok(
    uiHtml.includes('stopRefreshLoop()'),
    'dashboard should stop refresh interval while hidden'
  );
  assert.ok(
    uiHtml.includes('startRefreshLoop()'),
    'dashboard should resume refresh interval when visible'
  );
});

test('dashboard exposes privacy mode toggle control', () => {
  const uiHtml = readFileSync(join(ROOT, 'src', 'web', 'ui', 'index.html'), 'utf8');
  assert.ok(
    uiHtml.includes('id="modeToggleBtn"'),
    'dashboard should render a mode toggle button in the header'
  );
  assert.ok(
    uiHtml.includes('/api/privacy-mode'),
    'dashboard should reference /api/privacy-mode when toggling mode'
  );
});

test('web server exposes /api/privacy-mode endpoint', () => {
  const serverJs = readFileSync(join(ROOT, 'src', 'web', 'server.js'), 'utf8');
  assert.ok(
    serverJs.includes("path === '/api/privacy-mode'"),
    'server should expose POST /api/privacy-mode'
  );
});

test('dashboard exposes restart control and restart API call', () => {
  const uiHtml = readFileSync(join(ROOT, 'src', 'web', 'ui', 'index.html'), 'utf8');
  assert.ok(
    uiHtml.includes('id="restartBtn"'),
    'dashboard should render Restart Argus button'
  );
  assert.ok(
    uiHtml.includes('/api/app/restart'),
    'dashboard should reference /api/app/restart when restart button is clicked'
  );
});

test('web server exposes /api/app/restart endpoint', () => {
  const serverJs = readFileSync(join(ROOT, 'src', 'web', 'server.js'), 'utf8');
  assert.ok(
    serverJs.includes("path === '/api/app/restart'"),
    'server should expose POST /api/app/restart'
  );
});

test('dashboard exposes uninstall controls and API calls', () => {
  const uiHtml = readFileSync(join(ROOT, 'src', 'web', 'ui', 'index.html'), 'utf8');
  assert.ok(
    uiHtml.includes('id="uninstallBtn"'),
    'dashboard should render Uninstall button'
  );
  assert.ok(
    uiHtml.includes("postJSON('/api/app/uninstall-service'"),
    'dashboard should call /api/app/uninstall-service'
  );
  assert.ok(
    uiHtml.includes("postJSON('/api/app/uninstall-data'"),
    'dashboard should call /api/app/uninstall-data'
  );
});

test('web server exposes uninstall endpoints', () => {
  const serverJs = readFileSync(join(ROOT, 'src', 'web', 'server.js'), 'utf8');
  assert.ok(
    serverJs.includes("path === '/api/app/uninstall-info'"),
    'server should expose GET /api/app/uninstall-info'
  );
  assert.ok(
    serverJs.includes("path === '/api/app/uninstall-service'"),
    'server should expose POST /api/app/uninstall-service'
  );
  assert.ok(
    serverJs.includes("path === '/api/app/uninstall-data'"),
    'server should expose POST /api/app/uninstall-data'
  );
});

test('tray menu uses right-click popup on macOS (avoids overlap with menubar window)', () => {
  const trayJs = readFileSync(join(ROOT, 'electron', 'tray.js'), 'utf8');
  assert.ok(
    trayJs.includes("process.platform !== 'darwin'"),
    'tray should branch behavior for macOS vs other platforms'
  );
  assert.ok(
    trayJs.includes("mb.tray.on('right-click'"),
    'tray should open context menu on right-click for macOS'
  );
  assert.ok(
    trayJs.includes('popUpContextMenu'),
    'tray should use popUpContextMenu on macOS'
  );
});

test('tray Generate Report opens report modal instead of non-existent report tab', () => {
  const trayJs = readFileSync(join(ROOT, 'electron', 'tray.js'), 'utf8');
  assert.ok(
    trayJs.includes("window.openReportModal"),
    'tray Generate Report should call openReportModal when available'
  );
  assert.ok(
    trayJs.includes("document.getElementById('reportBtn')"),
    'tray Generate Report should fallback to clicking #reportBtn'
  );
  assert.ok(
    !trayJs.includes("data-tab=\\\"report\\\""),
    'tray should not target a data-tab=\"report\" element because that tab does not exist'
  );
});

export const results = { passed, failed };
