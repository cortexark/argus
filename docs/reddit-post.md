# Reddit Post

## Title
Your AI coding tools are reading your Keychain, SSH keys, and Safari data every few seconds. Here's proof.

## Body

Last week I noticed Claude Desktop was using way more memory than usual. Started digging into what it was actually doing on my machine.

Ran `lsof` manually. Scrolled through thousands of lines. Found it was reading my Safari bookmarks, Keychain databases, and SSH agent socket. Every. Few. Seconds.

Then I checked Codex. Same thing — accessing `/etc/hosts`, my Downloads folder, browser data. All happening silently in the background.

The thing is — this isn't malicious. These tools need file access to work. But the fact that I had ZERO visibility into what they were touching bothered me. macOS gives you Little Snitch for network, OverSight for camera/mic. But nothing tells you which files your AI app just read.

So I spent a few weeks building something.

**Argus** sits in your menubar and watches what AI apps do on your Mac:

- Which files they access (SSH keys, keychains, browser data, documents)
- When they accessed them (timestamped log)
- How much they're costing you (reads local Codex/Claude session data and calculates API cost equivalent)

The usage tracking part was eye-opening. I had no idea my Codex sessions burned through **634 million tokens** — that's **$4,400 at standard API rates** on a $200/mo subscription. One single code review session used 245M tokens ($1,500 worth). I would have never known without seeing the numbers.

Everything runs locally. No cloud. No telemetry. Just SQLite on your machine.

It's not a firewall — it can't block anything. It just shows you what's happening so you can decide if you're comfortable with it.

Open source, MIT licensed: https://github.com/cortexark/argus

Screenshots in comments showing what it caught on my machine.

## First Comment

Screenshot 1 — Overview dashboard. 5 AI apps detected, 37 sensitive file accesses caught in 24 hours. Claude Desktop hitting Keychains and Safari data. Each access can be marked Expected or Suspicious.

Screenshot 2 — Usage tab. 634M tokens across 21 Codex sessions. $4.4K at API rates. Model breakdown shows gpt-5.3-codex ate 494M of those tokens.

Screenshot 3 — File alerts with timestamps. Every time an AI app touches your credentials, browser data, or system files — it's logged with date, time, app name, file path, and severity.

## Suggested Subreddits
- r/macapps
- r/artificial
- r/privacy
- r/selfhosted
- r/programming

## Screenshots (all blurred, safe to post)
- docs/screenshots/01-overview.png
- docs/screenshots/02-usage.png
- docs/screenshots/03-file-alerts.png
