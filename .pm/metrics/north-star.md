# Argus Metrics Framework

**Last Updated:** 2026-03-21

## North Star Metric

### Weekly Active Installations (WAI)

**Definition:** Count of unique machines that ran Argus (daemon active) at least once in a rolling 7-day window.

**Why this metric:**
- Directly measures adoption (are people using it?)
- Weekly cadence captures developer work patterns
- "Active" means the daemon ran, not just installed
- Aligns with product goal: developers running Argus as part of their daily workflow

**How to measure (without telemetry):**
- Argus is local-only, so we cannot directly measure WAI
- Proxy metrics:
  - GitHub release download count (measures installs)
  - Homebrew install analytics (measures installs)
  - GitHub stars velocity (measures awareness)
  - Discord member count (measures engagement)
  - npm download count (measures CLI installs)

**Note:** Argus sends zero telemetry — this is a core trust principle. WAI is estimated from public proxy metrics, never measured directly.

---

## Metric Tree

```
                    North Star: Weekly Active Installations
                    ┌──────────────┼──────────────┐
                    │              │              │
              Acquisition    Activation     Retention
              (find it)     (try it)       (keep it)
                    │              │              │
          ┌────────┤       ┌──────┤        ┌─────┤
          │        │       │      │        │     │
     GitHub    Homebrew   First  First   Weekly  Session
     stars    installs    scan   alert   opens  duration
                          <30s   <5min   >3/wk   >1h
```

---

## Acquisition Metrics

| Metric | Source | Target (90d) | Target (1yr) |
|--------|--------|-------------|-------------|
| GitHub stars | GitHub API | 1,000 | 10,000 |
| Homebrew cask installs | `brew analytics` | 500 total | 5,000 total |
| npm global installs | npm stats | 200 total | 2,000 total |
| DMG downloads | GitHub Releases | 300 total | 3,000 total |
| README page views | GitHub traffic | 5,000/month | 20,000/month |
| Landing page visits | Analytics | 2,000/month | 10,000/month |

---

## Activation Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Time to first scan | Install → first AI process detected | < 30 seconds |
| Time to first alert | Install → first notification | < 5 minutes |
| Dashboard opened | User opens web dashboard | 80% of installs |
| Tray icon visible | Argus icon appears in macOS menu bar | 100% of Electron installs |

---

## Retention Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Day 1 retention | % still running next day | 60% |
| Day 7 retention | % still running after 1 week | 40% |
| Day 30 retention | % still running after 1 month | 25% |
| Uninstall rate | % who remove within 7 days | < 30% |
| LaunchAgent persistence | % who set up auto-start | 50% |

---

## Engagement Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Alerts/day | Average notifications per active user | 5-15 |
| Dashboard views/week | Times dashboard opened per user | 3+ |
| Reports generated | Export/report actions per month | 1+ |
| Sensitive access reviews | Expected/Suspicious decisions per week | 2+ |

---

## Community Metrics

| Metric | Source | Target (90d) | Target (1yr) |
|--------|--------|-------------|-------------|
| GitHub contributors | PRs merged | 10 | 50 |
| Issues filed | GitHub Issues | 50 | 300 |
| Discord members | Discord | 200 | 2,000 |
| Blog mentions | Search/alerts | 5 | 30 |
| Conference mentions | Manual tracking | 1 | 5 |
| Forks | GitHub | 50 | 500 |

---

## Anti-Metrics (What NOT to Optimize)

| Anti-Metric | Why |
|-------------|-----|
| Notification volume | More alerts ≠ better. Optimize for signal-to-noise ratio |
| Time in dashboard | Users should NOT need to stare at dashboard. Notifications should be sufficient |
| Daily active | Weekly is the right cadence. Developers don't code every day |
| Revenue (for now) | Premature monetization kills OSS trust |

---

## OKRs: Q2 2026 (Launch Quarter)

### Objective 1: Establish Argus as the Go-To AI Monitoring Tool

| Key Result | Target | Measure |
|-----------|--------|---------|
| KR1: GitHub stars | 1,000 | GitHub API |
| KR2: Homebrew + npm installs | 500 | Registry analytics |
| KR3: Organic blog/article mentions | 5 | Google Alerts |

### Objective 2: Deliver a Reliable, Trust-Building Product

| Key Result | Target | Measure |
|-----------|--------|---------|
| KR1: Test coverage | > 80% | Test runner |
| KR2: Open bugs (P0/P1) | 0 | GitHub Issues |
| KR3: Time to first alert | < 5 min | Manual testing |

### Objective 3: Build Community Foundation

| Key Result | Target | Measure |
|-----------|--------|---------|
| KR1: External contributors (PRs merged) | 10 | GitHub |
| KR2: AI apps registry entries | 60+ | src/ai-apps.js |
| KR3: Community feature requests filed | 30 | GitHub Issues |
