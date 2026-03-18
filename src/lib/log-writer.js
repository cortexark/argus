/**
 * Pino structured logger writing to ~/.argus/logs/argus.log
 * Handles log rotation when file exceeds MAX_LOG_SIZE_MB.
 * Exports: log (pino instance), rotateLogs(), getLogDir(), getLogPath()
 */

import pino from 'pino';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

const LOG_DIR = config.LOG_DIR;
const LOG_PATH = join(LOG_DIR, 'argus.log');

export function getLogDir() { return LOG_DIR; }
export function getLogPath() { return LOG_PATH; }

// rotateLogs() is now handled by pino-roll automatically; kept for API compat
export function rotateLogs() {}

export function createLogger() {
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });

  // pino-roll handles rotation: new file every 10MB, keep 5 generations
  const transport = pino.transport({
    target: 'pino-roll',
    options: {
      file: LOG_PATH,
      size: `${config.MAX_LOG_SIZE_MB}m`,
      limit: { count: 5 },      // keep 5 rotated files
      mkdir: true,
    },
  });

  return pino(
    {
      level: process.env.ARGUS_LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport,
  );
}

export const log = createLogger();

export default { log, rotateLogs, getLogDir, getLogPath, createLogger };
