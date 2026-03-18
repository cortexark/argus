/**
 * Tests for monitors/network-monitor.js
 * RED phase: tests should fail until implementation exists
 */

import assert from 'node:assert/strict';
import { matchAIEndpoint, extractPort } from '../../src/monitors/network-monitor.js';

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

console.log('\n=== network-monitor tests ===\n');

// --- matchAIEndpoint ---

test('matchAIEndpoint: returns service name for Anthropic API', () => {
  const result = matchAIEndpoint('api.anthropic.com:443');
  assert.ok(result !== null, 'should match Anthropic');
  assert.ok(result.toLowerCase().includes('anthropic') || result.toLowerCase().includes('claude'));
});

test('matchAIEndpoint: returns service name for OpenAI API', () => {
  const result = matchAIEndpoint('api.openai.com:443');
  assert.ok(result !== null, 'should match OpenAI');
});

test('matchAIEndpoint: returns service name for Mistral', () => {
  const result = matchAIEndpoint('api.mistral.ai:443');
  assert.ok(result !== null, 'should match Mistral');
});

test('matchAIEndpoint: returns null for unknown endpoint', () => {
  const result = matchAIEndpoint('www.google.com:80');
  assert.equal(result, null, 'google should not match');
});

test('matchAIEndpoint: returns null for empty string', () => {
  const result = matchAIEndpoint('');
  assert.equal(result, null);
});

test('matchAIEndpoint: returns null for null input', () => {
  const result = matchAIEndpoint(null);
  assert.equal(result, null);
});

test('matchAIEndpoint: handles IP address format', () => {
  // IP addresses generally won't match AI endpoints, so should return null
  const result = matchAIEndpoint('1.2.3.4:443');
  assert.equal(result, null);
});

test('matchAIEndpoint: matches cursor.sh', () => {
  const result = matchAIEndpoint('cursor.sh:443');
  assert.ok(result !== null, 'should match cursor.sh');
});

test('matchAIEndpoint: matches openrouter.ai', () => {
  const result = matchAIEndpoint('openrouter.ai:443');
  assert.ok(result !== null, 'should match openrouter.ai');
});

test('matchAIEndpoint: matches partial hostname containing pattern', () => {
  const result = matchAIEndpoint('some-subdomain.api.anthropic.com:443');
  assert.ok(result !== null, 'should match subdomain of anthropic');
});

// --- extractPort ---

test('extractPort: extracts port from simple IP:PORT format', () => {
  const result = extractPort('192.168.1.1:8080');
  assert.equal(result, 8080);
});

test('extractPort: extracts remote port from arrow format LOCAL->REMOTE', () => {
  // Format: "192.168.1.1:54321->104.20.1.1:443"
  // Remote port is 443
  const result = extractPort('192.168.1.1:54321->104.20.1.1:443');
  assert.equal(result, 443);
});

test('extractPort: extracts port 443 from HTTPS connection', () => {
  const result = extractPort('10.0.0.1:12345->api.anthropic.com:443');
  assert.equal(result, 443);
});

test('extractPort: extracts port 80 from HTTP connection', () => {
  const result = extractPort('10.0.0.1:9999->example.com:80');
  assert.equal(result, 80);
});

test('extractPort: returns null for empty string', () => {
  const result = extractPort('');
  assert.equal(result, null);
});

test('extractPort: returns null for string with no port', () => {
  const result = extractPort('somehost');
  assert.equal(result, null);
});

test('extractPort: returns integer not string', () => {
  const result = extractPort('1.2.3.4:9090');
  assert.equal(typeof result, 'number');
});

test('extractPort: handles IPv6-like bracket notation', () => {
  // Should not throw even if format is unexpected
  const result = extractPort('[::1]:5000');
  // Either returns 5000 or null, but must not throw
  assert.ok(result === null || typeof result === 'number');
});

test('extractPort: returns null for null input', () => {
  const result = extractPort(null);
  assert.equal(result, null);
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
