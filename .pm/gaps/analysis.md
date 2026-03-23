# Argus Gap Analysis — WINNING Filter Scoring

**Last Updated:** 2026-03-21

## Methodology

Each gap scored on 6 WINNING criteria (max 60 points):
- **W**orthwhile (0-10): Does it solve a real user problem?
- **I**mpactful (0-10): How many users does it affect?
- **N**ovel (0-10): Does it differentiate from competitors?
- **N**ecessary (0-10): Is it required for adoption?
- **I**mplementable (0-10): Can we build it with current resources?
- **G**rowth (0-10): Does it drive acquisition/retention?

**Decision thresholds:**
- 45-60: FILE (build it)
- 30-44: WAIT (monitor, revisit)
- 0-29: SKIP (not worth it)

---

## Gap 1: Homebrew / One-Click Install

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 9 | Developers expect `brew install` |
| Impactful | 9 | Blocks adoption for every new user |
| Novel | 3 | Table stakes, not differentiating |
| Necessary | 10 | Without easy install, nobody tries it |
| Implementable | 9 | DMG already builds, cask formula drafted |
| Growth | 10 | Direct driver of acquisition |
| **TOTAL** | **50** | **FILE** |

---

## Gap 2: MCP Server Deep Monitoring

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 8 | MCP is how AI agents gain tool access |
| Impactful | 7 | Growing rapidly with Claude, Cursor |
| Novel | 9 | Only Zenity (enterprise) does this |
| Necessary | 6 | Current process ancestry detection partially covers |
| Implementable | 7 | Need to parse MCP transport, detect tool calls |
| Growth | 8 | Key differentiator for dev audience |
| **TOTAL** | **45** | **FILE** |

---

## Gap 3: Clipboard Monitoring

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 7 | AI apps can read clipboard (passwords, secrets) |
| Impactful | 6 | Moderate — clipboard access is less common |
| Novel | 8 | Nobody monitors AI clipboard access |
| Necessary | 4 | Nice-to-have, not blocking adoption |
| Implementable | 6 | macOS clipboard API is accessible but polling-based |
| Growth | 5 | Minor feature, won't drive installs |
| **TOTAL** | **36** | **WAIT** |

---

## Gap 4: Enforcement Mode (Block Access)

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 8 | Users ask "can it block access?" frequently |
| Impactful | 7 | Changes product category from monitor to firewall |
| Novel | 5 | Little Snitch already blocks network; sandbox exists for filesystem |
| Necessary | 3 | Argus's value is transparency, not enforcement |
| Implementable | 3 | macOS sandboxing is extremely complex, needs entitlements |
| Growth | 6 | Appeals to enterprise buyers |
| **TOTAL** | **32** | **WAIT** |

---

## Gap 5: Multi-Machine Dashboard (Enterprise)

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 7 | Enterprise teams need fleet-wide view |
| Impactful | 4 | Only enterprise persona needs this |
| Novel | 3 | Zenity, LangGuard already do this |
| Necessary | 2 | Core individual use case works without |
| Implementable | 4 | Requires server, auth, agent deployment |
| Growth | 7 | Unlocks enterprise revenue |
| **TOTAL** | **27** | **SKIP (for now)** |

---

## Gap 6: Webhook / Email / Slack Notifications

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 6 | Remote alerting for unattended machines |
| Impactful | 5 | Power users and enterprise |
| Novel | 3 | Standard feature in monitoring tools |
| Necessary | 4 | macOS notifications work for attended use |
| Implementable | 8 | DB schema exists, just needs sender |
| Growth | 4 | Won't drive installs |
| **TOTAL** | **30** | **WAIT** |

---

## Gap 7: Auto-Update / Update Notifications

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 8 | Security tool MUST stay updated |
| Impactful | 9 | Every user needs this |
| Novel | 2 | Table stakes |
| Necessary | 8 | Stale security tools are dangerous |
| Implementable | 7 | electron-updater exists |
| Growth | 7 | Retention driver |
| **TOTAL** | **41** | **WAIT (close to FILE)** |

---

## Gap 8: Linux GUI (AppImage with Dashboard)

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Worthwhile | 6 | Linux devs also use AI tools |
| Impactful | 4 | Smaller market than macOS for desktop AI |
| Novel | 7 | No Linux equivalent exists at all |
| Necessary | 3 | CLI + web dashboard already works on Linux |
| Implementable | 6 | electron-builder already configured |
| Growth | 5 | Expands TAM |
| **TOTAL** | **31** | **WAIT** |

---

## Summary: Prioritized Roadmap Input

| Priority | Gap | Score | Decision |
|----------|-----|-------|----------|
| 1 | Homebrew / one-click install | 50 | FILE |
| 2 | MCP server deep monitoring | 45 | FILE |
| 3 | Auto-update mechanism | 41 | WAIT → FILE next |
| 4 | Clipboard monitoring | 36 | WAIT |
| 5 | Enforcement mode | 32 | WAIT |
| 6 | Linux GUI | 31 | WAIT |
| 7 | Webhook/email/Slack alerts | 30 | WAIT |
| 8 | Multi-machine dashboard | 27 | SKIP |
