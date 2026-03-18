# Security Policy

## Reporting Vulnerabilities

**Please do not open public issues for security vulnerabilities.**

If you discover a security vulnerability in Argus, please email **[security@argus.local](mailto:security@argus.local)** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if you have one)

We will:
- Acknowledge receipt within 48 hours
- Work on a fix and release a patch
- Credit you in the release notes (unless you prefer anonymity)

## Security Model

Argus is designed with a transparent, local-first security model:

### What Argus Does

- Monitors running processes on your machine
- Tracks which files are accessed by AI applications
- Logs network connections made by AI applications
- Sends native OS notifications when alerts are triggered
- Stores all data in a local SQLite database

### What Argus Does NOT Do

- **No network requests** — All monitoring happens locally
- **No telemetry** — No data is sent to Anthropic, OpenAI, or any third party
- **No cloud sync** — All data stays on your machine
- **No shell commands executed** — Argus only reads process state; it doesn't modify anything
- **No privilege escalation** — Runs as a regular user (LaunchAgent/systemd)

### Data Storage

All monitoring data is stored in:

```
~/.argus/data.db          # SQLite database (main event log)
~/.argus/logs/daemon.log  # Daemon logs (rotating, max 10 MB)
```

These files are:

- **Local only** — Never synced to cloud or sent anywhere
- **User-readable** — Belong to your user account, not root
- **Inspectable** — You can query the database with `sqlite3`
- **Deletable** — You can safely delete `~/.argus/` at any time

## How to Verify Argus Is Safe

### 1. Check the Source Code

All code is in the `src/` directory. To verify Argus doesn't make network calls:

```bash
# Search for network libraries
grep -r "http\|https\|fetch\|request" src/

# Expected: 0 results (Argus doesn't initiate outbound connections)
```

### 2. Check Dependencies

Inspect all npm dependencies:

```bash
npm ls
```

All dependencies are production-ready, open-source packages:

- `better-sqlite3` — SQLite driver
- `chokidar` — File system watcher
- `node-notifier` — Native OS notifications
- `pino` — Logging
- `ps-list` — Process listing
- Others are utilities with no network access

### 3. Check the Notifications Code

```bash
cat src/notifications/notifier.js
```

Notifications are sent via:
- **macOS**: `node-notifier` (uses native macOS notification API)
- **Linux**: `node-notifier` (uses D-Bus)

No network calls are made.

### 4. Verify No Secrets in Code

```bash
# Check for hardcoded API keys
grep -r "sk-" src/
grep -r "api-key" src/
grep -r "token" src/ | grep -v "// " | grep -v "comment"

# Should return nothing
```

### 5. Verify Database Query Safety

```bash
# Check that all database queries use parameterized statements
grep -r "prepare\|all\|run" src/db/

# All queries should use `?` placeholders, never string concatenation
```

Example of safe query:

```javascript
db.prepare('SELECT * FROM events WHERE app_name = ?').all(appName);
```

Example of unsafe query (DO NOT USE):

```javascript
// ❌ WRONG — vulnerable to SQL injection
db.prepare(`SELECT * FROM events WHERE app_name = '${appName}'`).all();
```

## Platform-Specific Security Considerations

### macOS

- Argus runs as a LaunchAgent in `~/Library/LaunchAgents/com.argus.daemon.plist`
- Does NOT require `sudo` or root access
- Can read from standard user directories (Documents, Downloads, Desktop)
- Uses `launchctl` to manage the service
- Respects macOS System Integrity Protection (SIP) and code-signing restrictions

**TCC (Transparent User Consent):**
- Argus may request Full Disk Access if you explicitly grant it via System Preferences
- This is optional — Argus will still work without it, but with reduced file monitoring

### Linux

- Argus runs as a systemd user service
- Does NOT require `sudo` or root access
- Can read from user home directory (`~`)
- Uses `systemctl --user` to manage the service

## Permissions Required

### macOS

```bash
argus install
# Prompts for:
# - macOS user password (to write LaunchAgent plist)
# - Optional: Full Disk Access permission (for enhanced file monitoring)
```

### Linux

```bash
argus install
# No password required (systemd user service)
# Runs under your own user account
```

## What About the AI Apps Being Monitored?

Argus monitors what these applications do — it does NOT modify their behavior or intercept their network traffic. You should:

1. **Review each AI app's own privacy policy:**
   - **Claude**: https://www.anthropic.com/privacy
   - **ChatGPT**: https://openai.com/policies/privacy-policy
   - **Cursor**: https://www.cursor.com/privacy

2. **Understand what data each app sends to its vendor:**
   - Claude sends prompts to Anthropic's servers
   - ChatGPT sends prompts to OpenAI's servers
   - Cursor may send code snippets to Codeium
   - **Argus cannot stop this** — it only monitors and alerts you

3. **Use Argus to verify expected behavior:**
   - "Did Claude really only connect to `api.anthropic.com`?"
   - "Why is Cursor connecting to an unfamiliar domain?"
   - "Which files did the AI app read?"

## Known Limitations

1. **File Access Monitoring** — Argus uses file system events to detect access. Some accesses may not trigger events (e.g., memory-mapped files, in-process reads from already-open files).

2. **Network Monitoring** — Argus uses `lsof` to enumerate connections. This has a small race condition window where very fast, short-lived connections might not be captured.

3. **Process Classification** — The 6-signal AI detection engine has false positive/negative rates. High-confidence signals (network endpoints, code signing) are reliable; lower-confidence signals (keywords, pipes) can vary.

4. **TCC Database** — macOS TCC database queries require reading a privileged SQLite file. This may require Full Disk Access, which is optional.

## Responsible Disclosure

If you discover a vulnerability:

1. **Do not open a public GitHub issue**
2. **Email security@argus.local** with details
3. **Allow 90 days** for a patch before public disclosure
4. **We will credit you** in release notes (unless you prefer not to)

Examples of security issues:

- SQL injection in database queries
- Hardcoded API keys or credentials
- Unvalidated file paths leading to path traversal
- Insecure deserialization
- Privilege escalation vulnerabilities

## Compliance

Argus respects:

- **macOS**: System Integrity Protection (SIP), Gatekeeper, code signing
- **Linux**: SELinux, AppArmor (if installed), standard user permissions
- **GDPR**: No personal data collection, transmission, or storage on external systems
- **Data Privacy**: All monitoring data is yours — you can delete it anytime

## Security Updates

Subscribe to releases to be notified of security patches:

```bash
# Watch the repository for releases only
# Settings → Notifications → Only releases
```

Or check the releases page regularly:

https://github.com/yourusername/argus/releases

## Questions?

Email **security@argus.local** or open a discussion on GitHub (for non-sensitive topics).

---

**Transparency is security. All Argus code is visible, reviewable, and local-only.**
