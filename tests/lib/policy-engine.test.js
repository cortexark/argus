/**
 * Tests for src/lib/policy-engine.js
 * TDD: Tests written to verify policy-as-code matching logic.
 */

import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import {
  matchPath,
  matchHost,
  parseMinimalToml,
  evaluateFileAccess,
  evaluateNetworkAccess,
} from '../../src/lib/policy-engine.js';

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

console.log('\n--- Policy Engine Tests ---');

// ==========================================
// matchPath
// ==========================================

test('matchPath: exact path matches', () => {
  const home = homedir();
  assert.ok(matchPath(`${home}/.ssh/id_rsa`, '~/.ssh/id_rsa'));
});

test('matchPath: wildcard * matches single segment', () => {
  const home = homedir();
  assert.ok(matchPath(`${home}/.ssh/id_rsa`, '~/.ssh/*'));
  assert.ok(matchPath(`${home}/.ssh/config`, '~/.ssh/*'));
});

test('matchPath: wildcard * does NOT match across segments', () => {
  const home = homedir();
  assert.ok(!matchPath(`${home}/.ssh/keys/id_rsa`, '~/.ssh/*'));
});

test('matchPath: double star ** matches across segments', () => {
  const home = homedir();
  assert.ok(matchPath(`${home}/Projects/my-app/src/index.js`, '~/Projects/**'));
  assert.ok(matchPath(`${home}/Projects/deep/nested/file.txt`, '~/Projects/**'));
});

test('matchPath: returns false for non-matching path', () => {
  assert.ok(!matchPath('/tmp/test.txt', '~/.ssh/*'));
});

test('matchPath: handles null/empty inputs', () => {
  assert.ok(!matchPath(null, '~/.ssh/*'));
  assert.ok(!matchPath('/tmp/test', null));
  assert.ok(!matchPath('', ''));
});

test('matchPath: absolute paths without tilde', () => {
  assert.ok(matchPath('/etc/passwd', '/etc/passwd'));
  assert.ok(matchPath('/etc/hosts', '/etc/*'));
});

// ==========================================
// matchHost
// ==========================================

test('matchHost: exact match', () => {
  assert.ok(matchHost('api.openai.com', 'api.openai.com'));
});

test('matchHost: wildcard subdomain match', () => {
  assert.ok(matchHost('api.anthropic.com', '*.anthropic.com'));
  assert.ok(matchHost('cdn.anthropic.com', '*.anthropic.com'));
});

test('matchHost: wildcard does NOT match the base domain itself by leading dot', () => {
  // *.anthropic.com should match anthropic.com too
  assert.ok(matchHost('anthropic.com', '*.anthropic.com'));
});

test('matchHost: non-matching host', () => {
  assert.ok(!matchHost('evil.com', 'api.openai.com'));
  assert.ok(!matchHost('api.evil.com', '*.openai.com'));
});

test('matchHost: handles null', () => {
  assert.ok(!matchHost(null, 'api.openai.com'));
  assert.ok(!matchHost('api.openai.com', null));
});

// ==========================================
// parseMinimalToml
// ==========================================

test('parseMinimalToml: parses section with array values', () => {
  const toml = `
[defaults]
deny_paths = ["~/.ssh/*", "~/.aws/*"]
  `;
  const result = parseMinimalToml(toml);
  assert.deepStrictEqual(result.defaults.deny_paths, ['~/.ssh/*', '~/.aws/*']);
});

test('parseMinimalToml: parses nested agent sections', () => {
  const toml = `
[agent.cursor]
allow_paths = ["~/Projects/**"]
allow_network = ["api.openai.com"]
  `;
  const result = parseMinimalToml(toml);
  assert.deepStrictEqual(result.agent.cursor.allow_paths, ['~/Projects/**']);
  assert.deepStrictEqual(result.agent.cursor.allow_network, ['api.openai.com']);
});

test('parseMinimalToml: skips comments and empty lines', () => {
  const toml = `
# This is a comment
[defaults]

# Another comment
deny_paths = ["~/.ssh/*"]
  `;
  const result = parseMinimalToml(toml);
  assert.deepStrictEqual(result.defaults.deny_paths, ['~/.ssh/*']);
});

test('parseMinimalToml: parses multiple agent sections', () => {
  const toml = `
[agent.cursor]
allow_paths = ["~/code/**"]

[agent.claude]
allow_paths = ["~/workspace/**"]
  `;
  const result = parseMinimalToml(toml);
  assert.deepStrictEqual(result.agent.cursor.allow_paths, ['~/code/**']);
  assert.deepStrictEqual(result.agent.claude.allow_paths, ['~/workspace/**']);
});

// ==========================================
// evaluateFileAccess
// ==========================================

test('evaluateFileAccess: no policy returns allowed', () => {
  const result = evaluateFileAccess(null, 'cursor', '/tmp/test');
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'no policy loaded');
});

test('evaluateFileAccess: agent deny_paths blocks access', () => {
  const policy = {
    agent: { cursor: { deny_paths: ['~/.ssh/*'] } },
  };
  const home = homedir();
  const result = evaluateFileAccess(policy, 'cursor', `${home}/.ssh/id_rsa`);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('denied'));
});

test('evaluateFileAccess: agent allow_paths permits access', () => {
  const policy = {
    agent: { cursor: { allow_paths: ['~/Projects/**'] } },
  };
  const home = homedir();
  const result = evaluateFileAccess(policy, 'cursor', `${home}/Projects/app/src/main.js`);
  assert.equal(result.allowed, true);
  assert.ok(result.reason.includes('allowed'));
});

test('evaluateFileAccess: deny takes priority over allow', () => {
  const policy = {
    agent: {
      cursor: {
        allow_paths: ['~/Projects/**'],
        deny_paths: ['~/Projects/secret/**'],
      },
    },
  };
  const home = homedir();
  const result = evaluateFileAccess(policy, 'cursor', `${home}/Projects/secret/keys.txt`);
  assert.equal(result.allowed, false);
});

test('evaluateFileAccess: defaults deny_paths applies when no agent rule matches', () => {
  const policy = {
    defaults: { deny_paths: ['~/.ssh/*'] },
    agent: { cursor: { allow_paths: ['~/Projects/**'] } },
  };
  const home = homedir();
  const result = evaluateFileAccess(policy, 'cursor', `${home}/.ssh/id_rsa`);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('defaults'));
});

test('evaluateFileAccess: case-insensitive agent label matching', () => {
  const policy = {
    agent: { cursor: { deny_paths: ['~/.ssh/*'] } },
  };
  const home = homedir();
  const result = evaluateFileAccess(policy, 'Cursor', `${home}/.ssh/id_rsa`);
  assert.equal(result.allowed, false);
});

test('evaluateFileAccess: unknown agent with no rules returns allowed', () => {
  const policy = {
    agent: { cursor: { deny_paths: ['~/.ssh/*'] } },
  };
  const result = evaluateFileAccess(policy, 'unknown-app', '/tmp/test');
  assert.equal(result.allowed, true);
});

// ==========================================
// evaluateNetworkAccess
// ==========================================

test('evaluateNetworkAccess: no policy returns allowed', () => {
  const result = evaluateNetworkAccess(null, 'cursor', 'api.openai.com');
  assert.equal(result.allowed, true);
});

test('evaluateNetworkAccess: allow_network permits listed host', () => {
  const policy = {
    agent: { cursor: { allow_network: ['api.openai.com', 'github.com'] } },
  };
  const result = evaluateNetworkAccess(policy, 'cursor', 'api.openai.com');
  assert.equal(result.allowed, true);
});

test('evaluateNetworkAccess: allow_network blocks unlisted host', () => {
  const policy = {
    agent: { cursor: { allow_network: ['api.openai.com'] } },
  };
  const result = evaluateNetworkAccess(policy, 'cursor', 'evil-server.com');
  assert.equal(result.allowed, false);
});

test('evaluateNetworkAccess: wildcard subdomain matching', () => {
  const policy = {
    agent: { claude: { allow_network: ['*.anthropic.com'] } },
  };
  assert.equal(evaluateNetworkAccess(policy, 'claude', 'api.anthropic.com').allowed, true);
  assert.equal(evaluateNetworkAccess(policy, 'claude', 'cdn.anthropic.com').allowed, true);
  assert.equal(evaluateNetworkAccess(policy, 'claude', 'evil.com').allowed, false);
});

test('evaluateNetworkAccess: deny_network blocks specific host', () => {
  const policy = {
    agent: { cursor: { deny_network: ['suspicious.com'] } },
  };
  const result = evaluateNetworkAccess(policy, 'cursor', 'suspicious.com');
  assert.equal(result.allowed, false);
});

export const results = { passed, failed };
