/**
 * argus start   — start the daemon
 * argus stop    — stop the daemon
 * argus restart — restart the daemon
 * argus status  — show daemon status + recent stats
 */

import * as daemonManager from '../../daemon/daemon-manager.js';
import { sendCommand, DaemonNotRunningError } from '../../daemon/ipc-client.js';

/**
 * Start the monitoring daemon.
 */
export async function runStart() {
  console.log('Starting Argus daemon...');

  const result = await daemonManager.start();

  if (result.success) {
    console.log('Argus daemon started.');
    console.log("Run 'argus status' to verify.");
  } else {
    console.error(`Failed to start: ${result.message}`);
    process.exit(1);
  }
}

/**
 * Stop the monitoring daemon.
 */
export async function runStop() {
  console.log('Stopping Argus daemon...');

  const result = await daemonManager.stop();

  if (result.success) {
    console.log('Argus daemon stopped.');
  } else {
    console.error(`Failed to stop: ${result.message}`);
    process.exit(1);
  }
}

/**
 * Restart the monitoring daemon.
 */
export async function runRestart() {
  console.log('Restarting Argus daemon...');

  const result = await daemonManager.restart();

  if (result.success) {
    console.log('Argus daemon restarted.');
  } else {
    console.error(`Failed to restart: ${result.message}`);
    process.exit(1);
  }
}

/**
 * Show daemon status and recent statistics.
 */
export async function runStatus() {
  // First check service manager status
  const svcStatus = await daemonManager.status();

  console.log('\nArgus Status');
  console.log('=================');

  if (svcStatus.running) {
    console.log(`  Service:  RUNNING`);
    if (svcStatus.pid) console.log(`  PID:      ${svcStatus.pid}`);
  } else {
    console.log(`  Service:  STOPPED`);
    console.log(`  Message:  ${svcStatus.message}`);
  }

  // Try to reach the daemon via IPC for live stats
  try {
    const ping = await sendCommand('ping');
    if (ping.ok && ping.data) {
      console.log(`  Daemon:   RESPONDING`);
      if (ping.data.pid) console.log(`  PID:      ${ping.data.pid}`);
    }

    const statusResp = await sendCommand('status');
    if (statusResp.ok && statusResp.data) {
      const d = statusResp.data;
      console.log(`  Uptime:   ${d.uptimeHuman || d.uptime + 's'}`);
      console.log(`  Memory:   ${d.memoryMB}MB`);
    }

    const reportResp = await sendCommand('report');
    if (reportResp.ok && reportResp.data) {
      const r = reportResp.data;
      console.log('\nLast 24h Summary');
      console.log('----------------');
      console.log(`  Processes seen:   ${r.processCount}`);
      console.log(`  File alerts:      ${r.alertCount}`);
      console.log(`  Network events:   ${r.networkCount}`);
    }
  } catch (err) {
    if (err instanceof DaemonNotRunningError || err.code === 'DAEMON_NOT_RUNNING') {
      if (svcStatus.running) {
        console.log('\n  Warning: Service is registered but daemon IPC is not responding.');
        console.log("  Try: argus restart");
      }
    }
    // Other IPC errors are non-fatal for status display
  }

  console.log('');
}

export default { runStart, runStop, runRestart, runStatus };
