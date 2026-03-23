# Argus — Product Requirements Document & Roadmap

**Version:** 1.0
**Date:** 2026-03-21
**Author:** PM Orchestrator
**Status:** Draft — Awaiting User Gate 1 Approval

---

## 1. Problem Statement

AI coding agents (Claude Code, Cursor, Copilot, ChatGPT) run on developer machines with broad filesystem access. Developers have no visibility into what these tools read — SSH keys, credentials, personal documents, browser passwords. Existing macOS security tools monitor network (Little Snitch) or camera/mic (OverSight) but **no consumer tool monitors AI filesystem access**.

Enterprise solutions (Zenity, LangGuard) cost $10k+/yr and require IT deployment. Individual developers have zero transparency into AI agent behavior on their machines.

## 2. Vision

**Argus is the "OverSight for AI agents"** — a free, open-source desktop tool that shows developers exactly what AI applications access on their machine.

## 3. Target Users

| Persona | Need | Willingness to Pay |
|---------|------|-------------------|
| Security-conscious developer | Know what AI reads on my machine | $0-30/mo |
| Privacy advocate | Verify AI privacy claims | $0 (OSS) |
| Enterprise dev / security team | Compliance audit trail | $30-100/seat/mo |

## 4. Success Metrics

### North Star Metric
**Weekly Active Installations (WAI)** — Number of unique machines running Argus at least once in a 7-day period.

### Secondary Metrics

| Metric | Target (90 days) | Target (1 year) |
|--------|------------------|-----------------|
| GitHub stars | 1,000 | 10,000 |
| Weekly active installations | 500 | 5,000 |
| Homebrew installs/week | 50 | 500 |
| Contributors (PRs merged) | 10 | 50 |
| Blog/article mentions | 5 | 30 |
| Discord/community members | 200 | 2,000 |

### Success Threshold
- **Success:** 1,000 WAI within 6 months
- **Strong signal:** 5,000+ GitHub stars within 1 year
- **Failure indicator:** <100 WAI after 3 months of active marketing

## 5. Product Roadmap

### Phase A: Launch & Distribution (Weeks 1-2) — NOW

**Goal:** Make Argus installable in < 60 seconds

| Task | Priority | Status |
|------|----------|--------|
| Fix all known bugs | P0 | DONE |
| Tray icon with alert states | P0 | DONE |
| App start/stop notifications | P0 | DONE |
| Eye icon design (macOS template) | P0 | DONE |
| README with correct badges/URLs | P0 | DONE |
| GitHub issue templates | P0 | DONE |
| Homebrew cask formula | P0 | DRAFTED |
| Screenshot automation script | P1 | DRAFTED |
| Landing page | P1 | DRAFTED |
| DMG build + sign | P0 | TODO |
| First GitHub Release (v1.0.0) | P0 | TODO |
| Submit Homebrew cask PR | P0 | TODO |

**Acceptance Criteria:**
- `brew install --cask argus` works
- DMG download + drag-to-Applications works
- First-run experience: install → see tray icon → detect AI app < 30 seconds

---

### Phase B: Go-to-Market (Weeks 2-4)

**Goal:** Get Argus in front of the developer audience

| Channel | Action | Expected Impact |
|---------|--------|----------------|
| Hacker News | Show HN post | 200-500 stars, 50-200 installs |
| Product Hunt | Launch listing | 100-300 upvotes, brand awareness |
| Reddit | Posts in 4 subreddits | Community seeding |
| Twitter/X | 3 tweet variations | Developer reach |
| Dev.to | Blog post with real examples | SEO, credibility |
| YouTube | 60s demo video | Visual proof |
| GitHub | Topics, description, social preview | Organic discovery |

**Acceptance Criteria:**
- All launch posts published
- First 100 GitHub stars within 2 weeks
- At least 1 organic mention/repost

---

### Phase C: Core Product Improvements (Weeks 4-8)

**Goal:** Make Argus indispensable for daily use

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| MCP server monitoring | P0 | Medium | High — unique differentiator |
| Auto-update (electron-updater) | P0 | Small | High — security tool must stay current |
| Onboarding flow (first-run wizard) | P1 | Small | Medium — reduces drop-off |
| Export to CSV/JSON from dashboard | P1 | Small | Medium — compliance use case |
| Daily digest email (opt-in) | P2 | Medium | Low-medium |
| Clipboard monitoring | P2 | Medium | Medium |

**Acceptance Criteria:**
- MCP server detection working for Claude Code + Cursor
- Auto-update notifies user of new versions
- First-run wizard explains what Argus does in 3 steps

---

### Phase D: Community & Ecosystem (Weeks 8-16)

**Goal:** Build a community around AI transparency

| Initiative | Action |
|-----------|--------|
| Discord server | Community support, feature requests |
| Contributing guide | Clear path for OSS contributors |
| Plugin system | Let users add custom monitors |
| AI app registry PRs | Accept community additions |
| Conference talks | Security conferences (BSides, DEF CON villages) |
| Partnership outreach | Objective-See, EFF, ACLU tech |

---

### Phase E: Monetization Exploration (Months 4-6)

**Goal:** Explore sustainable funding without compromising OSS values

| Model | Approach | Notes |
|-------|----------|-------|
| GitHub Sponsors | Individual donations | Low friction |
| Open Collective | Community funding | Transparent |
| Pro tier (optional) | Email/webhook alerts, multi-machine sync | Freemium |
| Enterprise license | Fleet management, SIEM integration | B2B |
| Consulting | AI security audits using Argus | Services |

**Non-negotiable:** Core monitoring functionality stays free and open-source forever. Paid features are operational (alerting channels, fleet management), never detection capabilities.

---

## 6. Competitive Positioning

### One-liner
"See what AI agents access on your machine."

### Elevator Pitch (30 seconds)
"You use Little Snitch to see where apps connect. You use OverSight to see what uses your camera. But nothing tells you when Claude Code reads your SSH keys or Cursor accesses your Chrome passwords. Argus monitors what AI apps do on your filesystem — files, credentials, browser data — with real-time notifications. It's free, open-source, and everything stays on your machine."

### vs. Little Snitch
"Little Snitch shows you network connections. Argus shows you file access. They're complementary — use both."

### vs. Zenity
"Zenity is for enterprise IT teams managing hundreds of machines. Argus is for individual developers who want transparency on their own machine. Free vs. $10k+/yr."

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| macOS permission changes break lsof/netstat | Medium | High | Monitor macOS betas, maintain fallback paths |
| Apple sandboxing prevents file monitoring | Low | Critical | Use Unified Log (already implemented), TCC checks |
| AI tools move to fully sandboxed execution | Low | Medium | Argus value shifts to verifying sandbox claims |
| Enterprise competitor releases free tier | Medium | High | Double down on OSS trust, community, transparency |
| Low adoption despite marketing | Medium | Medium | Iterate on positioning, try different channels |

---

## 8. Out of Scope (v1.x)

- Enforcement/blocking (monitor only — this is by design)
- Windows support
- Mobile AI agent monitoring
- AI model output monitoring (prompt/response logging)
- Cloud deployment
