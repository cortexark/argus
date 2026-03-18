/**
 * Behavioral baseline learning and anomaly detection.
 *
 * Baselines are built from network and file access history.
 * Deviations are only flagged after 168+ samples (7 days of hourly data).
 *
 * metric_type values:
 *   'connections_per_hour' — running average stored in metric_value (stringified float)
 *   'endpoint'             — known remote_host
 *   'file_path_prefix'     — known 2-segment path prefix (e.g. '/home/user')
 */

import {
  getConnectionsPerHour,
  getDistinctEndpoints,
  getDistinctFilePaths,
  upsertBaseline,
  getBaselines,
} from '../db/queries.js';

const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
const ONE_HOUR_MS = 3_600_000;
const MIN_SAMPLES_FOR_DEVIATION = 168; // 7 days × 24 h

/**
 * Extract the first two path segments of a file path as a prefix.
 * e.g. '/home/user/docs/file.txt' → '/home/user'
 * @param {string} filePath
 * @returns {string}
 */
function twoSegmentPrefix(filePath) {
  const parts = filePath.split('/').filter(Boolean);
  return '/' + parts.slice(0, 2).join('/');
}

/**
 * Get the distinct app_labels seen in process_snapshots over the last 24 h.
 * Falls back to scanning baselines table when process_snapshots is empty.
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]}
 */
function getActiveAppLabels(db) {
  const since = new Date(Date.now() - 24 * ONE_HOUR_MS).toISOString();
  const rows = db.prepare(
    `SELECT DISTINCT app_label FROM process_snapshots
     WHERE app_label IS NOT NULL AND timestamp >= ?`
  ).all(since);
  return rows.map((r) => r.app_label);
}

/**
 * Update baselines for all known apps from recent data.
 * Called hourly from the main monitoring loop.
 * Only flags deviations after 168+ samples (7 days).
 *
 * @param {import('better-sqlite3').Database} db
 */
export async function updateBaselines(db) {
  const appLabels = getActiveAppLabels(db);

  for (const appLabel of appLabels) {
    const now = Date.now();
    const sinceHour = new Date(now - ONE_HOUR_MS).toISOString();
    const since7d = new Date(now - SEVEN_DAYS_MS).toISOString();

    // --- connections_per_hour: running average ---
    const hourRows = getConnectionsPerHour(db, appLabel, sinceHour);
    const currentCount = hourRows.reduce((sum, r) => sum + r.connection_count, 0);

    const existingAvg = db.prepare(
      `SELECT metric_value, sample_count FROM baselines
       WHERE app_label = ? AND metric_type = 'connections_per_hour' AND metric_value IS NOT NULL
       ORDER BY id ASC LIMIT 1`
    ).get(appLabel);

    let newAvg;
    let newSampleCount;

    if (existingAvg) {
      const prevAvg = parseFloat(existingAvg.metric_value);
      const prevCount = existingAvg.sample_count;
      // Incremental running average: avg = (prev_avg * n + current) / (n + 1)
      newSampleCount = prevCount + 1;
      newAvg = (prevAvg * prevCount + currentCount) / newSampleCount;
    } else {
      newAvg = currentCount;
      newSampleCount = 1;
    }

    upsertBaseline(db, {
      app_label: appLabel,
      metric_type: 'connections_per_hour',
      metric_value: String(newAvg),
      sample_count: newSampleCount,
    });

    // --- endpoints: distinct remote hosts (last 7 days) ---
    const endpoints = getDistinctEndpoints(db, appLabel, since7d);
    for (const { remote_host } of endpoints) {
      if (!remote_host) continue;
      const existing = db.prepare(
        `SELECT sample_count FROM baselines
         WHERE app_label = ? AND metric_type = 'endpoint' AND metric_value = ?`
      ).get(appLabel, remote_host);

      upsertBaseline(db, {
        app_label: appLabel,
        metric_type: 'endpoint',
        metric_value: remote_host,
        sample_count: existing ? existing.sample_count + 1 : 1,
      });
    }

    // --- file_path_prefix: distinct 2-segment prefixes (last 7 days) ---
    const filePaths = getDistinctFilePaths(db, appLabel, since7d);
    const seenPrefixes = new Set();

    for (const { file_path } of filePaths) {
      if (!file_path) continue;
      const prefix = twoSegmentPrefix(file_path);
      if (seenPrefixes.has(prefix)) continue;
      seenPrefixes.add(prefix);

      const existing = db.prepare(
        `SELECT sample_count FROM baselines
         WHERE app_label = ? AND metric_type = 'file_path_prefix' AND metric_value = ?`
      ).get(appLabel, prefix);

      upsertBaseline(db, {
        app_label: appLabel,
        metric_type: 'file_path_prefix',
        metric_value: prefix,
        sample_count: existing ? existing.sample_count + 1 : 1,
      });
    }
  }
}

/**
 * Check for behavioral deviations for a specific app.
 * Returns an empty array when there is insufficient baseline data.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} appLabel
 * @returns {{ type: string, description: string, severity: string }[]}
 */
export function checkDeviations(db, appLabel) {
  const baselines = getBaselines(db, appLabel);
  const deviations = [];

  // --- Check: connections_per_hour spike ---
  const connBaseline = baselines.find(
    (b) => b.metric_type === 'connections_per_hour'
  );

  if (connBaseline && connBaseline.sample_count >= MIN_SAMPLES_FOR_DEVIATION) {
    const since = new Date(Date.now() - ONE_HOUR_MS).toISOString();
    const hourRows = getConnectionsPerHour(db, appLabel, since);
    const currentCount = hourRows.reduce((sum, r) => sum + r.connection_count, 0);
    const storedAvg = parseFloat(connBaseline.metric_value);

    if (storedAvg > 0 && currentCount > storedAvg * 3) {
      deviations.push({
        type: 'connection_spike',
        description: `Connection spike: ${currentCount} connections this hour vs avg ${storedAvg.toFixed(1)}`,
        severity: 'MEDIUM',
      });
    }
  }

  // If no connections baseline with enough samples, skip endpoint/file checks too
  // (they share the same time-in-operation constraint implicitly via sample_count on avg)
  const endpointBaselines = new Set(
    baselines
      .filter((b) => b.metric_type === 'endpoint')
      .map((b) => b.metric_value)
  );

  const filePathBaselines = new Set(
    baselines
      .filter((b) => b.metric_type === 'file_path_prefix')
      .map((b) => b.metric_value)
  );

  // Only check new endpoints / file paths if we have enough samples on conn baseline
  if (!connBaseline || connBaseline.sample_count < MIN_SAMPLES_FOR_DEVIATION) {
    return deviations;
  }

  // --- Check: new endpoints in last hour ---
  const sinceHour = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const recentEndpoints = getDistinctEndpoints(db, appLabel, sinceHour);

  for (const { remote_host } of recentEndpoints) {
    if (!remote_host) continue;
    if (!endpointBaselines.has(remote_host)) {
      deviations.push({
        type: 'new_endpoint',
        description: `New endpoint not in baseline: ${remote_host}`,
        severity: 'HIGH',
      });
    }
  }

  // --- Check: new file path prefixes in last hour ---
  const recentFiles = getDistinctFilePaths(db, appLabel, sinceHour);
  const checkedPrefixes = new Set();

  for (const { file_path } of recentFiles) {
    if (!file_path) continue;
    const prefix = twoSegmentPrefix(file_path);
    if (checkedPrefixes.has(prefix)) continue;
    checkedPrefixes.add(prefix);

    if (!filePathBaselines.has(prefix)) {
      deviations.push({
        type: 'new_file_path',
        description: `New file path prefix not in baseline: ${prefix}`,
        severity: 'LOW',
      });
    }
  }

  return deviations;
}

/**
 * Get a summary of the stored baselines for an app.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} appLabel
 * @returns {{
 *   appLabel: string,
 *   endpoints: string[],
 *   filePaths: string[],
 *   avgConnectionsPerHour: number,
 *   sampleCount: number
 * }}
 */
export function getBaselineSummary(db, appLabel) {
  const baselines = getBaselines(db, appLabel);

  const connBaseline = baselines.find(
    (b) => b.metric_type === 'connections_per_hour'
  );
  const avgConnectionsPerHour = connBaseline
    ? parseFloat(connBaseline.metric_value)
    : 0;
  const sampleCount = connBaseline ? connBaseline.sample_count : 0;

  const endpoints = baselines
    .filter((b) => b.metric_type === 'endpoint')
    .map((b) => b.metric_value);

  const filePaths = baselines
    .filter((b) => b.metric_type === 'file_path_prefix')
    .map((b) => b.metric_value);

  return { appLabel, endpoints, filePaths, avgConnectionsPerHour, sampleCount };
}
