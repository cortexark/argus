# Product Hunt Launch

## Tagline (60 chars max)

See what AI agents access on your machine

## Description

AI coding assistants like Claude, Cursor, and Copilot have deep access to your system — they read files, make network calls, and spawn processes. But most developers have zero visibility into what these tools are actually doing on their machines.

Argus is a lightweight menubar app for macOS that monitors AI agent activity in real time. It tracks file access, network connections, and process activity across all major AI tools, then surfaces alerts when something looks off — like an AI app reading your SSH keys, accessing browser password stores, or connecting to an unknown domain.

## Key Features

- **Real-time file monitoring** — Get instant alerts when AI apps access credentials, browser data, .env files, or documents outside your project
- **Network connection tracking** — See every outbound connection from AI tools, with automatic identification of known AI service endpoints (Anthropic, OpenAI, etc.)
- **Credential access alerts** — Immediate notifications when any AI process touches SSH keys, AWS configs, GPG keyrings, or password manager storage
- **Browser automation detection** — Detects when AI agents control your browser via Chrome DevTools Protocol, giving them access to all open tabs
- **100% local and private** — All data stays on your machine in a local SQLite database. No telemetry, no cloud, no accounts. Auto-cleanup after 7 days.

## Links

- GitHub: https://github.com/cortexark/argus
- Install: `brew install --cask argus`
