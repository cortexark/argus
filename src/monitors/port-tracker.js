/**
 * Port tracker — maintains historical port usage records for AI processes.
 */

import { upsertPortHistory, getPortHistory } from '../db/store.js';

/**
 * Update port history from a list of network events.
 * @param {import('better-sqlite3').Database} db
 * @param {object[]} networkEvents
 * @returns {number} count of upserts performed
 */
export function updatePortHistory(db, networkEvents) {
  let count = 0;
  const now = new Date().toISOString();

  for (const event of networkEvents) {
    if (!event.port || typeof event.port !== 'number') continue;

    upsertPortHistory(db, {
      processName: event.processName,
      appLabel: event.appLabel || null,
      port: event.port,
      firstSeen: now,
      lastSeen: now,
      connectionCount: 1,
    });

    count++;
  }

  return count;
}

/**
 * Get a formatted port summary for a process.
 * @param {import('better-sqlite3').Database} db
 * @param {string} processName
 * @returns {Array<{port: number, count: number, firstSeen: string, lastSeen: string}>}
 */
export function getPortSummary(db, processName) {
  const rows = getPortHistory(db, processName);
  return rows.map(row => ({
    port: row.port,
    count: row.connection_count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }));
}

export default { updatePortHistory, getPortSummary };
