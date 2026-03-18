#!/usr/bin/env node
/**
 * Argus CLI entry point.
 * Usage:
 *   argus install         - Register as system service
 *   argus uninstall       - Remove system service
 *   argus start           - Start monitoring daemon
 *   argus stop            - Stop monitoring daemon
 *   argus restart         - Restart monitoring daemon
 *   argus status          - Show daemon status + stats
 *   argus logs [flags]    - View logs
 *   argus watch           - Launch interactive dashboard
 *   argus report [flags]  - Generate a report
 *   argus tcc             - Check AI app TCC permissions (macOS)
 *   argus --help          - Show usage
 *   argus _daemon         - Internal: run as daemon (called by service manager)
 */

import { start } from './index.js';
import { generateReport } from './report/report-generator.js';
import { initializeDatabase } from './db/schema.js';
import { config } from './lib/config.js';
import { IS_MAC } from './lib/platform.js';

const command = process.argv[2];

function printUsage() {
  console.log(`
argus — Monitor AI agent and LLM app behavior

Usage:
  argus install            Register as a system service
  argus uninstall          Remove system service
  argus start              Start monitoring daemon
  argus stop               Stop monitoring daemon
  argus restart            Restart monitoring daemon
  argus status             Show daemon status and recent stats
  argus logs [options]     View logs
  argus watch              Launch interactive TUI dashboard
  argus report [options]   Generate a report
  argus tcc                Check AI app TCC permissions (macOS only)
  argus injections         Show prompt injection alerts
  argus feed               Stream live alerts to terminal
  argus export             Export events (--format csv|json|html)
  argus heatmap            Show file access heatmap
  argus timeline           Show correlated event timeline
  argus baseline           Manage behavioral baselines
  argus notify             Configure Slack/email notifications

Injections options:
  --since <duration>   e.g. "1h", "30m", "24h", "7d" (default: 24h)
  --json               Raw JSON output

Logs options:
  --follow / -f        Follow log output (tail -f style)
  --lines N / -n N     Show last N lines (default 50)
  --since <duration>   e.g. "1h", "30m", "2d"
  --level <level>      Filter by log level (trace/debug/info/warn/error)
  --json               Raw JSON output

Report options:
  --since <ISO>       Filter events since ISO timestamp
  --process <name>    Filter to a specific process
  --alerts-only       Only show file access alerts
  --format json       Output JSON instead of text

Examples:
  argus install
  argus start
  argus status
  argus logs -f
  argus logs --since 1h --level warn
  argus watch
  argus report --since 2024-01-01T00:00:00Z
  argus report --format json
  argus tcc
`);
}

// Allowlist of supported output formats.
const ALLOWED_FORMATS = new Set(['text', 'json']);

// Strip ANSI escape sequences and other terminal control characters from a string.
function sanitizeForOutput(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function parseReportFlags(argv) {
  const opts = {};
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--since' && argv[i + 1]) {
      const raw = argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw)) {
        console.error(`Error: --since value must be a UTC ISO 8601 timestamp (e.g. 2024-01-01T00:00:00Z). Got: ${sanitizeForOutput(raw)}`);
        process.exit(1);
      }
      opts.sinceISO = raw;
    } else if (argv[i] === '--process' && argv[i + 1]) {
      const raw = argv[++i];
      if (!/^[\w.\- ]{1,64}$/.test(raw)) {
        console.error(`Error: --process value contains invalid characters or is too long. Got: ${sanitizeForOutput(raw)}`);
        process.exit(1);
      }
      opts.processName = raw;
    } else if (argv[i] === '--alerts-only') {
      opts.alertsOnly = true;
    } else if (argv[i] === '--format' && argv[i + 1]) {
      const raw = argv[++i];
      if (!ALLOWED_FORMATS.has(raw)) {
        console.error(`Error: --format must be one of: ${[...ALLOWED_FORMATS].join(', ')}. Got: ${sanitizeForOutput(raw)}`);
        process.exit(1);
      }
      opts.format = raw;
    }
  }
  return opts;
}

function parseLogsFlags(argv) {
  const opts = {};
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--follow' || argv[i] === '-f') {
      opts.follow = true;
    } else if ((argv[i] === '--lines' || argv[i] === '-n') && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      if (!isNaN(n) && n > 0) opts.lines = n;
    } else if (argv[i] === '--since' && argv[i + 1]) {
      opts.since = argv[++i];
    } else if (argv[i] === '--level' && argv[i + 1]) {
      opts.level = argv[++i];
    } else if (argv[i] === '--json') {
      opts.json = true;
    }
  }
  return opts;
}

switch (command) {
  case 'install': {
    const { runInstall } = await import('./cli/commands/install.js');
    runInstall().catch(err => {
      console.error('Install error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'uninstall': {
    const { runUninstall } = await import('./cli/commands/install.js');
    runUninstall().catch(err => {
      console.error('Uninstall error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'start': {
    const { runStart } = await import('./cli/commands/start-stop.js');
    runStart().catch(err => {
      console.error('Start error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'stop': {
    const { runStop } = await import('./cli/commands/start-stop.js');
    runStop().catch(err => {
      console.error('Stop error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'restart': {
    const { runRestart } = await import('./cli/commands/start-stop.js');
    runRestart().catch(err => {
      console.error('Restart error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'status': {
    const { runStatus } = await import('./cli/commands/start-stop.js');
    runStatus().catch(err => {
      console.error('Status error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'logs': {
    const { runLogs } = await import('./cli/commands/logs.js');
    const logsOpts = parseLogsFlags(process.argv);
    runLogs(logsOpts).catch(err => {
      console.error('Logs error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'watch': {
    (async () => {
      const { launch } = await import('./dashboard/dashboard.js');
      const db = initializeDatabase(config.DB_PATH);
      launch(db);
    })().catch(err => {
      console.error('Error launching dashboard:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'report': {
    const opts = parseReportFlags(process.argv);
    const db = initializeDatabase(config.DB_PATH);
    const report = generateReport(db, opts);
    console.log(report);
    db.close();
    break;
  }

  case 'injections': {
    const { runInjections } = await import('./cli/commands/injections.js');
    const injOpts = {};
    for (let i = 3; i < process.argv.length; i++) {
      if (process.argv[i] === '--since' && process.argv[i + 1]) {
        injOpts.since = process.argv[++i];
      } else if (process.argv[i] === '--json') {
        injOpts.json = true;
      }
    }
    runInjections(injOpts).catch(err => {
      console.error('Injections error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'tcc': {
    if (!IS_MAC) {
      console.log('TCC permissions are a macOS-specific feature.');
      break;
    }
    const { runTcc } = await import('./cli/commands/tcc.js');
    runTcc().catch(err => {
      console.error('TCC error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'web': {
    const { runWeb } = await import('./cli/commands/web.js');
    runWeb().catch(err => {
      console.error('Web server error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'open': {
    const { runOpen } = await import('./cli/commands/web.js');
    runOpen().catch(err => {
      console.error('Open error:', err.message);
      process.exit(1);
    });
    break;
  }

  case 'feed': {
    const args = {};
    for (let i = 3; i < process.argv.length; i++) {
      if ((process.argv[i] === '--severity' || process.argv[i] === '-s') && process.argv[i + 1]) {
        args['--severity'] = process.argv[++i];
      } else if ((process.argv[i] === '--app' || process.argv[i] === '-a') && process.argv[i + 1]) {
        args['--app'] = process.argv[++i];
      }
    }
    const { runFeed } = await import('./cli/commands/feed.js');
    await runFeed({ severity: args['--severity'] || args['-s'], app: args['--app'] || args['-a'] });
    break;
  }

  case 'export': {
    const args = {};
    for (let i = 3; i < process.argv.length; i++) {
      if (process.argv[i] === '--format' && process.argv[i + 1]) args['--format'] = process.argv[++i];
      else if (process.argv[i] === '--since' && process.argv[i + 1]) args['--since'] = process.argv[++i];
      else if (process.argv[i] === '--until' && process.argv[i + 1]) args['--until'] = process.argv[++i];
      else if (process.argv[i] === '--output' && process.argv[i + 1]) args['--output'] = process.argv[++i];
    }
    const { runExport } = await import('./cli/commands/export.js');
    await runExport({ format: args['--format'], since: args['--since'], until: args['--until'], output: args['--output'] });
    break;
  }

  case 'heatmap': {
    const args = {};
    for (let i = 3; i < process.argv.length; i++) {
      if (process.argv[i] === '--since' && process.argv[i + 1]) args['--since'] = process.argv[++i];
      else if (process.argv[i] === '--top' && process.argv[i + 1]) args['--top'] = process.argv[++i];
    }
    const { runHeatmap } = await import('./cli/commands/heatmap.js');
    await runHeatmap({ since: args['--since'], top: args['--top'] });
    break;
  }

  case 'timeline': {
    const args = {};
    for (let i = 3; i < process.argv.length; i++) {
      if (process.argv[i] === '--since' && process.argv[i + 1]) args['--since'] = process.argv[++i];
      else if (process.argv[i] === '--until' && process.argv[i + 1]) args['--until'] = process.argv[++i];
      else if (process.argv[i] === '--app' && process.argv[i + 1]) args['--app'] = process.argv[++i];
      else if (process.argv[i] === '--window' && process.argv[i + 1]) args['--window'] = process.argv[++i];
    }
    const { runTimeline } = await import('./cli/commands/timeline.js');
    await runTimeline({ since: args['--since'], until: args['--until'], app: args['--app'], window: args['--window'] });
    break;
  }

  case 'baseline': {
    const { runBaseline } = await import('./cli/commands/baseline.js');
    await runBaseline(process.argv.slice(2));
    break;
  }

  case 'notify': {
    const { runNotify } = await import('./cli/commands/notify.js');
    await runNotify(process.argv.slice(2));
    break;
  }

  case '_daemon': {
    // Internal command — called by LaunchAgent/systemd service
    start().catch(err => {
      console.error('Daemon error:', err.message);
      process.exit(1);
    });
    break;
  }

  case '--help':
  case '-h':
  case undefined:
  default:
    printUsage();
    break;
}
