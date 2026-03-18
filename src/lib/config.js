/**
 * Frozen configuration object for argus.
 * Override DB_PATH via ARGUS_DB_PATH env var.
 * Override SCAN_INTERVAL_MS via ARGUS_SCAN_INTERVAL env var.
 */

import { resolve, isAbsolute, join } from 'node:path';

const HOME = process.env.HOME || '/tmp';

const DATA_DIR = join(HOME, '.argus');
const DB_PATH_DEFAULT = join(DATA_DIR, 'data.db');

/**
 * Validate a user-supplied DB path.
 * Accepts ':memory:' (for tests) or an absolute path ending in '.db'.
 * Resolves the path to prevent traversal tricks and rejects anything that
 * does not end with the '.db' extension.
 * Throws if the value is invalid so misconfiguration is caught at startup.
 * @param {string} raw
 * @returns {string} resolved safe path
 */
function validateDbPath(raw) {
  if (raw === ':memory:') return raw;

  if (!isAbsolute(raw)) {
    throw new Error(
      `ARGUS_DB_PATH must be an absolute path (got: "${raw}"). ` +
      'Relative paths are not allowed to prevent path traversal.'
    );
  }

  const resolved = resolve(raw);

  if (!resolved.endsWith('.db')) {
    throw new Error(
      `ARGUS_DB_PATH must end with ".db" (got: "${resolved}").`
    );
  }

  return resolved;
}

const rawDbPath = process.env.ARGUS_DB_PATH || DB_PATH_DEFAULT;

export const config = Object.freeze({
  DB_PATH: validateDbPath(rawDbPath),
  DATA_DIR,
  LOG_DIR: join(DATA_DIR, 'logs'),
  IPC_SOCKET_PATH: join(DATA_DIR, 'argus.sock'),
  NOTIFICATION_THROTTLE_MS: 300000,
  MAX_LOG_SIZE_MB: 10,
  SCAN_INTERVAL_MS: parseInt(process.env.ARGUS_SCAN_INTERVAL || '5000', 10),
  FILE_MONITOR_INTERVAL_MS: 3000,
  NETWORK_MONITOR_INTERVAL_MS: 3000,
  PORT_AGGREGATION_INTERVAL_MS: 10000,
  MAX_EVENTS_IN_MEMORY: 1000,
  AI_KEYWORDS: Object.freeze([
    'claude', 'openai', 'langchain', 'llama', 'gpt', 'copilot',
    'agent', 'anthropic', 'mistral', 'ollama', 'cursor', 'windsurf',
  ]),
});

export default config;
