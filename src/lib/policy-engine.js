/**
 * Policy Engine — evaluate file/network access against user-defined rules.
 *
 * Reads argus.toml (or argus.json) from the user's home directory.
 * Rules define what each AI agent is EXPECTED to access.
 * Anything outside the rules triggers a policy violation alert.
 *
 * Policy format (argus.toml):
 *
 *   [defaults]
 *   deny_paths = ["~/.ssh/*", "~/.aws/*", "~/.gnupg/*"]
 *
 *   [agent.cursor]
 *   allow_paths = ["~/Projects/**"]
 *   deny_paths = ["~/.ssh/*"]
 *   allow_network = ["api.openai.com", "github.com"]
 *
 *   [agent.claude]
 *   allow_paths = ["~/workspace/**"]
 *   allow_network = ["api.anthropic.com", "*.anthropic.com"]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Match a path against a glob-like pattern.
 * Supports:
 *   - * matches any single path segment
 *   - ** matches any number of path segments
 *   - ~ expands to home directory
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchPath(filePath, pattern) {
  if (!filePath || !pattern) return false;

  // Expand ~ to home directory
  const home = homedir();
  const expandedPattern = pattern.startsWith('~')
    ? pattern.replace('~', home)
    : pattern;
  const normalizedPath = filePath.startsWith('~')
    ? filePath.replace('~', home)
    : filePath;

  // Convert glob to regex
  const regexStr = expandedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars (except * and ?)
    .replace(/\*\*/g, '__DOUBLESTAR__')     // preserve **
    .replace(/\*/g, '[^/]*')               // * matches within one segment
    .replace(/__DOUBLESTAR__/g, '.*');      // ** matches across segments

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalizedPath);
}

/**
 * Match a hostname against a pattern (supports leading wildcard *.domain.com).
 * @param {string} host
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchHost(host, pattern) {
  if (!host || !pattern) return false;

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // ".domain.com"
    return host.endsWith(suffix) || host === pattern.slice(2);
  }

  return host === pattern;
}

/**
 * Load policy from argus.toml or argus.json in the user's home directory.
 * Returns null if no policy file exists (policy is optional).
 * @returns {object|null}
 */
export function loadPolicy() {
  const home = homedir();
  const jsonPath = join(home, '.argus', 'policy.json');
  const tomlPath = join(home, '.argus', 'argus.toml');

  // Try JSON first (simpler to parse without toml dependency)
  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf8');
      return Object.freeze(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  // Try TOML (parse minimal subset — agent sections with allow/deny arrays)
  if (existsSync(tomlPath)) {
    try {
      const raw = readFileSync(tomlPath, 'utf8');
      return Object.freeze(parseMinimalToml(raw));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parse a minimal TOML subset: [section.name] with key = ["values"].
 * Only handles string arrays and simple string values.
 * @param {string} toml
 * @returns {object}
 */
export function parseMinimalToml(toml) {
  const result = {};
  let currentSection = null;

  for (const rawLine of toml.split('\n')) {
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith('#')) continue;

    // Section header: [defaults] or [agent.cursor]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const path = sectionMatch[1].split('.');
      currentSection = path;
      // Create nested object
      let obj = result;
      for (const key of path) {
        if (!obj[key]) obj[key] = {};
        obj = obj[key];
      }
      continue;
    }

    // Key-value: allow_paths = ["~/Projects/**"]
    if (currentSection) {
      const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (kvMatch) {
        const [, key, rawValue] = kvMatch;
        let obj = result;
        for (const s of currentSection) obj = obj[s];

        // Parse array: ["a", "b"]
        const arrayMatch = rawValue.match(/^\[(.+)\]$/);
        if (arrayMatch) {
          obj[key] = arrayMatch[1]
            .split(',')
            .map(v => v.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean);
        } else {
          // Simple string value
          obj[key] = rawValue.replace(/^["']|["']$/g, '').trim();
        }
      }
    }
  }

  return result;
}

/**
 * Evaluate a file access event against the loaded policy.
 * @param {object} policy - Loaded policy object
 * @param {string} appLabel - AI app label (e.g., "cursor", "claude")
 * @param {string} filePath - Accessed file path
 * @returns {{ allowed: boolean, reason: string }}
 */
export function evaluateFileAccess(policy, appLabel, filePath) {
  if (!policy) return { allowed: true, reason: 'no policy loaded' };

  const agentKey = appLabel?.toLowerCase();
  const agentPolicy = policy.agent?.[agentKey];
  const defaults = policy.defaults || {};

  // Check agent-specific deny first (highest priority)
  if (agentPolicy?.deny_paths) {
    for (const pattern of agentPolicy.deny_paths) {
      if (matchPath(filePath, pattern)) {
        return { allowed: false, reason: `denied by agent.${agentKey}.deny_paths: ${pattern}` };
      }
    }
  }

  // Check agent-specific allow
  if (agentPolicy?.allow_paths) {
    for (const pattern of agentPolicy.allow_paths) {
      if (matchPath(filePath, pattern)) {
        return { allowed: true, reason: `allowed by agent.${agentKey}.allow_paths: ${pattern}` };
      }
    }
  }

  // Check default deny
  if (defaults.deny_paths) {
    for (const pattern of defaults.deny_paths) {
      if (matchPath(filePath, pattern)) {
        return { allowed: false, reason: `denied by defaults.deny_paths: ${pattern}` };
      }
    }
  }

  // No rule matched — allowed by default (monitor-only)
  return { allowed: true, reason: 'no matching rule' };
}

/**
 * Evaluate a network connection against the loaded policy.
 * @param {object} policy
 * @param {string} appLabel
 * @param {string} remoteHost
 * @returns {{ allowed: boolean, reason: string }}
 */
export function evaluateNetworkAccess(policy, appLabel, remoteHost) {
  if (!policy) return { allowed: true, reason: 'no policy loaded' };

  const agentKey = appLabel?.toLowerCase();
  const agentPolicy = policy.agent?.[agentKey];

  // If agent has allow_network, only those hosts are allowed
  if (agentPolicy?.allow_network) {
    for (const pattern of agentPolicy.allow_network) {
      if (matchHost(remoteHost, pattern)) {
        return { allowed: true, reason: `allowed by agent.${agentKey}.allow_network: ${pattern}` };
      }
    }
    return { allowed: false, reason: `not in agent.${agentKey}.allow_network` };
  }

  // Check deny_network
  if (agentPolicy?.deny_network) {
    for (const pattern of agentPolicy.deny_network) {
      if (matchHost(remoteHost, pattern)) {
        return { allowed: false, reason: `denied by agent.${agentKey}.deny_network: ${pattern}` };
      }
    }
  }

  return { allowed: true, reason: 'no matching rule' };
}

export default { loadPolicy, evaluateFileAccess, evaluateNetworkAccess, matchPath, matchHost, parseMinimalToml };
