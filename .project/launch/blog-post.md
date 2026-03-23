# I Built a Tool to See What Claude Code Reads on My Laptop

Last month I was doing a big refactoring session with Claude Code. Renaming modules, moving files around, updating imports. Standard stuff. Claude was handling it well — until I got curious and ran `lsof -c claude` in another terminal.

Claude was reading files I hadn't mentioned. Type definition files three directories up. My `.gitconfig`. A `package.json` from a completely different project in my home directory. None of this was malicious — it was trying to understand my setup to do a better job — but I had absolutely no idea it was happening.

That moment stuck with me. I use Claude Code, Cursor, and Copilot every day. These tools have broad access to my filesystem. They make network calls. They spawn subprocesses. And I had zero visibility into any of it.

So I built Argus.

## What it does

Argus is a macOS menubar app that monitors AI agent activity on your machine. It sits in your tray and watches what Claude, Cursor, ChatGPT, Copilot, Windsurf, Ollama, and about a dozen other AI tools are doing.

Three main things it tracks:

**File access.** Argus monitors when AI processes read sensitive files — SSH keys, AWS credentials, `.env` files, browser password stores, documents. When Claude Code reads your `~/.ssh/id_rsa`, you get a native macOS notification telling you exactly what happened.

**Network connections.** Every outbound connection from an AI process gets logged. Argus identifies known AI service endpoints (Anthropic, OpenAI, Google, etc.) and flags anything it doesn't recognize. If Cursor is talking to `api.openai.com:443`, that's expected. If it's connecting to some random domain on port 4444, you want to know.

**Process activity.** Which AI apps are running, how long their sessions last, CPU and memory usage. Argus tracks session history so you can see patterns over time.

## The dashboard

Everything shows up in a web dashboard that loads inside the menubar popover. Click the tray icon, see what's happening right now. There's a timeline of recent activity, alert counts by severity, and drill-down views for files, network, and processes.

Here's what a typical session looks like. You start Cursor, Argus detects it and logs the session start. Cursor connects to `api.openai.com` — logged, identified as "OpenAI API", no alert. Then it reads your project files — normal, no alert. But if it reads `~/Library/Application Support/Google/Chrome/Default/Login Data`, you get a notification: "Cursor read Chrome profile data — passwords/cookies may be exposed."

That's the kind of thing you want to know about.

## How it works under the hood

The monitoring stack is straightforward:

- **Process scanning** uses `ps-list` to enumerate running processes every 5 seconds, matching against a list of known AI app process names.
- **Network monitoring** uses `netstat -anv` on macOS (with a fallback to `lsof -i`) to catch outbound connections. On Linux it uses `ss`. Each connection is matched against known AI service endpoints.
- **File monitoring** combines `lsof` polling with `chokidar` watches on sensitive credential paths. On macOS, it also taps into the Unified Log for real-time event-driven file access detection — much better than polling for catching transient reads.
- **Browser automation detection** watches for connections on port 9222 (Chrome DevTools Protocol). If an AI agent opens a CDP session, it can read all your open tabs, execute JavaScript, and take screenshots. Argus flags this immediately.

All data goes into a local SQLite database at `~/.argus/data.db`. No cloud. No telemetry. No accounts. The database auto-cleans events older than 7 days to keep the file small.

## What I found surprising

After running Argus on my own machine for a few weeks, a few things stood out:

**Claude Code reads more than you'd expect.** During a typical coding session, it reads dozens of files outside your project — `package.json` files from other projects, global configs, type definitions. It's building context, not exfiltrating data, but the breadth of access is worth knowing about.

**Cursor's network traffic is chatty.** Beyond the expected OpenAI API calls, there are connections to Cursor's own services, analytics endpoints, and update checks. All normal for a commercial app, but I appreciated being able to see it.

**Local LLMs really are local.** Running Ollama with Argus confirmed that my local models weren't making any outbound connections beyond `localhost:11434`. That's the verification I wanted.

## Why not just use Little Snitch?

Little Snitch is great for general network monitoring, but it doesn't understand AI apps. It'll show you that a `node` process made a connection — but which AI tool was that `node` process running? What files did it read before making that connection? What's the session context?

Argus is purpose-built for this. It knows about Claude, Cursor, Copilot, and the rest. It correlates file access with network activity. It understands what's normal (connecting to `api.anthropic.com`) versus what's unusual (reading your Keychain files).

## Install

```bash
brew install --cask argus
```

Or if you prefer npm:

```bash
npm install -g argus
```

The whole thing is open source: [github.com/cortexark/argus](https://github.com/cortexark/argus)

## What's next

A few things on my list:

- **Clipboard monitoring** — detecting when AI tools read your clipboard
- **MCP tool invocation tracking** — as Model Context Protocol becomes standard, monitoring which tools agents call and with what arguments
- **Anomaly detection** — baseline normal behavior per app, then alert on deviations
- **Linux support** — the core monitoring works on Linux already (using `ss` instead of `netstat`), but the Electron menubar is macOS-only for now

If you're using AI coding tools daily, give Argus a try. At minimum, it's educational — you'll learn a lot about what these tools actually do on your machine.

---

*Argus is MIT licensed. Issues and PRs welcome on [GitHub](https://github.com/cortexark/argus).*
