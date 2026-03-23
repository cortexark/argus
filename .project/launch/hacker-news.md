# Show HN Post

## Title

Show HN: Argus – See what AI coding agents access on your Mac

## Body

I've been using Claude Code, Cursor, and Copilot daily. They read files, make network calls, and spawn subprocesses — but there's no good way to see exactly what they're doing on your machine.

So I built Argus. It's a menubar app for macOS that monitors AI agent activity in real time:

- **File access tracking**: alerts when an AI app reads your SSH keys, AWS credentials, browser password stores, or .env files
- **Network monitoring**: shows every outbound connection, flags unknown destinations, detects browser automation via Chrome DevTools Protocol
- **Process tracking**: logs which AI apps are running, session durations, resource usage
- **Real-time notifications**: native macOS alerts for credential access, suspicious ports, unknown domains

It watches Claude, Cursor, ChatGPT, Copilot, Windsurf, Ollama, LM Studio, and more. Uses lsof/netstat for network, chokidar for filesystem events, and macOS Unified Log for real-time process tracing.

Stack: Node.js + Electron menubar + better-sqlite3 + web dashboard. Data stays local — everything is stored in ~/.argus/data.db with automatic 7-day cleanup.

I built this after I noticed Claude Code reading files outside my project directory during a refactoring session. Not malicious — it was looking for type definitions — but I had no idea it was happening until I checked lsof manually.

Install: `brew install --cask argus` or `npm install -g argus`

GitHub: https://github.com/cortexark/argus

Would love feedback on what other signals are worth monitoring. Currently thinking about clipboard access detection and tracking MCP tool invocations.
