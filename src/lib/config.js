/**
 * Frozen configuration object for argus.
 * Override DB_PATH via ARGUS_DB_PATH env var.
 * Override SCAN_INTERVAL_MS via ARGUS_SCAN_INTERVAL env var.
 */

import { resolve, isAbsolute, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HOME = process.env.HOME || '/tmp';

const DATA_DIR = join(HOME, '.argus');
const DB_PATH_DEFAULT = join(DATA_DIR, 'data.db');
const PRIVACY_MODE_DEFAULT = 'deep';

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

/**
 * Normalize privacy mode to one of the supported values.
 * Falls back to "deep" when input is missing/invalid.
 * @param {string|undefined} raw
 * @returns {'basic'|'deep'}
 */
function normalizePrivacyMode(raw) {
  if (!raw) return PRIVACY_MODE_DEFAULT;
  const value = String(raw).trim().toLowerCase();
  return value === 'basic' ? 'basic' : value === 'deep' ? 'deep' : PRIVACY_MODE_DEFAULT;
}

/**
 * Read persisted privacy mode from settings.json.
 * Used when ARGUS_PRIVACY_MODE env var is not explicitly set.
 * @returns {'basic'|'deep'|undefined}
 */
function readPersistedPrivacyMode() {
  try {
    const settingsPath = process.env.ARGUS_SETTINGS_PATH || join(HOME, '.argus', 'settings.json');
    if (!existsSync(settingsPath)) return undefined;
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (typeof parsed.privacyMode !== 'string') return undefined;
    return normalizePrivacyMode(parsed.privacyMode);
  } catch {
    return undefined;
  }
}

const rawDbPath = process.env.ARGUS_DB_PATH || DB_PATH_DEFAULT;
const privacyMode = normalizePrivacyMode(
  process.env.ARGUS_PRIVACY_MODE || readPersistedPrivacyMode() || PRIVACY_MODE_DEFAULT
);

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
  PRIVACY_MODE: privacyMode,
  DEEP_MONITORING: privacyMode === 'deep',
  AI_KEYWORDS: Object.freeze([
    'claude', 'openai', 'langchain', 'llama', 'gpt', 'copilot',
    'agent', 'anthropic', 'mistral', 'ollama', 'cursor', 'windsurf', 'codex',
  ]),
});

export default config;
