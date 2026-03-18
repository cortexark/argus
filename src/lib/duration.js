/**
 * Shared duration parsing utility for argus.
 * Converts human-readable duration strings into milliseconds.
 */

const MULTIPLIERS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const DEFAULT_MS = 86_400_000; // 24h

/**
 * Parse a duration string into milliseconds.
 * Supports: Ns (seconds), Nm (minutes), Nh (hours), Nd (days)
 * @param {string} str - e.g. "24h", "30m", "7d", "1h"
 * @returns {number} milliseconds, or 24h default on invalid input
 */
export function parseDuration(str) {
  if (!str || typeof str !== 'string') return DEFAULT_MS;
  const match = /^(\d+)(h|m|d|s)$/.exec(str.trim());
  if (!match) return DEFAULT_MS;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  return n * MULTIPLIERS[unit];
}
