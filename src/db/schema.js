/**
 * Database schema initialization for argus.
 * Creates the SQLite DB file and all required tables.
 */

import Database from 'better-sqlite3';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Initialize the database at the given path.
 * Creates the directory if needed. Enables WAL mode.
 * @param {string} dbPath - Absolute path to .db file, or ':memory:'
 * @returns {import('better-sqlite3').Database} db instance
 */
export function initializeDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    // Create the directory with restrictive permissions (owner only).
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    // DB file will be created by better-sqlite3 if it does not exist.
  }

  const db = new Database(dbPath);

  if (dbPath !== ':memory:') {
    // Restrict DB file to owner read/write only (mode 0600).
    // This protects stored sensitive data (file paths, network events) from
    // other users on a multi-user system.
    try {
      chmodSync(dbPath, 0o600);
    } catch {
      // Non-fatal: log and continue. The DB is still usable; the chmod failure
      // likely means the filesystem does not support POSIX permissions.
    }
  }

  db.pragma('journal_mode = WAL');
  // Memory optimizations: cap WAL size, limit page cache, use memory for temp tables
  db.pragma('journal_size_limit = 4194304'); // 4MB WAL cap
  db.pragma('cache_size = -2000');           // 2MB page cache
  db.pragma('temp_store = memory');          // temp tables in RAM not disk
  db.pragma('synchronous = NORMAL');         // safe with WAL, faster than FULL

  db.exec(`
    CREATE TABLE IF NOT EXISTS process_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      name TEXT NOT NULL,
      app_label TEXT,
      category TEXT,
      cpu REAL,
      memory REAL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      process_name TEXT NOT NULL,
      app_label TEXT,
      file_path TEXT NOT NULL,
      access_type TEXT,
      sensitivity TEXT,
      is_alert INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS network_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      process_name TEXT NOT NULL,
      app_label TEXT,
      local_address TEXT,
      remote_address TEXT,
      remote_host TEXT,
      port INTEGER,
      protocol TEXT,
      state TEXT,
      ai_service TEXT,
      bytes_sent INTEGER DEFAULT 0,
      bytes_received INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS port_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_name TEXT NOT NULL,
      app_label TEXT,
      port INTEGER NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      connection_count INTEGER DEFAULT 1,
      UNIQUE(process_name, port)
    );

    CREATE TABLE IF NOT EXISTS injection_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER,
      process_name TEXT NOT NULL,
      app_label TEXT,
      file_path TEXT NOT NULL,
      severity TEXT NOT NULL,
      patterns TEXT NOT NULL,
      snippet TEXT,
      layer TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inj_time ON injection_alerts(timestamp DESC);

    CREATE TABLE IF NOT EXISTS baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_label TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      metric_value TEXT NOT NULL,
      sample_count INTEGER DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      UNIQUE(app_label, metric_type, metric_value)
    );

    CREATE TABLE IF NOT EXISTS notification_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL UNIQUE,
      target TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_decisions (
      alert_id INTEGER PRIMARY KEY,
      decision TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      app_label TEXT NOT NULL,
      process_name TEXT NOT NULL,
      cmd TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_session_started ON session_history(started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_file_access_app ON file_access_events(app_label, timestamp);

    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      snapshot_data TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_snapshots(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_app ON usage_snapshots(app, timestamp DESC);
  `);

  // Migration: add bytes columns if they don't exist (for pre-existing databases)
  try {
    db.prepare('SELECT bytes_sent FROM network_events LIMIT 0').run();
  } catch {
    db.exec('ALTER TABLE network_events ADD COLUMN bytes_sent INTEGER DEFAULT 0');
    db.exec('ALTER TABLE network_events ADD COLUMN bytes_received INTEGER DEFAULT 0');
  }

  return db;
}

export default { initializeDatabase };
