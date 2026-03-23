# Reddit Launch Posts

---

## r/MacApps

**Title:** Argus — a menubar app that monitors what AI coding tools access on your Mac

I built a menubar utility that watches what AI apps (Claude, Cursor, Copilot, ChatGPT, etc.) are doing on your system. It sits in your menu bar and tracks file access, network connections, and process activity in real time.

The dashboard shows you things like:
- Which files each AI tool has read (especially credentials, browser data, .env files)
- Every outbound network connection and where it's going
- Session history — when each AI app was active and for how long

It's an Electron app with a web dashboard, stores everything locally in SQLite, and auto-cleans data older than 7 days. No accounts, no cloud, no telemetry.

Install via `brew install --cask argus` or check it out: https://github.com/cortexark/argus

---

## r/privacy

**Title:** I built an open-source tool to audit what AI assistants access on your computer

AI coding assistants now have broad filesystem and network access on developer machines. Claude Code can read any file you give it access to. Cursor indexes your entire project. Copilot sends code context to GitHub's servers.

I wanted to actually see what's happening, so I built Argus — an open-source monitor that tracks:

- File reads by AI processes (SSH keys, AWS creds, browser password stores, .env files)
- Every network connection AI tools make and where the data goes
- Browser automation via DevTools Protocol (an AI agent can silently read all your open tabs)
- Process spawning and session durations

Everything stays local. SQLite database on disk, 7-day auto-cleanup, no network calls of its own. The entire codebase is on GitHub if you want to audit it: https://github.com/cortexark/argus

This isn't about blocking AI tools — it's about knowing what they do. The same way Little Snitch shows you network traffic, Argus shows you AI activity.

---

## r/artificial

**Title:** Open-source tool to monitor what AI agents actually do on your machine

As AI agents get more capable (Claude with computer use, Cursor's agentic mode, Codex running commands), they're getting deeper access to our systems. But the visibility into what they're doing hasn't kept up.

I built Argus to fill that gap. It's a macOS menubar app that monitors AI agent activity — file access, network connections, process activity — and alerts you in real time when something looks unusual.

Some things it catches:
- AI app reading your ~/.ssh/id_rsa or ~/.aws/credentials
- Connections to unrecognized domains (not the expected AI API endpoints)
- Browser automation via CDP (an agent controlling Chrome can see everything)
- Unexpected ports being used

It monitors Claude, Cursor, ChatGPT, Copilot, Windsurf, Ollama, LM Studio, and others. Fully open source, runs locally, no data leaves your machine.

https://github.com/cortexark/argus

---

## r/LocalLLaMA

**Title:** Built a monitoring tool that tracks what AI coding agents access on your system — works with Ollama and LM Studio too

For those of us running local models alongside cloud AI tools, I built Argus — a menubar app that shows you what all your AI tools are actually doing on your machine.

It monitors Ollama, LM Studio, and the cloud-based tools (Claude, Cursor, Copilot, etc.) and tracks:

- File access — what files each tool reads, with alerts for sensitive paths
- Network connections — where data is being sent (useful for verifying your local models really are staying local)
- Process activity — resource usage, session durations

One thing I found useful: Argus confirmed that my Ollama setup wasn't making any outbound connections beyond localhost:11434. Meanwhile, it showed me exactly which API endpoints Cursor was hitting in the background.

The network monitoring uses netstat on macOS (falls back to lsof) and ss on Linux. Data is stored locally in SQLite.

GitHub: https://github.com/cortexark/argus
Install: `brew install --cask argus` or `npm install -g argus`
