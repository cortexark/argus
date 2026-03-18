/**
 * Main test runner for argus
 * Runs all test files and reports aggregate results
 */

const testFiles = [
  './lib/lsof-parser.test.js',
  './lib/ss-parser.test.js',
  './lib/netstat-parser.test.js',
  './db/store.test.js',
  './monitors/process-scanner.test.js',
  './monitors/process-classifier.test.js',
  './monitors/file-monitor.test.js',
  './monitors/network-monitor.test.js',
  './monitors/browser-monitor.test.js',
  './monitors/injection-detector.test.js',
  './report/report-generator.test.js',
  './daemon/daemon-manager.test.js',
  './notifications/notifier.test.js',
  './cli/logs.test.js',
  './daemon/ipc-client.test.js',
  './web/server.test.js',
  './lib/duration.test.js',
  './lib/digest-html.test.js',
  './lib/digest.test.js',
  './db/queries.test.js',
  './lib/baseline-engine.test.js',
  './cli/export.test.js',
];

let totalPassed = 0;
let totalFailed = 0;
const fileResults = [];

console.log('\n====================================');
console.log('         AI WATCHER TEST SUITE      ');
console.log('====================================');

for (const file of testFiles) {
  try {
    const mod = await import(file);
    if (mod.results) {
      totalPassed += mod.results.passed;
      totalFailed += mod.results.failed;
      fileResults.push({ file, ...mod.results });
    }
  } catch (err) {
    console.log(`\nERROR loading ${file}: ${err.message}`);
    if (err.stack) {
      console.log(err.stack.split('\n').slice(0, 5).join('\n'));
    }
    totalFailed++;
    fileResults.push({ file, passed: 0, failed: 1, error: err.message });
  }
}

console.log('\n====================================');
console.log('              SUMMARY               ');
console.log('====================================');

for (const { file, passed, failed, error } of fileResults) {
  const status = failed === 0 ? 'PASS' : 'FAIL';
  const shortFile = file.replace('./', 'tests/');
  if (error) {
    console.log(`  [LOAD ERROR] ${shortFile}: ${error}`);
  } else {
    console.log(`  [${status}] ${shortFile}: ${passed} passed, ${failed} failed`);
  }
}

console.log('\n------------------------------------');
console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed`);
console.log('------------------------------------\n');

process.exit(totalFailed > 0 ? 1 : 0);
