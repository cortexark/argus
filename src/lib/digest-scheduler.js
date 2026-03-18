/**
 * Daily digest scheduler for Argus.
 * Fires the digest at 8:00 AM local time every day.
 */

import { runDailyDigest } from './digest.js';

const DIGEST_HOUR = 8; // 8:00 AM local time
const MS_PER_DAY = 86_400_000;

/**
 * Calculate milliseconds until the next occurrence of a given local hour.
 * @param {number} targetHour - 0-23
 * @returns {number} ms until next fire
 */
function msUntilNextHour(targetHour) {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    targetHour,
    0,
    0,
    0
  );

  if (next <= now) {
    // Already passed today — schedule for tomorrow
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

/**
 * Start the daily digest scheduler.
 * Fires at 8:00 AM local time, then every 24 hours.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ stop: Function }}
 */
export function startDigestScheduler(db) {
  let intervalHandle = null;
  let timeoutHandle = null;
  let stopped = false;

  async function fire() {
    if (stopped) return;
    try {
      const result = await runDailyDigest(db);
      const channels = result.sent.length > 0 ? result.sent.join(', ') : 'local only';
      console.log(`[digest-scheduler] Digest sent (${channels}). Saved: ${result.saved}`);
    } catch (err) {
      console.error(`[digest-scheduler] Digest failed: ${err?.message ?? err}`);
    }
  }

  const msUntilFirst = msUntilNextHour(DIGEST_HOUR);

  console.log(
    `[digest-scheduler] Next digest in ${Math.round(msUntilFirst / 60_000)} minute(s) ` +
    `(at ${new Date(Date.now() + msUntilFirst).toLocaleTimeString()})`
  );

  timeoutHandle = setTimeout(() => {
    if (stopped) return;
    fire();
    intervalHandle = setInterval(fire, MS_PER_DAY);
  }, msUntilFirst);

  return {
    stop() {
      stopped = true;
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      if (intervalHandle !== null) clearInterval(intervalHandle);
    },
  };
}
