# Argus

[![CI Tests](https://github.com/todo/argus/actions/workflows/test.yml/badge.svg)](https://github.com/todo/argus/actions)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Argus sees everything your AI apps do.**

Monitor exactly what your AI applications access on your machine — files, credentials, browser data, and network connections. Argus uses a 6-signal AI detection engine to identify AI processes with surgical precision, then tracks their behavior with system notifications.

## Why Argus?

AI desktop applications like Claude, Cursor, ChatGPT, and GitHub Copilot run on your machine with broad permissions. You have tools like Little Snitch to watch network ports and OverSight to monitor camera/microphone access. **But nothing tells you exactly which files your AI app just read, whether they contain prompt injection attacks, or if your SSH keys were accessed.**

Argus fills that gap with transparent, real-time monitoring built on open-source tooling you can inspect.

### The Problem

- Claude might read `/Documents/secret-project.md` — does it contain sensitive data?
- Cursor connected to `api.openai.com` — or is it `api-exfil.com` (typosquatting)?
- ChatGPT accessed `~/.ssh/id_rsa` — credential theft risk.
- A Node.js process claims to be an AI agent — how can you verify?

Argus detects and alerts on all of these with specific, actionable notifications.

## What Argus Detects

| Signal | Detection Method | Risk Level |
|--------|------------------|------------|
| **Process Ancestry** | Walks parent process tree for known AI apps (Claude, Cursor, ChatGPT, etc.) | Definitive |
| **MCP Server Pattern** | Detects stdin/stdout pipes → MCP server spawned by AI orchestrator | High confidence |
| **AI Keywords** | Scans command line for `claude`, `langchain`, `openai`, `copilot`, `agent`, etc. | Medium confidence |
| **Network Endpoints** | Monitors connections to Anthropic, OpenAI, Google, Mistral, Ollama APIs | Definitive |
| **TCC Permissions** | Checks if process has Full Disk Access on macOS | Escalation indicator |
| **Code Signing** | Verifies code-signing authority on binaries (Anthropic, OpenAI, GitHub, etc.) | Definitive |

**Score calculation:**
- Score ≥ 50 → `CONFIRMED_AI` (at least one definitive signal)
- Score 30–49 → `LIKELY_AI` (multiple confidence signals)
- Score < 30 → `NOT_AI` (background noise filtered out)

### File Access Monitoring

When an AI app reads sensitive files, Argus classifies by risk level:
- **🔑 Credentials** — `.ssh/`, `.aws/`, `.gnupg/`, 1Password, Bitwarden
- **🌐 Browser Data** — Chrome/Firefox/Safari passwords, cookies, history
- **📄 Documents** — Files in `~/Documents`, `~/Downloads`, `~/Desktop`
- **⚙️ System Files** — `/etc/passwd`, `.env`, `.npmrc`

### Browser Automation Detection

Argus detects four types of browser access:
1. **Direct CDP connections** — AI agents connecting to Chrome on port 9222
2. **Browser process spawning** — AI apps launching (headless) Chrome/Firefox
3. **AppleScript control** — Using `osascript` to automate Safari or Chrome
4. **Browser extension calls** — Browser extensions making requests to AI APIs

### Notifications

Every alert tells you exactly what happened:

```
Argus — Claude
🔑 Credentials access detected
Accessed credential file: ~/.ssh/id_rsa
SSH key / cloud credential risk.

---

Argus — Cursor
new_connection
Connected to api.openai.com  port 443

---

Argus — node (AI agent)
⚙️ System Files
Read 3 sensitive files
1× 🔑 Credentials, 2× 📄 Documents
```

**Throttling:** Max 1 notification per (app + alert type) per 5 minutes.
**Batching:** If 3+ file alerts fire in quick succession, they're grouped into one summary.

## Real-World Example

Here's Argus running on a live machine during an active Claude Code session:

```
$ argus status

Argus Status
=================
  Service:  RUNNING
  PID:      69546
  Daemon:   RESPONDING
  Uptime:   6s
  Memory:   94MB

Last 24h Summary
----------------
  Processes seen:   3
  File alerts:      21
  Network events:   5,265
```

```
$ argus heatmap

Access Heatmap (last 24h)
────────────────────────────────────────────────────────────────────────────────
~/Library/Keychains                       ██████████████████████████████  (14)
~/Library/Keychains/6DB3F6AA-C887-.../   ███████████████                 (7)
────────────────────────────────────────────────────────────────────────────────
```

**What was found:**

| File | Times | Severity | Who |
|------|-------|----------|-----|
| `~/Library/Keychains/login.keychain-db` | 14× | CRITICAL | Claude Code |
| `~/Library/Keychains/6DB3F6AA-.../keychain-2.db-wal` | 7× | CRITICAL | Claude Code |

**Network connections detected:**

| App | Remote | Port | Service |
|-----|--------|------|---------|
| Claude (Anthropic) | `2607:6bc0::10` | 443 | Anthropic CDN |
| Claude (Anthropic) | `34.149.66.137` | 443 | Google Cloud |
| Claude (Anthropic) | `160.79.104.10` | 443 | Cloudflare |
| Claude (Anthropic) | `172.65.251.78` | 443 | Cloudflare |
| Claude (Anthropic) | `2606:50c0:8003::154` | 443 | GitHub CDN |

```
$ argus export --format csv

timestamp,app,event_type,detail,severity
2026-03-18T01:22:19Z,Claude (Anthropic),FILE,~/Library/Keychains/login.keychain-db,CRITICAL
2026-03-18T01:10:04Z,Claude (Anthropic),FILE,~/Library/Keychains/login.keychain-db,CRITICAL
2026-03-18T00:54:23Z,Claude (Anthropic),FILE,~/Library/Keychains/keychain-2.db-wal,CRITICAL
2026-03-18T00:43:16Z,Claude (Anthropic),NET,api.anthropic.com,INFO
...
```

> The Keychain reads are Claude Code fetching git/SSH credentials. Network traffic is all Anthropic/Cloudflare/GitHub — nothing suspicious. This is exactly the kind of transparency Argus provides.

---

## Quick Install

### macOS & Linux

```bash
npm install -g argus
argus install
argus start
argus status
```

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/argus/main/install.sh | bash
```

The installer will:
1. Verify Node.js ≥ 18 is installed
2. Install Argus globally via npm
3. Register it as a system service (LaunchAgent on macOS, systemd on Linux)
4. Start the daemon
5. Print command reference

## Commands

### Service Management

```bash
argus install              # Register Argus as a persistent system service
argus uninstall            # Remove system service
argus start                # Start monitoring daemon
argus stop                 # Stop monitoring daemon
argus restart              # Restart monitoring daemon
argus status               # Show daemon status + event counts
```

### Live Monitoring

```bash
argus watch                # Launch interactive TUI dashboard
argus logs -f              # Follow live logs (tail -f style)
```

### Log Viewing

```bash
argus logs [options]
  --follow / -f            Follow output (tail -f style)
  --lines N / -n N         Show last N lines (default 50)
  --since <duration>       e.g., "1h", "30m", "2d"
  --level <level>          Filter by level: trace|debug|info|warn|error
  --json                   Raw JSON output

# Examples
argus logs -f
argus logs --since 1h --level warn
argus logs --json | jq '.msg'
```

### Reporting

```bash
argus report [options]
  --since <ISO>            Filter events since timestamp (ISO 8601)
  --process <name>         Filter to specific process
  --alerts-only            Show only file access alerts
  --format json            Output JSON instead of text

# Examples
argus report --since 2024-01-01T00:00:00Z
argus report --process Claude --format json
argus report --alerts-only
```

### macOS Permissions Check

```bash
argus tcc                  # Check which AI apps have Full Disk Access
                           # (macOS only — shows TCC database entries)
```

## How It Works

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Argus Daemon (runs in background)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Process Scanner (every 5s)                           │  │
│  │ ├─ ps -A → process tree                             │  │
│  │ └─ 6-signal AI classifier per process               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ File Monitor (chokidar)                              │  │
│  │ └─ Watch AI processes → file access events          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Network Monitor (lsof)                               │  │
│  │ └─ Enumerate AI process connections                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Browser Monitor                                      │  │
│  │ ├─ Detect CDP (Chrome DevTools) connections         │  │
│  │ ├─ Detect browser spawning                          │  │
│  │ ├─ Detect AppleScript browser control               │  │
│  │ └─ Detect browser extension API calls               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ SQLite Event Store (~/.argus/data.db)               │  │
│  │ ├─ process_classifications                          │  │
│  │ ├─ file_events                                      │  │
│  │ ├─ network_events                                   │  │
│  │ └─ browser_events                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Notifier (throttled + batched)                       │  │
│  │ └─ Native OS notifications → user                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

                          ↓ IPC socket

                 ┌─────────────────────┐
                 │ Argus CLI           │
                 ├─────────────────────┤
                 │ status, logs,       │
                 │ watch, report, tcc  │
                 └─────────────────────┘
```

### Data Flow

1. **Discovery** — Process scanner runs every 5 seconds, building a process tree via `ps -A`
2. **Classification** — Each AI process is scored on 6 signals (ancestry, pipes, keywords, network, TCC, code signing)
3. **File Monitoring** — Chokidar watches known AI app working directories for file access
4. **Network Monitoring** — `lsof` enumerates active connections from AI processes
5. **Storage** — All events written to SQLite at `~/.argus/data.db` (never leaves your machine)
6. **Notification** — Throttled, batched alerts sent as native OS notifications
7. **Reporting** — CLI generates human-readable or JSON reports from the event database

### Supported AI Apps

| App | Category | Process Name |
|-----|----------|--------------|
| Claude | LLM Desktop | `claude`, `Claude` |
| ChatGPT | LLM Desktop | `ChatGPT`, `chatgpt` |
| Cursor | AI Code Editor | `cursor`, `Cursor` |
| VS Code + Copilot | AI Code Editor | `Code`, `code` |
| Windsurf | AI Code Editor | `windsurf`, `Windsurf` |
| Continue.dev | AI Code Editor | `continue` |
| Perplexity | LLM Desktop | `Perplexity` |
| Ollama | Local LLM | `ollama` |
| LM Studio | Local LLM | `LM Studio`, `lmstudio` |
| GitHub Copilot | AI Assistant | `copilot` |
| Amazon Q | AI Assistant | `amazonq`, `Amazon Q` |
| Tabnine | AI Code Editor | `tabnine` |
| Node.js agents | Runtime | `node` |
| Python agents | Runtime | `python`, `python3` |

Detected **AI endpoints:**
- Anthropic Claude API
- OpenAI API (ChatGPT, GPT-4, etc.)
- Google Gemini API
- Mistral AI
- Cohere
- Together AI
- OpenRouter
- Hugging Face
- Replicate
- Codeium/Windsurf
- GitHub Copilot
- Perplexity AI

## Data Storage

All monitoring data is stored in an SQLite database at `~/.argus/data.db`. This database is:

- **Local-only** — Never leaves your machine or is sent to any server
- **Permanent** — Survives daemon restarts, reboots, and app updates
- **Queryable** — Can be inspected directly with `sqlite3`
- **Portable** — Copy `~/.argus/` to backup or analyze on another machine

Logs are written to `~/.argus/logs/` (rotating, max 10 MB per file).

## Requirements

- **Node.js** ≥ 18.0.0
- **macOS** 12+ (Monterey or later) **or** **Linux** (Ubuntu 20+, Debian 11+, etc.)
- **No root required** — Runs as a user LaunchAgent (macOS) or systemd service (Linux)
- **SQLite** — Built-in on all supported platforms
- **lsof** — Pre-installed on macOS; install on Linux: `sudo apt-get install lsof`

## Development

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
npm test
```

All tests are in `/tests`. The test suite includes:
- Unit tests for classifiers, monitors, and utilities
- Integration tests for database operations
- E2E tests for CLI commands
- **238 tests, 0 failures**

### Test Coverage

```bash
# View test output with details
node tests/run.js
```

Tests are run on Node 18, 20, and 22 in CI.

### Project Structure

```
argus/
├── src/
│   ├── index.js                    # Main daemon entry point
│   ├── cli.js                      # CLI command dispatcher
│   ├── ai-apps.js                  # Registry of AI apps + detection config
│   ├── lib/
│   │   ├── config.js               # Frozen config object
│   │   ├── platform.js             # macOS/Linux detection
│   │   ├── exec.js                 # Async command executor
│   │   └── logger.js               # Pino logger setup
│   ├── monitors/
│   │   ├── process-classifier.js   # 6-signal AI detection engine
│   │   ├── process-scanner.js      # Process tree builder
│   │   ├── file-monitor.js         # Watch file access
│   │   ├── network-monitor.js      # Track network connections
│   │   └── browser-monitor.js      # Detect browser automation
│   ├── db/
│   │   ├── schema.js               # SQLite schema init
│   │   └── store.js                # Database CRUD operations
│   ├── notifications/
│   │   └── notifier.js             # Throttled + batched alerts
│   ├── daemon/
│   │   ├── daemon-manager.js       # Main event loop
│   │   ├── launchd.js              # macOS LaunchAgent setup
│   │   └── ipc-client.js           # IPC for CLI commands
│   ├── cli/
│   │   └── commands/               # Command implementations
│   ├── dashboard/
│   │   └── dashboard.js            # TUI dashboard (blessed)
│   └── report/
│       └── report-generator.js     # Report formatting
├── tests/
│   ├── run.js                      # Test runner
│   └── [test files]
├── install.sh                      # One-liner installer
└── package.json
```

### Adding a New AI App

1. Add entry to `AI_APPS` in `src/ai-apps.js`:
   ```javascript
   'myapp': { name: 'My AI App', category: 'AI Code Editor' },
   ```

2. Add any app-specific keywords to `CMD_KEYWORDS` in `src/monitors/process-classifier.js`

3. Add any app-specific API endpoints to `AI_ENDPOINTS` in `src/ai-apps.js`

4. Add tests to ensure detection works

### Adding a New Injection Pattern

Edit `SENSITIVE_PATHS` in `src/ai-apps.js` to add file paths or credential locations to monitor.

### Adding a New Notification Type

Edit `src/notifications/notifier.js` and add a function to the `notify` object:

```javascript
export const notify = {
  myAlert(appName, detail) {
    return sendAlert(appName, 'my_alert', `Custom message: ${detail}`);
  },
};
```

## Security & Privacy

### How Argus Stays Safe

- **No internet access** — Argus is purely local. Data never leaves your machine.
- **Open source** — All monitoring logic is visible in this repository.
- **No telemetry** — No analytics, crash reporting, or tracking.
- **SQLite-only** — Events stored in a local database file you can inspect.
- **Read-only** — Argus only reads process information; it doesn't modify anything.

### How to Verify Argus Isn't Malicious

1. Inspect `src/` — all networking code is in `monitors/network-monitor.js`
2. Check `src/notifications/notifier.js` — notifications only use `node-notifier` (native OS API)
3. Search for `http` or `https` — none in production code
4. Run `npm ls` to inspect all dependencies (all are production-ready open-source packages)

## Uninstall

```bash
argus uninstall
npm uninstall -g argus
rm -rf ~/.argus
```

## Troubleshooting

### Daemon won't start

```bash
argus logs --level error
```

Check if Node.js is installed and in PATH:
```bash
which node
node --version
```

### No notifications appearing

1. Check if daemon is running: `argus status`
2. Check macOS notifications settings — Argus needs permission to notify
3. Test manually: `argus logs -f` to see events in real-time

### Too many notifications

Adjust throttle interval in `src/lib/config.js`:
```javascript
NOTIFICATION_THROTTLE_MS: 300000,  // 5 minutes
```

### High CPU usage

Reduce scan intervals in `src/lib/config.js`:
```javascript
SCAN_INTERVAL_MS: 5000,              // process scan every 5s
FILE_MONITOR_INTERVAL_MS: 3000,      // file monitor every 3s
NETWORK_MONITOR_INTERVAL_MS: 3000,   // network scan every 3s
```

## License

MIT — See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Adding new AI apps
- Adding new injection patterns
- Creating new notification types
- Running and writing tests

## Related Tools

- **Little Snitch** — Network firewall (port-level monitoring)
- **OverSight** — Camera/microphone access monitor
- **Lulu** — Open-source firewall
- **Santa** — Google's binary authorization tool

Argus complements these tools by focusing specifically on **what AI applications access on your machine**.

---

**Stay curious. Stay in control.**
