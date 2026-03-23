/**
 * Data store functions for argus.
 * All functions take db as first argument.
 * All functions return new objects (immutable pattern — never mutate input).
 * Uses better-sqlite3 synchronous API.
 */

// --- Prepared statement cache per db instance ---
const stmtCache = new WeakMap();

function getStmts(db) {
  if (stmtCache.has(db)) return stmtCache.get(db);

  const stmts = {
    insertProcessSnapshot: db.prepare(`
      INSERT INTO process_snapshots (pid, name, app_label, category, cpu, memory, timestamp)
      VALUES (@pid, @name, @appLabel, @category, @cpu, @memory, @timestamp)
    `),
    insertFileAccess: db.prepare(`
      INSERT INTO file_access_events (pid, process_name, app_label, file_path, access_type, sensitivity, is_alert, timestamp)
      VALUES (@pid, @processName, @appLabel, @filePath, @accessType, @sensitivity, @isAlert, @timestamp)
    `),
    insertNetworkEvent: db.prepare(`
      INSERT INTO network_events (pid, process_name, app_label, local_address, remote_address, remote_host, port, protocol, state, ai_service, bytes_sent, bytes_received, timestamp)
      VALUES (@pid, @processName, @appLabel, @localAddress, @remoteAddress, @remoteHost, @port, @protocol, @state, @aiService, @bytesSent, @bytesReceived, @timestamp)
    `),
    upsertPortHistory: db.prepare(`
      INSERT INTO port_history (process_name, app_label, port, first_seen, last_seen, connection_count)
      VALUES (@processName, @appLabel, @port, @firstSeen, @lastSeen, 1)
      ON CONFLICT(process_name, port) DO UPDATE SET
        connection_count = connection_count + 1,
        last_seen = excluded.last_seen
    `),
    getRecentAlerts: db.prepare(`
      SELECT * FROM file_access_events
      WHERE is_alert = 1 AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 100
    `),
    getPortHistory: db.prepare(`
      SELECT * FROM port_history
      WHERE process_name = ?
      ORDER BY connection_count DESC
    `),
    getActiveProcesses: db.prepare(`
      SELECT DISTINCT name, app_label, category
      FROM process_snapshots
      WHERE timestamp >= ?
    `),
    getNetworkEvents: db.prepare(`
      SELECT * FROM network_events
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 200
    `),
    dailyProcessCount: db.prepare(`
      SELECT COUNT(DISTINCT name) as cnt FROM process_snapshots
      WHERE timestamp >= ? AND timestamp <= ?
    `),
    dailyFileAlertCount: db.prepare(`
      SELECT COUNT(*) as cnt FROM file_access_events
      WHERE is_alert = 1 AND timestamp >= ? AND timestamp <= ?
    `),
    dailyNetworkEventCount: db.prepare(`
      SELECT COUNT(*) as cnt FROM network_events
      WHERE timestamp >= ? AND timestamp <= ?
    `),
    dailyTopPorts: db.prepare(`
      SELECT port, SUM(connection_count) as total
      FROM port_history
      WHERE last_seen >= ? AND last_seen <= ?
      GROUP BY port
      ORDER BY total DESC
      LIMIT 10
    `),
    dailyAIServices: db.prepare(`
      SELECT DISTINCT ai_service FROM network_events
      WHERE ai_service IS NOT NULL AND timestamp >= ? AND timestamp <= ?
    `),
    insertInjectionAlert: db.prepare(`
      INSERT INTO injection_alerts (pid, process_name, app_label, file_path, severity, patterns, snippet, layer, timestamp)
      VALUES (@pid, @processName, @appLabel, @filePath, @severity, @patterns, @snippet, @layer, @timestamp)
    `),
    getInjectionAlerts: db.prepare(`
      SELECT * FROM injection_alerts
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 200
    `),
    setApprovalDecision: db.prepare(`
      INSERT OR REPLACE INTO approval_decisions (alert_id, decision, decided_at)
      VALUES (@alertId, @decision, @decidedAt)
    `),
    getApprovalDecisions: db.prepare(`
      SELECT alert_id, decision FROM approval_decisions
    `),
    insertSession: db.prepare(`
      INSERT INTO session_history (pid, app_label, process_name, cmd, started_at)
      VALUES (@pid, @appLabel, @processName, @cmd, @startedAt)
    `),
    closeSession: db.prepare(`
      UPDATE session_history
      SET ended_at = @endedAt,
          duration_seconds = CAST((julianday(@endedAt) - julianday(started_at)) * 86400 AS INTEGER)
      WHERE id = @id
    `),
    getRecentSessions: db.prepare(`
      SELECT * FROM session_history
      ORDER BY started_at DESC
      LIMIT 100
    `),
  };

  stmtCache.set(db, stmts);
  return stmts;
}

/**
 * Insert a process snapshot.
 * @param {import('better-sqlite3').Database} db
 * @param {object} snapshot
 * @returns {object} New object with id added
 */
export function insertProcessSnapshot(db, snapshot) {
  const stmts = getStmts(db);
  const info = stmts.insertProcessSnapshot.run(snapshot);
  return { ...snapshot, id: info.lastInsertRowid };
}

/**
 * Insert a file access event.
 * @param {import('better-sqlite3').Database} db
 * @param {object} event
 * @returns {object} New object with id added
 */
export function insertFileAccess(db, event) {
  const stmts = getStmts(db);
  const info = stmts.insertFileAccess.run(event);
  return { ...event, id: info.lastInsertRowid };
}

/**
 * Insert a network event.
 * @param {import('better-sqlite3').Database} db
 * @param {object} event
 * @returns {object} New object with id added
 */
export function insertNetworkEvent(db, event) {
  const stmts = getStmts(db);
  const info = stmts.insertNetworkEvent.run(event);
  return { ...event, id: info.lastInsertRowid };
}

/**
 * Upsert a port history entry. Increments connection_count on conflict.
 * @param {import('better-sqlite3').Database} db
 * @param {object} entry
 */
export function upsertPortHistory(db, entry) {
  const stmts = getStmts(db);
  stmts.upsertPortHistory.run(entry);
}

/**
 * Get recent file access alerts since a given ISO timestamp.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO
 * @returns {object[]}
 */
export function getRecentAlerts(db, sinceISO) {
  const stmts = getStmts(db);
  return stmts.getRecentAlerts.all(sinceISO);
}

/**
 * Get port history for a process, ordered by connection count DESC.
 * @param {import('better-sqlite3').Database} db
 * @param {string} processName
 * @returns {object[]}
 */
export function getPortHistory(db, processName) {
  const stmts = getStmts(db);
  return stmts.getPortHistory.all(processName);
}

/**
 * Get distinct active processes since a given ISO timestamp.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO
 * @returns {object[]}
 */
export function getActiveProcesses(db, sinceISO) {
  const stmts = getStmts(db);
  return stmts.getActiveProcesses.all(sinceISO);
}

/**
 * Get network events since a given ISO timestamp (max 200).
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO
 * @returns {object[]}
 */
export function getNetworkEvents(db, sinceISO) {
  const stmts = getStmts(db);
  return stmts.getNetworkEvents.all(sinceISO);
}

/**
 * Get a daily summary for a given date string (YYYY-MM-DD).
 * @param {import('better-sqlite3').Database} db
 * @param {string} dateStr - e.g. '2024-01-15'
 * @returns {{date, processCount, fileAlertCount, networkEventCount, topPorts, aiServicesHit}}
 */
export function getDailySummary(db, dateStr) {
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;
  const stmts = getStmts(db);

  const processCount = stmts.dailyProcessCount.get(dayStart, dayEnd)?.cnt ?? 0;
  const fileAlertCount = stmts.dailyFileAlertCount.get(dayStart, dayEnd)?.cnt ?? 0;
  const networkEventCount = stmts.dailyNetworkEventCount.get(dayStart, dayEnd)?.cnt ?? 0;
  const topPorts = stmts.dailyTopPorts.all(dayStart, dayEnd).map(r => r.port);
  const aiServicesHit = stmts.dailyAIServices.all(dayStart, dayEnd).map(r => r.ai_service);

  return {
    date: dateStr,
    processCount,
    fileAlertCount,
    networkEventCount,
    topPorts,
    aiServicesHit,
  };
}

/**
 * Insert a prompt injection alert.
 * @param {import('better-sqlite3').Database} db
 * @param {object} alert
 * @returns {object} New object with id added
 */
export function insertInjectionAlert(db, alert) {
  const stmts = getStmts(db);
  const info = stmts.insertInjectionAlert.run(alert);
  return { ...alert, id: info.lastInsertRowid };
}

/**
 * Get injection alerts since a given ISO timestamp (max 200, newest first).
 * @param {import('better-sqlite3').Database} db
 * @param {string} sinceISO
 * @returns {object[]}
 */
export function getInjectionAlerts(db, sinceISO) {
  const stmts = getStmts(db);
  return stmts.getInjectionAlerts.all(sinceISO);
}

/**
 * Persist an approval decision for an alert.
 * @param {import('better-sqlite3').Database} db
 * @param {number} alertId
 * @param {string} decision - 'approved' | 'denied'
 */
/**
 * Insert a new session record when an AI process is first detected.
 * @param {import('better-sqlite3').Database} db
 * @param {{ pid, appLabel, processName, cmd, startedAt }} session
 * @returns {object} New object with id added
 */
export function insertSession(db, session) {
  const stmts = getStmts(db);
  const info = stmts.insertSession.run(session);
  return { ...session, id: info.lastInsertRowid };
}

/**
 * Close a session by setting its ended_at and computing duration.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {string} endedAt - ISO timestamp
 */
export function closeSession(db, id, endedAt) {
  const stmts = getStmts(db);
  stmts.closeSession.run({ id, endedAt });
}

/**
 * Get the 100 most recent sessions, newest first.
 * @param {import('better-sqlite3').Database} db
 * @returns {object[]}
 */
export function getRecentSessions(db) {
  const stmts = getStmts(db);
  return stmts.getRecentSessions.all();
}

export function setApprovalDecision(db, alertId, decision) {
  const stmts = getStmts(db);
  stmts.setApprovalDecision.run({ alertId, decision, decidedAt: new Date().toISOString() });
}

/**
 * Get all approval decisions as a Map of alertId → decision.
 * @param {import('better-sqlite3').Database} db
 * @returns {Map<number, string>}
 */
export function getApprovalDecisions(db) {
  const stmts = getStmts(db);
  const rows = stmts.getApprovalDecisions.all();
  return new Map(rows.map((r) => [r.alert_id, r.decision]));
}

export default {
  insertProcessSnapshot,
  insertFileAccess,
  insertNetworkEvent,
  upsertPortHistory,
  getRecentAlerts,
  getPortHistory,
  getActiveProcesses,
  getNetworkEvents,
  getDailySummary,
  insertInjectionAlert,
  getInjectionAlerts,
  insertSession,
  closeSession,
  getRecentSessions,
};
