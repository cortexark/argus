/**
 * CLI commands for web dashboard.
 *
 *   argus web   — Start the web server only (no daemon), keep process alive
 *   argus open  — Open http://localhost:3131 in the default browser
 */

import { initializeDatabase } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import { startWebServer, WEB_PORT } from '../../web/server.js';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Start the web server with a live DB connection and keep the process running.
 */
export async function runWeb() {
  const db = initializeDatabase(config.DB_PATH);
  const { server } = startWebServer(db);

  const port = WEB_PORT;
  console.log(`Argus web dashboard: http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');

  // Keep process alive
  process.on('SIGINT', () => {
    server.close();
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.close();
    db.close();
    process.exit(0);
  });
}

/**
 * Attempt to open the Argus dashboard URL in the default browser.
 * Falls back to printing the URL if the open command is unavailable.
 */
export async function runOpen() {
  const url = `http://localhost:${WEB_PORT}`;
  const os = platform();

  let cmd;
  let args;

  if (os === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (os === 'linux') {
    cmd = 'xdg-open';
    args = [url];
  } else if (os === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', url];
  } else {
    console.log(`Argus web dashboard: ${url}`);
    return;
  }

  try {
    execFile(cmd, args, (err) => {
      if (err) {
        console.log(`Argus web dashboard: ${url}`);
      }
    });
  } catch {
    console.log(`Argus web dashboard: ${url}`);
  }
}

export default { runWeb, runOpen };
