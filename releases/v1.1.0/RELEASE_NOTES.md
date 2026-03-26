# Argus v1.1.0

Released: 2026-03-26

## Download

- **Argus-1.1.0-arm64.dmg** — macOS Apple Silicon (M1/M2/M3/M4)

## What's New

- AI Tool Usage Tracker — reads local session data from Codex, Claude Code, and Cursor to show token counts, API cost equivalents, and model breakdowns
- Switch to Basic/Deep mode from the dashboard with reliable restart
- Date + time in file alerts, network events, approvals, and activity feed
- Blurred screenshots in README for privacy

## Bug Fixes

- Fix configuredMode fallback bug in privacy mode toggle
- Fix Electron restart callback (app.relaunch reliability)
- Fix settings.json read priority over stale env var on restart
- Remove aggressive GPU disabling that caused blank windows on some Macs

## Test Results

- 640+ tests passed, 0 failed

## Install

Download the DMG above, or install from source:

```bash
npm install -g argus-monitor
argus install && argus start
```
