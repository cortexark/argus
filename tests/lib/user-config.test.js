/**
 * Tests for lib/user-config.js — loadUserConfig and mergeConfig.
 */

import { loadUserConfig, mergeConfig } from '../../src/lib/user-config.js';
import { writeFileSync, mkdirSync } from 'node:fs';
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

function assertDeepEqual(a, b, msg) {
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  if (aStr !== bStr) throw new Error(msg || `Expected ${bStr}, got ${aStr}`);
}

console.log('\n=== user-config tests ===\n');

// --- loadUserConfig tests ---

test('loadUserConfig returns null when no file exists', () => {
  const result = loadUserConfig('/tmp/nonexistent-argus-config-12345.json');
  assertEqual(result, null);
});

test('loadUserConfig returns null for invalid JSON', () => {
  const tmpPath = join(tmpdir(), 'argus-test-invalid.json');
  writeFileSync(tmpPath, 'not valid json {{{');
  const result = loadUserConfig(tmpPath);
  assertEqual(result, null);
});

test('loadUserConfig returns null for non-object config (array)', () => {
  const tmpPath = join(tmpdir(), 'argus-test-array.json');
  writeFileSync(tmpPath, '["not", "an", "object"]');
  const result = loadUserConfig(tmpPath);
  assertEqual(result, null);
});

test('loadUserConfig returns null for non-object config (string)', () => {
  const tmpPath = join(tmpdir(), 'argus-test-string.json');
  writeFileSync(tmpPath, '"just a string"');
  const result = loadUserConfig(tmpPath);
  assertEqual(result, null);
});

test('loadUserConfig returns null for non-object config (number)', () => {
  const tmpPath = join(tmpdir(), 'argus-test-number.json');
  writeFileSync(tmpPath, '42');
  const result = loadUserConfig(tmpPath);
  assertEqual(result, null);
});

test('loadUserConfig returns null for config with unknown keys', () => {
  const tmpPath = join(tmpdir(), 'argus-test-unknown.json');
  writeFileSync(tmpPath, JSON.stringify({ unknown_key: 'value' }));
  const result = loadUserConfig(tmpPath);
  assertEqual(result, null);
});

test('loadUserConfig returns valid config object', () => {
  const tmpPath = join(tmpdir(), 'argus-test-valid.json');
  const validConfig = {
    sensitive_paths: { credentials: ['~/my-keys'] },
    ai_endpoints: [{ pattern: 'api.example.com', service: 'Example' }],
    ai_apps: { 'my-tool': { name: 'My Tool', category: 'AI Editor' } },
  };
  writeFileSync(tmpPath, JSON.stringify(validConfig));
  const result = loadUserConfig(tmpPath);
  assert(result !== null, 'should return config');
  assertDeepEqual(result.sensitive_paths, validConfig.sensitive_paths);
  assertDeepEqual(result.ai_endpoints, validConfig.ai_endpoints);
});

test('loadUserConfig accepts config with only _comment', () => {
  const tmpPath = join(tmpdir(), 'argus-test-comment.json');
  writeFileSync(tmpPath, JSON.stringify({ _comment: 'test' }));
  const result = loadUserConfig(tmpPath);
  assert(result !== null, 'should return config with just _comment');
});

// --- mergeConfig tests ---

const defaultConfig = {
  sensitive_paths: {
    credentials: ['.ssh', '.aws'],
    documents: ['/Documents'],
  },
  ai_endpoints: [
    { pattern: 'api.anthropic.com', service: 'Anthropic' },
  ],
  ai_apps: {
    claude: { name: 'Claude', category: 'LLM' },
  },
};

test('mergeConfig handles null userConfig', () => {
  const result = mergeConfig(defaultConfig, null);
  assertDeepEqual(result.sensitive_paths, defaultConfig.sensitive_paths);
  assertDeepEqual(result.ai_endpoints, defaultConfig.ai_endpoints);
  assertDeepEqual(result.ai_apps, defaultConfig.ai_apps);
});

test('mergeConfig handles undefined userConfig', () => {
  const result = mergeConfig(defaultConfig, undefined);
  assertDeepEqual(result.sensitive_paths, defaultConfig.sensitive_paths);
});

test('mergeConfig merges sensitive_paths arrays (appended, not replaced)', () => {
  const userConfig = {
    sensitive_paths: {
      credentials: ['~/my-custom-keys'],
      documents: ['~/Private'],
    },
  };
  const result = mergeConfig(defaultConfig, userConfig);
  assertDeepEqual(result.sensitive_paths.credentials, ['.ssh', '.aws', '~/my-custom-keys']);
  assertDeepEqual(result.sensitive_paths.documents, ['/Documents', '~/Private']);
});

test('mergeConfig adds new sensitive_path categories from user', () => {
  const userConfig = {
    sensitive_paths: {
      custom: ['~/secret-stuff'],
    },
  };
  const result = mergeConfig(defaultConfig, userConfig);
  assertDeepEqual(result.sensitive_paths.custom, ['~/secret-stuff']);
  // defaults preserved
  assertDeepEqual(result.sensitive_paths.credentials, ['.ssh', '.aws']);
});

test('mergeConfig appends ai_endpoints from user', () => {
  const userConfig = {
    ai_endpoints: [
      { pattern: 'api.custom-llm.com', service: 'Custom LLM' },
    ],
  };
  const result = mergeConfig(defaultConfig, userConfig);
  assertEqual(result.ai_endpoints.length, 2);
  assertEqual(result.ai_endpoints[0].service, 'Anthropic');
  assertEqual(result.ai_endpoints[1].service, 'Custom LLM');
});

test('mergeConfig merges ai_apps from user', () => {
  const userConfig = {
    ai_apps: {
      'my-tool': { name: 'My Tool', category: 'AI Editor' },
    },
  };
  const result = mergeConfig(defaultConfig, userConfig);
  assertEqual(result.ai_apps.claude.name, 'Claude');
  assertEqual(result.ai_apps['my-tool'].name, 'My Tool');
});

test('mergeConfig freezes result object', () => {
  const result = mergeConfig(defaultConfig, null);
  assert(Object.isFrozen(result), 'top-level should be frozen');
  assert(Object.isFrozen(result.sensitive_paths), 'sensitive_paths should be frozen');
  assert(Object.isFrozen(result.ai_endpoints), 'ai_endpoints should be frozen');
  assert(Object.isFrozen(result.ai_apps), 'ai_apps should be frozen');
});

test('mergeConfig does not mutate defaultConfig', () => {
  const originalCredentials = [...defaultConfig.sensitive_paths.credentials];
  const userConfig = {
    sensitive_paths: { credentials: ['~/extra'] },
  };
  mergeConfig(defaultConfig, userConfig);
  assertDeepEqual(defaultConfig.sensitive_paths.credentials, originalCredentials);
});

test('mergeConfig with empty userConfig sections', () => {
  const userConfig = {
    sensitive_paths: {},
    ai_endpoints: [],
    ai_apps: {},
  };
  const result = mergeConfig(defaultConfig, userConfig);
  assertDeepEqual(result.sensitive_paths, defaultConfig.sensitive_paths);
  assertEqual(result.ai_endpoints.length, 1);
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };
