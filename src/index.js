/**
 * Argus — main entry point.
 * Orchestrates all monitors with setInterval loops.
 * Handles graceful shutdown on SIGINT/SIGTERM.
 * Includes IPC server, system notifications, and chokidar file watching.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { config } from './lib/config.js';
import { info, warn, alert as logAlert } from './lib/logger.js';
import { initializeDatabase } from './db/schema.js';
import { AI_APPS } from './ai-apps.js';
import { scanProcesses } from './monitors/process-scanner.js';
import { scanAIProcessFiles } from './monitors/file-monitor.js';
import { scanAINetworkConnections } from './monitors/network-monitor.js';
import { updatePortHistory } from './monitors/port-tracker.js';
import {
  insertProcessSnapshot,
  insertFileAccess,
  insertSession,
  closeSession,
  reconcileOpenSessionsByPid,
} from './db/store.js';
import { PLATFORM_SENSITIVE_PATHS } from './lib/platform.js';
import { startUnifiedLogMonitor } from './monitors/unified-log-monitor.js';
import { COMMON_PORTS } from './ai-apps.js';
import { detectCdpConnection, detectBrowserExtensionAiCalls } from './monitors/browser-monitor.js';
import { updateBaselines } from './lib/baseline-engine.js';
import { collectAllUsage, closeUsageTrackerDbs } from './monitors/usage-tracker.js';
import { insertUsageSnapshot } from './db/store.js';

function isCommonPort(port) {
  return COMMON_PORTS.has(Number(port));
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * @param {number} ms
 * @returns {string} e.g. "4m 32s", "1h 12m", "< 1m"
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return '< 1m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

let intervals = [];
let db = null;
let ipcServer = null;
let fsWatcher = null;
let unifiedLogMonitor = null;
let digestHandle = null;

// Shared controller — passed to the web server so /api/monitoring/toggle can flip it
export const controller = { paused: false };

// Track which AI app processes we've already notified about (to fire newAppDetected only once)
const knownProcesses = new Set();

// Track active sessions: pid → { id, appLabel } — persisted to session_history table
const activeSessions = new Map();

/**
 * Start all monitoring loops.
 * @param {object} opts - Optional overrides (mostly for testing)
 * @param {string} [opts.dbPath] - Override DB path
 * @param {boolean} [opts.noIpc] - Disable IPC server (for testing)
 * @param {boolean} [opts.noNotify] - Disable notifications (for testing)
 * @param {boolean} [opts.noWatch] - Disable chokidar file watching (for testing)
 * @param {boolean} [opts.noWeb] - Disable web server (for testing or CLI-only mode)
 * @param {'basic'|'deep'} [opts.privacyMode] - Monitoring depth override
 */
export async function start(opts = {}) {
  const dbPath = opts.dbPath || config.DB_PATH;
  const privacyMode = opts.privacyMode === 'basic' ? 'basic' : opts.privacyMode === 'deep'
    ? 'deep'
    : config.PRIVACY_MODE;
  const deepMonitoring = privacyMode === 'deep';

  // Ensure data directory exists
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  db = initializeDatabase(dbPath);

  // Rehydrate open sessions from DB so app restarts do not create duplicate
  // rows for still-running processes with the same pid.
  try {
    activeSessions.clear();
    const { activeSessions: restored, closedCount } = reconcileOpenSessionsByPid(db);
    for (const [pid, session] of restored) {
      activeSessions.set(pid, session);
    }
    if (closedCount > 0) {
      info(`Recovered ${restored.size} open session(s); closed ${closedCount} duplicate stale session row(s).`);
    }
  } catch (err) {
    warn(`Session recovery failed: ${err.message}`);
  }

  const appCount = Object.keys(AI_APPS).length;
  info(`Argus started. Monitoring ${appCount} AI app signatures...`);
  info(
    deepMonitoring
      ? 'Monitoring mode: Deep (includes cross-app file access detection)'
      : 'Monitoring mode: Basic (process + network, reduced permissions)',
  );

  // Lazily import optional modules
  const notifyModule = opts.noNotify ? null : await importNotifier();
  const ipcModule = opts.noIpc ? null : await importIpcServer();

  // Start web dashboard server (unless explicitly disabled)
  let web = null;
  if (!opts.noWeb) {
    try {
      const webModule = await import('./web/server.js');
      web = webModule.startWebServer(db, undefined, controller);
      info(`Web dashboard at http://localhost:${webModule.WEB_PORT}`);
    } catch (err) {
      warn(`Web server failed to start: ${err.message}`);
    }
  }

  // Start IPC server
  if (ipcModule && db) {
    try {
      ipcServer = ipcModule.startIpcServer(db);
      info('IPC server started');
    } catch (err) {
      warn(`IPC server failed to start: ${err.code || err.message}`);
    }
  }

  // Process scanner loop
  const processInterval = setInterval(async () => {
    if (controller.paused) return;
    try {
      const processes = await scanProcesses();
      const now = new Date().toISOString();
      const currentPids = new Set(processes.map((p) => p.pid));

      // Close sessions for processes that have exited
      for (const [pid, session] of activeSessions) {
        if (!currentPids.has(pid)) {
          try {
            closeSession(db, session.id, now);
            // Notify that the app session ended
            if (notifyModule && session.startedAt) {
              const durationMs = new Date(now).getTime() - new Date(session.startedAt).getTime();
              const durationStr = formatDuration(durationMs);
              notifyModule.notify.appSessionEnded(session.appLabel, durationStr);
            }
          } catch { /* ignore */ }
          activeSessions.delete(pid);
        }
      }

      for (const proc of processes) {
        insertProcessSnapshot(db, {
          pid: proc.pid,
          name: proc.name,
          appLabel: proc.appLabel,
          category: proc.category,
          cpu: proc.cpu ?? null,
          memory: proc.memory ?? null,
          timestamp: now,
        });

        // Open a new session record the first time we see this pid
        if (!activeSessions.has(proc.pid) && proc.appLabel) {
          try {
            const s = insertSession(db, {
              pid: proc.pid,
              appLabel: proc.appLabel,
              processName: proc.name,
              cmd: proc.cmd || null,
              startedAt: now,
            });
            activeSessions.set(proc.pid, { id: s.id, appLabel: proc.appLabel, startedAt: now });
          } catch { /* ignore */ }
        }

        // Notify on new AI app process
        if (notifyModule && proc.appLabel && !knownProcesses.has(proc.appLabel)) {
          knownProcesses.add(proc.appLabel);
          notifyModule.notify.newAppDetected(proc.appLabel, proc.category || 'ai-app');
        }

        // Broadcast process event to web dashboard clients
        if (web) {
          web.broadcast({ type: 'process', data: proc });
        }
      }
    } catch (err) {
      warn(`Process scan error: ${err.code || 'unknown'}`);
    }
  }, config.SCAN_INTERVAL_MS);

  // File monitor loop — only in deep mode (cross-app file access).
  let fileInterval = null;
  if (deepMonitoring) {
    fileInterval = setInterval(async () => {
      if (controller.paused) return;
      try {
        const processes = await scanProcesses();
        const { alertCount, alerts } = await scanAIProcessFiles(db, processes);
        if (alertCount > 0) {
          logAlert(`${alertCount} new file access alert(s) detected`);

          if (alerts) {
            for (const alert of alerts) {
              // Broadcast file alert to web dashboard clients
              if (web) {
                web.broadcast({ type: 'file_alert', data: alert });
              }
            }
          }

          if (notifyModule && alerts) {
            for (const alert of alerts) {
              const appName = alert.appLabel || alert.processName;
              const { filePath, sensitivity } = alert;

              // Escalate specific high-risk types to named alerts
              if (sensitivity === 'credentials') {
                // SSH keys, AWS creds, keychains — highest severity
                notifyModule.notify.credentialAccess(appName, filePath);
              } else if (sensitivity === 'browserData') {
                // Chrome/Firefox profile — passwords and cookies
                const browser = filePath.includes('Chrome') ? 'Chrome'
                  : filePath.includes('Firefox') ? 'Firefox'
                  : filePath.includes('Brave') ? 'Brave'
                  : filePath.includes('Safari') ? 'Safari'
                  : null;
                notifyModule.notify.browserDataAccess(appName, browser);
              } else {
                // Documents, Downloads, system files — batch these
                notifyModule.notify.fileAlert(appName, filePath, sensitivity);
              }
            }
          }
        }
      } catch (err) {
        warn(`File monitor error: ${err.code || 'unknown'}`);
      }
    }, config.FILE_MONITOR_INTERVAL_MS);
  } else {
    info('Basic mode active: cross-app file monitor is disabled.');
  }

  // Network monitor loop — surfaces destination, port, and unknown host warnings
  const networkInterval = setInterval(async () => {
    if (controller.paused) return;
    try {
      const processes = await scanProcesses();
      const events = await scanAINetworkConnections(db, processes);
      if (events.length > 0) {
        updatePortHistory(db, events);

        // Broadcast network events to web dashboard clients
        if (web) {
          for (const event of events) {
            web.broadcast({ type: 'network', data: event });
          }
        }

        // Browser automation detection (CDP on port 9222)
        const cdpAlerts = detectCdpConnection(events);
        for (const alert of cdpAlerts) {
          warn(`Browser automation detected: ${alert.appLabel} controlling browser via CDP`);
          if (notifyModule) {
            notifyModule.sendAlert(
              alert.appLabel,
              'browser_automation',
              `Controlling your browser via DevTools Protocol\nAI agent can read all open tabs, execute JS, take screenshots.`,
              { urgency: 'critical', sound: true },
            );
          }
        }

        if (notifyModule) {
          for (const event of events) {
            const appName = event.appLabel || event.processName;

            if (event.aiService) {
              // Known AI endpoint — inform but low urgency
              notifyModule.notify.newConnection(
                appName, event.aiService, event.port, event.remoteHost,
              );
            } else if (event.port && !isCommonPort(event.port)) {
              // Unusual port — flag it
              notifyModule.notify.suspiciousPort(appName, event.port);
            } else if (event.remoteHost && !event.aiService) {
              // Unknown domain — worth surfacing
              notifyModule.notify.unknownDomain(appName, event.remoteHost);
            }
          }
        }
      }
    } catch (err) {
      warn(`Network monitor error: ${err.code || 'unknown'}`);
    }
  }, config.NETWORK_MONITOR_INTERVAL_MS);

  // Cleanup loop: delete events older than 7 days to keep DB small
  const cleanupInterval = setInterval(() => {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('DELETE FROM file_access_events WHERE timestamp < ?').run(cutoff);
      db.prepare('DELETE FROM network_events WHERE timestamp < ?').run(cutoff);
      db.prepare('DELETE FROM process_snapshots WHERE timestamp < ?').run(cutoff);
      db.prepare('PRAGMA wal_checkpoint(PASSIVE)').run();
    } catch (err) {
      warn(`Cleanup error: ${err.code || 'unknown'}`);
    }
  }, 60 * 60 * 1000);

  // AI tool usage tracker — reads Codex, Claude, Cursor local data every 60s
  const usageInterval = setInterval(() => {
    if (controller.paused) return;
    try {
      const usage = collectAllUsage();
      const now = new Date().toISOString();

      // Store a snapshot per tool for history tracking
      for (const tool of usage.tools) {
        try {
          insertUsageSnapshot(db, {
            app: tool.app,
            provider: tool.provider,
            model: (tool.byModel || []).map(m => m.model).join(', ') || null,
            tokens: tool.totalTokens || 0,
            estimatedCostUsd: tool.estimatedCostUsd || 0,
            sessionCount: tool.totalSessions || 0,
            snapshotData: JSON.stringify(tool.byModel || []),
            timestamp: now,
          });
        } catch { /* ignore individual insert failures */ }
      }

      // Broadcast usage update to dashboard
      if (web) {
        web.broadcast({ type: 'usage', data: usage });
      }
    } catch (err) {
      warn(`Usage tracker error: ${err.message}`);
    }
  }, 60_000);

  // Hourly baseline update
  const baselineInterval = setInterval(async () => {
    try {
      await updateBaselines(db);
    } catch (err) {
      warn(`baseline update error: ${err.code || 'unknown'}`);
    }
  }, 60 * 60 * 1000);

  intervals = [processInterval, networkInterval, cleanupInterval, baselineInterval, usageInterval];
  if (fileInterval) intervals.push(fileInterval);

  // Start digest scheduler (fires at 8:00 AM daily)
  try {
    const { startDigestScheduler } = await import('./lib/digest-scheduler.js');
    digestHandle = startDigestScheduler(db);
  } catch (err) {
    warn(`Digest scheduler failed to start: ${err.message}`);
  }

  // Chokidar file watching for credential paths (deep mode only)
  if (deepMonitoring && !opts.noWatch) {
    fsWatcher = await startChokidarWatcher(db, notifyModule);
  }

  // macOS Unified Log monitor — real-time, event-driven (superior to lsof polling)
  // Catches transient file opens, MCP subprocess spawning, TCC permission checks
  if (deepMonitoring && !opts.noWatch) {
    unifiedLogMonitor = startUnifiedLogMonitor(db, {
      onEvent: (entry, classified) => {
        if (!notifyModule) return;
        const appName = entry.appLabel || entry.processName;
        if (classified.type === 'file' && classified.sensitivity === 'credentials') {
          notifyModule.notify.credentialAccess(appName, entry.message);
        } else if (classified.type === 'file' && classified.sensitivity === 'browserData') {
          notifyModule.notify.browserDataAccess(appName, null);
        } else if (classified.type === 'file' && classified.sensitivity) {
          notifyModule.notify.fileAlert(appName, entry.message, classified.sensitivity);
        }
      },
    });
    if (unifiedLogMonitor) info('Unified log monitor active (macOS real-time events)');
  }

  // Graceful shutdown
  const shutdown = async () => {
    await stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Start chokidar watcher on sensitive credential paths.
 * @param {object} db
 * @param {object|null} notifyModule
 * @returns {Promise<object|null>}
 */
async function startChokidarWatcher(db, notifyModule) {
  let chokidar;
  try {
    const mod = await import('chokidar');
    chokidar = mod.default || mod;
  } catch {
    warn('chokidar not available — file watching disabled');
    return null;
  }

  const HOME = homedir();
  const credPaths = (PLATFORM_SENSITIVE_PATHS.credentials || []).map((p) =>
    p.startsWith('/') ? p : join(HOME, p),
  );

  if (credPaths.length === 0) return null;

  const watcher = chokidar.watch(credPaths, {
    persistent: true,
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => handleFsEvent(filePath, 'add', db, notifyModule));
  watcher.on('change', (filePath) => handleFsEvent(filePath, 'change', db, notifyModule));

  watcher.on('error', (err) => {
    warn(`Chokidar watcher error: ${err.code || 'unknown'}`);
  });

  info(`Chokidar watching ${credPaths.length} credential paths`);
  return watcher;
}

/**
 * Handle a chokidar file system event.
 * @param {string} filePath
 * @param {string} eventType
 * @param {object} db
 * @param {object|null} notifyModule
 */
function handleFsEvent(filePath, eventType, db, notifyModule) {
  const now = new Date().toISOString();
  logAlert(`Credential file ${eventType}: ${filePath}`);

  try {
    insertFileAccess(db, {
      pid: 0,
      processName: 'chokidar-watcher',
      appLabel: 'system',
      filePath,
      accessType: eventType,
      sensitivity: 'credentials',
      isAlert: 1,
      timestamp: now,
    });
  } catch (err) {
    warn(`Failed to insert chokidar event: ${err.code || 'unknown'}`);
  }

  if (notifyModule) {
    notifyModule.notify.fileAlert('System', filePath, 'credentials');
  }
}

/**
 * Safely import the notifier module.
 * @returns {Promise<object|null>}
 */
async function importNotifier() {
  try {
    return await import('./notifications/notifier.js');
  } catch {
    warn('Notifications module not available');
    return null;
  }
}

/**
 * Safely import the IPC server module.
 * @returns {Promise<object|null>}
 */
async function importIpcServer() {
  try {
    return await import('./daemon/ipc-server.js');
  } catch {
    warn('IPC server module not available');
    return null;
  }
}

/**
 * Stop all monitoring loops and close the database.
 */
export async function stop() {
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals = [];

  // Stop digest scheduler
  if (digestHandle) {
    try { digestHandle.stop(); } catch { /* ignore */ }
    digestHandle = null;
  }

  // Close IPC server
  if (ipcServer) {
    try {
      await new Promise((resolve) => ipcServer.close(resolve));
    } catch {
      // Ignore close errors
    }
    ipcServer = null;
  }

  // Stop unified log monitor
  if (unifiedLogMonitor) {
    try { unifiedLogMonitor.stop(); } catch { /* ignore */ }
    unifiedLogMonitor = null;
  }

  // Close chokidar watcher
  if (fsWatcher) {
    try {
      await fsWatcher.close();
    } catch {
      // Ignore
    }
    fsWatcher = null;
  }

  // Close usage tracker read-only database connections
  closeUsageTrackerDbs();

  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    db = null;
  }

  info('Argus stopped.');
}

export default { start, stop };
