/**
 * User configuration loader and merger.
 * Reads ~/.argus/config.json and merges user additions into default config.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || '/tmp';
const USER_CONFIG_PATH = join(HOME, '.argus', 'config.json');

/**
 * Valid top-level keys in user config.
 */
const VALID_KEYS = new Set(['sensitive_paths', 'ai_endpoints', 'ai_apps', '_comment']);

/**
 * Validate the shape of a user config object.
 * Returns true if the config has a valid structure, false otherwise.
 * @param {unknown} cfg
 * @returns {boolean}
 */
function isValidConfig(cfg) {
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return false;
  }

  const keys = Object.keys(cfg);
  for (const key of keys) {
    if (!VALID_KEYS.has(key)) {
      return false;
    }
  }

  if ('sensitive_paths' in cfg) {
    if (typeof cfg.sensitive_paths !== 'object' || cfg.sensitive_paths === null || Array.isArray(cfg.sensitive_paths)) {
      return false;
    }
    for (const val of Object.values(cfg.sensitive_paths)) {
      if (!Array.isArray(val)) return false;
      for (const item of val) {
        if (typeof item !== 'string') return false;
      }
    }
  }

  if ('ai_endpoints' in cfg) {
    if (!Array.isArray(cfg.ai_endpoints)) return false;
    for (const ep of cfg.ai_endpoints) {
      if (typeof ep !== 'object' || ep === null) return false;
      if (typeof ep.pattern !== 'string' || typeof ep.service !== 'string') return false;
    }
  }

  if ('ai_apps' in cfg) {
    if (typeof cfg.ai_apps !== 'object' || cfg.ai_apps === null || Array.isArray(cfg.ai_apps)) {
      return false;
    }
    for (const val of Object.values(cfg.ai_apps)) {
      if (typeof val !== 'object' || val === null) return false;
      if (typeof val.name !== 'string' || typeof val.category !== 'string') return false;
    }
  }

  return true;
}

/**
 * Load user config from ~/.argus/config.json.
 * Returns the parsed config object, or null if the file doesn't exist or is invalid.
 * @param {string} [configPath] — override path for testing
 * @returns {object | null}
 */
export function loadUserConfig(configPath = USER_CONFIG_PATH) {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!isValidConfig(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Deep-freeze an object and all nested objects/arrays.
 * @param {object} obj
 * @returns {object}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  Object.freeze(obj);

  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * Merge user config additions into default config immutably.
 * Arrays are appended (user additions after defaults), objects are shallow-merged per key.
 * Returns a frozen merged config object.
 * @param {object} defaultConfig — { sensitive_paths, ai_endpoints, ai_apps }
 * @param {object | null} userConfig
 * @returns {object}
 */
export function mergeConfig(defaultConfig, userConfig) {
  if (!userConfig) {
    return deepFreeze({ ...defaultConfig });
  }

  // Merge sensitive_paths — each category array is concatenated
  const defaultPaths = defaultConfig.sensitive_paths || {};
  const userPaths = userConfig.sensitive_paths || {};
  const mergedPaths = { ...defaultPaths };

  for (const [category, paths] of Object.entries(userPaths)) {
    const existing = mergedPaths[category] || [];
    mergedPaths[category] = [...existing, ...paths];
  }

  // Merge ai_endpoints — user endpoints appended
  const defaultEndpoints = defaultConfig.ai_endpoints || [];
  const userEndpoints = userConfig.ai_endpoints || [];
  const mergedEndpoints = [...defaultEndpoints, ...userEndpoints];

  // Merge ai_apps — user apps added (not replacing existing keys)
  const defaultApps = defaultConfig.ai_apps || {};
  const userApps = userConfig.ai_apps || {};
  const mergedApps = { ...defaultApps, ...userApps };

  const merged = {
    sensitive_paths: mergedPaths,
    ai_endpoints: mergedEndpoints,
    ai_apps: mergedApps,
  };

  return deepFreeze(merged);
}

export default { loadUserConfig, mergeConfig };
