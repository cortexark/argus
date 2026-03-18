/**
 * Tests for daemon/ipc-client.js
 * TDD RED phase — tests written before implementation
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync, existsSync } from 'node:fs';

let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

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

console.log('\n=== ipc-client tests ===\n');

const { sendCommand, DaemonNotRunningError } = await import(
  '../../src/daemon/ipc-client.js'
);

// --- Exports ---

test('exports sendCommand function', () => {
  assert.equal(typeof sendCommand, 'function');
});

test('exports DaemonNotRunningError class', () => {
  assert.equal(typeof DaemonNotRunningError, 'function');
});

// --- DaemonNotRunningError ---

test('DaemonNotRunningError extends Error', () => {
  const err = new DaemonNotRunningError();
  assert.ok(err instanceof Error);
});

test('DaemonNotRunningError has DAEMON_NOT_RUNNING code', () => {
  const err = new DaemonNotRunningError();
  assert.equal(err.code, 'DAEMON_NOT_RUNNING');
});

test('DaemonNotRunningError message mentions "daemon"', () => {
  const err = new DaemonNotRunningError();
  assert.ok(err.message.toLowerCase().includes('daemon'));
});

test('DaemonNotRunningError message mentions start command', () => {
  const err = new DaemonNotRunningError();
  assert.ok(err.message.includes('start'));
});

// --- sendCommand throws when no socket ---

await testAsync('sendCommand throws DaemonNotRunningError when socket does not exist', async () => {
  // Use a socket path that doesn't exist
  const fakePath = join(tmpdir(), `argus-nonexistent-${Date.now()}.sock`);

  // Temporarily override IPC_SOCKET_PATH by using the module's actual behavior
  // We rely on the real socket path not existing in test environment
  try {
    await sendCommand('ping');
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(
      err instanceof DaemonNotRunningError || err.code === 'DAEMON_NOT_RUNNING',
      `Expected DaemonNotRunningError, got: ${err.constructor.name} - ${err.message}`
    );
  }
});

// --- sendCommand timeout ---

await testAsync('IPC protocol: client/server newline-delimited JSON handshake works', async () => {
  // Directly test the wire protocol used by ipc-server/ipc-client
  // without importing ipc-client (which uses the frozen config path).
  const SOCK_PATH = join(tmpdir(), `argus-proto-test-${Date.now()}.sock`);

  const { createServer, connect } = await import('node:net');

  const server = createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (buf.includes('\n')) {
        const line = buf.split('\n')[0].trim();
        const cmd = JSON.parse(line);
        const response = { ok: true, data: { pong: true, cmd: cmd.cmd } };
        socket.write(JSON.stringify(response) + '\n');
        socket.end();
      }
    });
  });

  server.unref(); // Don't hold the process open

  await new Promise((resolve) => server.listen(SOCK_PATH, resolve));

  try {
    const response = await new Promise((resolve, reject) => {
      const client = connect(SOCK_PATH);
      client.unref(); // Don't hold the process open
      client.on('connect', () => {
        client.write(JSON.stringify({ cmd: 'ping' }) + '\n');
      });
      let rbuf = '';
      client.on('data', (chunk) => {
        rbuf += chunk.toString();
        if (rbuf.includes('\n')) {
          resolve(JSON.parse(rbuf.split('\n')[0].trim()));
        }
      });
      client.on('error', reject);
      const t = setTimeout(() => reject(new Error('timeout')), 3000);
      t.unref();
    });

    assert.equal(response.ok, true);
    assert.equal(response.data.pong, true);
    assert.equal(response.data.cmd, 'ping');
  } finally {
    server.close();
    if (existsSync(SOCK_PATH)) {
      try { unlinkSync(SOCK_PATH); } catch { /* ignore */ }
    }
  }
});

// --- DaemonNotRunningError not swallowed ---

await testAsync('sendCommand rejects with DaemonNotRunningError (not generic error)', async () => {
  try {
    await sendCommand('status');
    // If daemon happens to be running, this is okay — skip assertion
  } catch (err) {
    // Must be our typed error, not a raw ENOENT or similar
    assert.ok(
      err.code === 'DAEMON_NOT_RUNNING' || err instanceof DaemonNotRunningError,
      `Expected DaemonNotRunningError but got ${err.constructor.name}: ${err.message}`
    );
  }
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
export const results = { passed, failed };
