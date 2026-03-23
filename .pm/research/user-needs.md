# Argus User Research — Needs Analysis

**Last Updated:** 2026-03-21

## Target User Personas

### Persona 1: Security-Conscious Developer ("The Watchdog")

**Profile:**
- Senior developer, 5-15 years experience
- Uses Claude Code, Cursor, or Copilot daily
- Has SSH keys, AWS credentials, API tokens on machine
- Reads Hacker News, follows security news
- Uses macOS as primary dev machine
- Already runs Little Snitch or similar

**Jobs to Be Done:**
1. "I want to know if Claude Code read my SSH keys while working on a feature"
2. "I want to see which files Cursor accessed during my session"
3. "I want to verify that my AI coding tool isn't exfiltrating data to unknown servers"
4. "I want an audit trail of AI behavior on my machine for compliance"

**Pain Points:**
- No visibility into AI agent filesystem access
- Existing tools (Little Snitch) only show network, not files
- Trusting AI tools requires transparency
- No way to verify AI tool privacy claims

**Willingness to Pay:** $0-30/month (prefers free/OSS, would pay for premium features)

**Discovery Channels:** Hacker News, Reddit (r/programming, r/privacy), GitHub trending, dev Twitter/X

---

### Persona 2: Privacy Advocate ("The Guardian")

**Profile:**
- Tech-savvy but not necessarily a developer
- Strong opinions about data privacy
- May have sensitive data on machine (legal docs, financial records)
- Uses AI tools cautiously, wants proof of behavior
- Runs multiple privacy tools (VPN, ad blocker, firewall)

**Jobs to Be Done:**
1. "I want proof that ChatGPT isn't reading my documents folder"
2. "I want to be alerted when any AI app touches my personal files"
3. "I want a privacy dashboard that shows exactly what AI sees"

**Pain Points:**
- AI companies say "we don't read your files" but how do you verify?
- Privacy policies are vague and change without notice
- No transparency tool exists for AI app behavior

**Willingness to Pay:** $0-10/month (strong preference for free)

**Discovery Channels:** Reddit (r/privacy, r/MacApps), privacy-focused blogs, word of mouth

---

### Persona 3: Enterprise Developer / Security Team ("The Compliance Officer")

**Profile:**
- Works at company with security policies
- Uses AI coding tools approved by IT
- Needs audit trail for compliance (SOC2, GDPR)
- Reports to security team or CISO
- macOS fleet managed by IT

**Jobs to Be Done:**
1. "I need to prove our AI tools comply with data handling policies"
2. "I need to detect if an AI agent accessed restricted files"
3. "I need an exportable audit log for compliance reviews"
4. "I need to monitor AI tool behavior across developer machines"

**Pain Points:**
- Enterprise tools (Zenity) are expensive and require IT deployment
- No lightweight audit tool that developers can self-serve
- Compliance teams ask "what does your AI tool access?" — no good answer
- EU AI Act (Aug 2026) creating urgency for monitoring

**Willingness to Pay:** $30-100/month per seat (enterprise budget)

**Discovery Channels:** Security conferences, CISO newsletters, vendor evaluations, internal champions

---

## User Need Priority Matrix

| Need | Persona 1 | Persona 2 | Persona 3 | Priority |
|------|-----------|-----------|-----------|----------|
| File access monitoring | CRITICAL | HIGH | CRITICAL | P0 |
| Credential access alerts | CRITICAL | MEDIUM | CRITICAL | P0 |
| Network connection tracking | HIGH | HIGH | HIGH | P0 |
| Session history | MEDIUM | LOW | HIGH | P1 |
| Export/audit reports | LOW | LOW | CRITICAL | P1 |
| Real-time notifications | HIGH | HIGH | MEDIUM | P0 |
| Browser automation detection | HIGH | LOW | HIGH | P1 |
| Open-source / auditable | CRITICAL | CRITICAL | MEDIUM | P0 |
| Multi-machine management | LOW | LOW | CRITICAL | P2 |
| Enforcement (block access) | MEDIUM | HIGH | HIGH | P2 |
| MCP server monitoring | HIGH | LOW | HIGH | P1 |
| Webhook/email alerts | LOW | LOW | HIGH | P2 |

## Key Insight

**The biggest unmet need across all personas is filesystem transparency for AI apps.** Network monitoring exists (Little Snitch). Camera/mic monitoring exists (OverSight). But nobody answers: "What files did my AI agent just read?"

This is Argus's core value proposition and the reason for its existence.
