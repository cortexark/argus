/**
 * Query functions for argus features.
 * All functions take db as first argument (immutable pattern — no input mutation).
 * Prepared statements are cached per db instance via WeakMap.
 * Uses better-sqlite3 synchronous API.
 */

// --- Prepared statement cache per db instance ---
const stmtCache = new WeakMap();

function getStmts(db) {
  if (stmtCache.has(db)) return stmtCache.get(db);

  const stmts = {
    // Heatmap
    fileAccessHeatmap: db.prepare(`
      SELECT file_path, COUNT(*) as access_count, app_label
      FROM file_access_events
      WHERE timestamp >= ?
      GROUP BY file_path, app_label
      ORDER BY access_count DESC
      LIMIT ?
    `),

    // Timeline (no app_label filter)
    correlationTimeline: db.prepare(`
      SELECT timestamp, 'FILE' as event_type, app_label, file_path as detail, sensitivity as severity
      FROM file_access_events WHERE timestamp >= ? AND timestamp <= ?
      UNION ALL
      SELECT timestamp, 'NET' as event_type, app_label, remote_host as detail, NULL as severity
      FROM network_events WHERE timestamp >= ? AND timestamp <= ?
      UNION ALL
      SELECT timestamp, 'PROC' as event_type, app_label, name as detail, NULL as severity
      FROM process_snapshots WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `),

    // Timeline (with app_label filter)
    correlationTimelineByApp: db.prepare(`
      SELECT timestamp, 'FILE' as event_type, app_label, file_path as detail, sensitivity as severity
      FROM file_access_events WHERE timestamp >= ? AND timestamp <= ? AND app_label = ?
      UNION ALL
      SELECT timestamp, 'NET' as event_type, app_label, remote_host as detail, NULL as severity
      FROM network_events WHERE timestamp >= ? AND timestamp <= ? AND app_label = ?
      UNION ALL
      SELECT timestamp, 'PROC' as event_type, app_label, name as detail, NULL as severity
      FROM process_snapshots WHERE timestamp >= ? AND timestamp <= ? AND app_label = ?
      ORDER BY timestamp ASC
    `),

    // Export (full fields)
    eventsForExport: db.prepare(`
      SELECT timestamp, 'FILE' as event_type, app_label, file_path as detail, sensitivity as severity,
             pid, process_name, access_type, sensitivity, is_alert
      FROM file_access_events WHERE timestamp >= ? AND timestamp <= ?
      UNION ALL
      SELECT timestamp, 'NET' as event_type, app_label, remote_host as detail, NULL as severity,
             pid, process_name, NULL as access_type, NULL as sensitivity, NULL as is_alert
      FROM network_events WHERE timestamp >= ? AND timestamp <= ?
      UNION ALL
      SELECT timestamp, 'PROC' as event_type, app_label, name as detail, NULL as severity,
             pid, name as process_name, category as access_type, NULL as sensitivity, NULL as is_alert
      FROM process_snapshots WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `),

    // Baselines
    getBaselines: db.prepare(`
      SELECT * FROM baselines WHERE app_label = ?
    `),
    upsertBaseline: db.prepare(`
      INSERT INTO baselines (app_label, metric_type, metric_value, sample_count, first_seen, last_seen)
      VALUES (@app_label, @metric_type, @metric_value, @sample_count, @first_seen, @last_seen)
      ON CONFLICT(app_label, metric_type, metric_value) DO UPDATE SET
        sample_count = @sample_count,
        last_seen = @last_seen
    `),

    // Notification config
    getNotificationConfig: db.prepare(`
      SELECT * FROM notification_config WHERE channel = ?
    `),
    upsertNotificationConfig: db.prepare(`
      INSERT INTO notification_config (channel, target, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(channel) DO UPDATE SET target = excluded.target
    `),

    // Digest: file alerts last 24h
    fileAlerts24h: db.prepare(`
      SELECT * FROM file_access_events
      WHERE is_alert = 1 AND timestamp >= ?
      ORDER BY timestamp DESC
    `),
    // Digest: network events last 24h
    networkEvents24h: db.prepare(`
      SELECT * FROM network_events
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
    `),
    // Digest: distinct process count last 24h
    processCount24h: db.prepare(`
      SELECT COUNT(DISTINCT name) as cnt FROM process_snapshots
      WHERE timestamp >= ?
    `),
    // Digest: top accessed files last 24h
    topFiles24h: db.prepare(`
      SELECT file_path, COUNT(*) as access_count
      FROM file_access_events
      WHERE timestamp >= ?
      GROUP BY file_path
      ORDER BY access_count DESC
      LIMIT 10
    `),
    // Digest: top endpoints last 24h
    topEndpoints24h: db.prepare(`
      SELECT remote_host, COUNT(*) as connection_count
      FROM network_events
      WHERE timestamp >= ?
      GROUP BY remote_host
      ORDER BY connection_count DESC
      LIMIT 10
    `),

    // Baseline learning
    connectionsPerHour: db.prepare(`
      SELECT strftime('%Y-%m-%dT%H:00:00.000Z', timestamp) as hour,
             COUNT(*) as connection_count
      FROM network_events
      WHERE app_label = ? AND timestamp >= ?
      GROUP BY hour
      ORDER BY hour ASC
    `),
    distinctEndpoints: db.prepare(`
      SELECT DISTINCT remote_host FROM network_events
      WHERE app_label = ? AND timestamp >= ?
    `),
    distinctFilePaths: db.prepare(`
      SELECT DISTINCT file_path FROM file_access_events
      WHERE app_label = ? AND timestamp >= ?
    `),
  };

  stmtCache.set(db, stmts);
  return stmts;
}

/**
 * Get top accessed file paths with counts for the heatmap view.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO - ISO timestamp lower bound
 * @param {number} [limit=50]
 * @returns {{ file_path: string, access_count: number, app_label: string }[]}
 */
export function getFileAccessHeatmap(db, sinceISO, limit = 50) {
  const stmts = getStmts(db);
  return stmts.fileAccessHeatmap.all(sinceISO, limit);
}

/**
 * Get a unified timeline of FILE, NET, and PROC events ordered by timestamp.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO - ISO timestamp lower bound
 * @param {string} untilISO - ISO timestamp upper bound
 * @param {string|null} [appLabel=null] - optional app filter
 * @returns {{ timestamp: string, event_type: string, app_label: string, detail: string, severity: string|null }[]}
 */
export function getCorrelationTimeline(db, sinceISO, untilISO, appLabel = null) {
  const stmts = getStmts(db);
  if (appLabel) {
    return stmts.correlationTimelineByApp.all(
      sinceISO, untilISO, appLabel,
      sinceISO, untilISO, appLabel,
      sinceISO, untilISO, appLabel,
    );
  }
  return stmts.correlationTimeline.all(
    sinceISO, untilISO,
    sinceISO, untilISO,
    sinceISO, untilISO,
  );
}

/**
 * Get all events for a date range suitable for export.
 * Returns same shape as getCorrelationTimeline with additional fields.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO
 * @param {string} untilISO
 * @returns {object[]}
 */
export function getEventsForExport(db, sinceISO, untilISO) {
  const stmts = getStmts(db);
  return stmts.eventsForExport.all(
    sinceISO, untilISO,
    sinceISO, untilISO,
    sinceISO, untilISO,
  );
}

/**
 * Get all baselines for a given app label.
 * @param {import('better-sqlite3').Database} db
 * @param {string} appLabel
 * @returns {object[]}
 */
export function getBaselines(db, appLabel) {
  const stmts = getStmts(db);
  return stmts.getBaselines.all(appLabel);
}

/**
 * Upsert a baseline entry. Updates sample_count and last_seen on conflict.
 * @param {import('better-sqlite3').Database} db
 * @param {{ app_label: string, metric_type: string, metric_value: string, sample_count: number }} entry
 */
export function upsertBaseline(db, entry) {
  const stmts = getStmts(db);
  const now = new Date().toISOString();
  stmts.upsertBaseline.run({
    ...entry,
    first_seen: now,
    last_seen: now,
  });
}

/**
 * Get notification config for a channel.
 * @param {import('better-sqlite3').Database} db
 * @param {string} channel
 * @returns {object|undefined}
 */
export function getNotificationConfig(db, channel) {
  const stmts = getStmts(db);
  return stmts.getNotificationConfig.get(channel);
}

/**
 * Upsert a notification config entry. Updates target on conflict.
 * @param {import('better-sqlite3').Database} db
 * @param {string} channel
 * @param {string} target
 */
export function upsertNotificationConfig(db, channel, target) {
  const stmts = getStmts(db);
  const now = new Date().toISOString();
  stmts.upsertNotificationConfig.run(channel, target, now);
}

/**
 * Get a digest of all events from the past 24 hours.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ fileAlerts: object[], networkEvents: object[], processCount: number, topFiles: object[], topEndpoints: object[] }}
 */
export function getAllEvents24h(db) {
  const stmts = getStmts(db);
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const fileAlerts = stmts.fileAlerts24h.all(since);
  const networkEvents = stmts.networkEvents24h.all(since);
  const processCount = stmts.processCount24h.get(since)?.cnt ?? 0;
  const topFiles = stmts.topFiles24h.all(since);
  const topEndpoints = stmts.topEndpoints24h.all(since);

  return { fileAlerts, networkEvents, processCount, topFiles, topEndpoints };
}

/**
 * Get network connection counts grouped by hour for an app.
 * @param {import('better-sqlite3').Database} db
 * @param {string} appLabel
 * @param {string} sinceISO
 * @returns {{ hour: string, connection_count: number }[]}
 */
export function getConnectionsPerHour(db, appLabel, sinceISO) {
  const stmts = getStmts(db);
  return stmts.connectionsPerHour.all(appLabel, sinceISO);
}

/**
 * Get distinct remote endpoints for an app since a given timestamp.
 * @param {import('better-sqlite3').Database} db
 * @param {string} appLabel
 * @param {string} sinceISO
 * @returns {{ remote_host: string }[]}
 */
export function getDistinctEndpoints(db, appLabel, sinceISO) {
  const stmts = getStmts(db);
  return stmts.distinctEndpoints.all(appLabel, sinceISO);
}

/**
 * Get distinct file paths accessed by an app since a given timestamp.
 * @param {import('better-sqlite3').Database} db
 * @param {string} appLabel
 * @param {string} sinceISO
 * @returns {{ file_path: string }[]}
 */
export function getDistinctFilePaths(db, appLabel, sinceISO) {
  const stmts = getStmts(db);
  return stmts.distinctFilePaths.all(appLabel, sinceISO);
}
