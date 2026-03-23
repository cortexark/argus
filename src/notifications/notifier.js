/**
 * System notifications for Argus.
 *
 * Every alert tells the user EXACTLY what happened:
 *   - Which AI app
 *   - What it did (file read, network call, new process)
 *   - The specific file path, domain, or port
 *   - Why it matters (sensitivity label)
 *
 * Throttling: max 1 notification per (appName + alertType) per 5 minutes.
 * Batching: if >3 file alerts fire in the same window, they're grouped into
 *           one "X files accessed" summary instead of spamming.
 */

import notifier from 'node-notifier';
import { execFileSync } from 'node:child_process';
import { config } from '../lib/config.js';

const THROTTLE_MS = config.NOTIFICATION_THROTTLE_MS; // 5 min default
const BATCH_WINDOW_MS = 8000; // batch rapid-fire alerts within 8 seconds

// key: `${appName}:${alertType}` -> lastSentMs
const throttleMap = new Map();

// key: `${appName}:${alertType}` -> { count, details[], timer }
const batchMap = new Map();

// Sensitivity labels → human-readable risk descriptions
const SENSITIVITY_LABELS = {
  credentials: '🔑 Credentials',
  browserData: '🌐 Browser Data',
  documents: '📄 Documents',
  system: '⚙️ System Files',
};

/**
 * Core send function — fires a native OS notification.
 * Uses osascript on macOS (zero-dep fallback if node-notifier fails).
 */
function fireNotification({ title, message, subtitle, sound = false, urgency = 'normal' }) {
  try {
    notifier.notify({
      title,
      message,
      subtitle,
      sound,
      timeout: urgency === 'critical' ? 20 : 10,
      group: title, // group by title to avoid stacking
      wait: false,
    });
  } catch {
    // Fallback: osascript (macOS only, no deps)
    try {
      const safe = (s) => String(s).replace(/"/g, '\\"').substring(0, 200);
      execFileSync('osascript', [
        '-e', `display notification "${safe(message)}" with title "${safe(title)}"`,
      ], { timeout: 3000 });
    } catch { /* silent fail — notifications are best-effort */ }
  }
}

/**
 * Send a throttled system notification.
 * Returns true if sent, false if throttled.
 */
export function sendAlert(appName, alertType, message, opts = {}) {
  const key = `${appName}:${alertType}`;
  const now = Date.now();
  const last = throttleMap.get(key) || 0;

  if (now - last < THROTTLE_MS) return false;

  throttleMap.set(key, now);

  fireNotification({
    title: `Argus — ${appName}`,
    subtitle: alertType.replace(/_/g, ' '),
    message,
    sound: opts.sound ? 'Tink' : false,
    urgency: opts.urgency ?? 'normal',
  });

  return true;
}

/**
 * Clear throttle state. Pass a key to clear one entry, or nothing to clear all.
 */
export function clearThrottle(key) {
  if (key) throttleMap.delete(key);
  else throttleMap.clear();
}

/**
 * Batch rapid-fire file alerts into a single grouped notification.
 * Multiple alerts within BATCH_WINDOW_MS are merged into one message.
 */
function batchFileAlert(appName, filePath, sensitivity) {
  const key = `${appName}:file_alert`;
  const now = Date.now();
  const last = throttleMap.get(key) || 0;

  if (now - last < THROTTLE_MS) return false; // still throttled

  const existing = batchMap.get(key);
  if (existing) {
    // Add to existing batch
    existing.count++;
    existing.details.push({ filePath, sensitivity });
    return false; // will be sent when timer fires
  }

  // Start a new batch window
  const batch = { count: 1, details: [{ filePath, sensitivity }], timer: null };
  batchMap.set(key, batch);

  batch.timer = setTimeout(() => {
    batchMap.delete(key);
    throttleMap.set(key, Date.now());

    const { count, details } = batch;
    const topSensitivity = details.find(d => d.sensitivity === 'credentials')?.sensitivity
      || details.find(d => d.sensitivity === 'browserData')?.sensitivity
      || details[0]?.sensitivity;

    const label = SENSITIVITY_LABELS[topSensitivity] || 'File';

    let message;
    if (count === 1) {
      // Single alert: show full path tail
      const shortPath = filePath.split('/').slice(-3).join('/');
      message = `Read ${label}:\n~/${shortPath}`;
    } else {
      // Batch: summarise
      const sensitivityCounts = details.reduce((acc, d) => {
        const l = SENSITIVITY_LABELS[d.sensitivity] || 'File';
        acc[l] = (acc[l] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(sensitivityCounts)
        .map(([l, n]) => `${n}× ${l}`)
        .join(', ');
      message = `Accessed ${count} sensitive files\n${summary}`;
    }

    fireNotification({
      title: `Argus — ${appName}`,
      subtitle: count === 1 ? `${label} access detected` : `${count} file alerts`,
      message,
      urgency: topSensitivity === 'credentials' ? 'critical' : 'normal',
    });
  }, BATCH_WINDOW_MS);

  return true;
}

/**
 * All specific notification types — each surfaces maximum context to the user.
 */
export const notify = {

  /**
   * AI app read a sensitive file.
   * "Claude accessed ~/Documents/project-plan.docx"
   * "Cursor read 🔑 Credentials: ~/.ssh/id_rsa"
   */
  fileAlert(appName, filePath, sensitivity) {
    return batchFileAlert(appName, filePath, sensitivity);
  },

  /**
   * AI app opened a new network connection.
   * "Claude → Anthropic Claude API  port 443"
   * "Cursor → api.openai.com  port 443"
   * "node (AI agent) → unknown host  port 11434 (Ollama?)"
   */
  newConnection(appName, service, port, remoteHost) {
    const dest = service || remoteHost || 'unknown host';
    const portNote = port ? `  port ${port}` : '';
    const flagUnknown = !service ? '\n⚠️ Unrecognised destination' : '';

    return sendAlert(
      appName,
      'new_connection',
      `Connected to ${dest}${portNote}${flagUnknown}`,
      { urgency: service ? 'normal' : 'critical' },
    );
  },

  /**
   * A new AI app started running.
   * "Claude (LLM Desktop) is now active"
   * "Cursor (AI Code Editor) started — monitoring enabled"
   */
  newAppDetected(appName, category) {
    return sendAlert(
      appName,
      'new_app_detected',
      `${appName} is now active\nCategory: ${category}\nMonitoring enabled.`,
      { sound: true },
    );
  },

  /**
   * An AI app session ended.
   * "Claude Code session ended (duration: 4m 32s)"
   */
  appSessionEnded(appName, durationStr) {
    return sendAlert(
      appName,
      'session_ended',
      `${appName} session ended\nDuration: ${durationStr}`,
    );
  },

  /**
   * AI app connected to an unusual or suspicious port.
   * "Cursor used unexpected port 4444 — not a known AI service port"
   */
  suspiciousPort(appName, port) {
    return sendAlert(
      appName,
      `suspicious_port_${port}`,
      `Used unexpected port ${port}\nThis is not a known AI service port.`,
      { urgency: 'critical' },
    );
  },

  /**
   * AI app accessed browser password/cookie storage.
   * "Claude read Chrome profile data — passwords/cookies may be exposed"
   */
  browserDataAccess(appName, browserName) {
    return sendAlert(
      appName,
      'browser_data',
      `Read ${browserName || 'browser'} profile data\n⚠️ May include saved passwords or cookies.`,
      { urgency: 'critical', sound: true },
    );
  },

  /**
   * AI app touched SSH keys or cloud credentials.
   * "Cursor accessed ~/.ssh/id_rsa — SSH key exposure risk"
   */
  credentialAccess(appName, credPath) {
    const shortPath = String(credPath).split('/').slice(-2).join('/');
    return sendAlert(
      appName,
      'credential_access',
      `Accessed credential file:\n~/${shortPath}\n🔑 SSH key / cloud credential risk.`,
      { urgency: 'critical', sound: true },
    );
  },

  /**
   * AI app made a DNS query to an unknown domain.
   * "node (AI agent) queried unknown domain: data-exfil.xyz"
   */
  unknownDomain(appName, domain) {
    return sendAlert(
      appName,
      'unknown_domain',
      `DNS query to unknown domain:\n${domain}\n⚠️ Not a recognised AI service.`,
      { urgency: 'critical' },
    );
  },

  /**
   * Summarise daily activity — sent once per day at end of session or on report.
   * "Today: Claude made 47 connections, accessed 3 files in Documents"
   */
  dailySummary(appName, { connections, fileAlerts, ports }) {
    const parts = [];
    if (connections > 0) parts.push(`${connections} network connection${connections > 1 ? 's' : ''}`);
    if (fileAlerts > 0) parts.push(`${fileAlerts} file alert${fileAlerts > 1 ? 's' : ''}`);
    if (ports?.length) parts.push(`ports: ${ports.slice(0, 5).join(', ')}`);

    if (parts.length === 0) return false;

    return sendAlert(
      appName,
      'daily_summary',
      `Today's activity:\n${parts.join('\n')}`,
    );
  },
};

export default { sendAlert, clearThrottle, notify };
