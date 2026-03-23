# Argus Launch Checklist

## Pre-Launch (Before First Release)

### Code & Build
- [x] All known bugs fixed (4 bugs fixed this session)
- [x] 426 tests passing, 0 failures
- [x] Tray icon with alert states (normal/yellow/red/grey)
- [x] Eye icon created (16x16, 32x32 template + 256x256 app icon)
- [x] App start/stop notifications with sound
- [x] npm package name secured: `argus-monitor`
- [x] package.json: keywords, repo URL, license, author
- [ ] Build DMG: `npm run electron:build`
- [ ] Code signing (Apple Developer ID) — optional for v1.0
- [ ] Test DMG install on clean Mac
- [ ] Test `npm install -g argus-monitor` globally

### GitHub Repository
- [x] README badges point to cortexark/argus
- [x] README test count updated (426)
- [x] README install commands use `argus-monitor`
- [x] Issue templates (bug report + feature request)
- [x] CI workflow (test.yml) — runs on Node 18, 20, 22
- [x] Release workflow (release.yml) — triggers on version tags
- [ ] Set repo topics: `ai`, `security`, `privacy`, `monitoring`, `macos`, `electron`, `llm`
- [ ] Set repo description: "See what AI agents access on your machine"
- [ ] Upload social preview image (1280x640)
- [ ] Enable GitHub Discussions
- [ ] Pin important issues (first-time contributor, roadmap)

### Screenshots
- [x] Screenshot script ready (scripts/take-screenshots.js)
- [ ] Run script: `npx playwright install chromium && node scripts/take-screenshots.js`
- [ ] Add screenshots to README
- [ ] Add screenshots to landing page

### Distribution
- [x] Homebrew cask formula drafted (homebrew/argus.rb)
- [ ] Build DMG, compute SHA256
- [ ] Create GitHub Release v1.0.0 (tag + upload DMG)
- [ ] Update Homebrew formula with real SHA256
- [ ] Submit Homebrew cask PR to homebrew-cask repo
- [ ] Publish to npm: `npm publish`

---

## Launch Day

### Posts & Marketing
- [x] Hacker News Show HN post drafted (.project/launch/hacker-news.md)
- [x] Product Hunt listing drafted (.project/launch/product-hunt.md)
- [x] Reddit posts drafted for 4 subreddits (.project/launch/reddit.md)
- [x] Twitter/X tweets drafted (.project/launch/twitter-x.md)
- [x] Blog post drafted (.project/launch/blog-post.md)
- [x] Landing page created (docs/landing/index.html)
- [ ] Deploy landing page to GitHub Pages
- [ ] Post Show HN
- [ ] Submit to Product Hunt
- [ ] Post to Reddit (r/MacApps, r/privacy, r/artificial, r/LocalLLaMA)
- [ ] Tweet from personal/project account
- [ ] Publish blog post on dev.to

### Monitoring Launch
- [ ] Watch GitHub stars velocity
- [ ] Monitor HN comments, respond promptly
- [ ] Monitor Reddit comments
- [ ] Track GitHub Issues for install problems
- [ ] Check Homebrew install works end-to-end

---

## Post-Launch (Week 1-2)

- [ ] Fix any reported install/startup issues (P0)
- [ ] Create Discord/community server
- [ ] Write follow-up blog post if HN engagement is high
- [ ] Reach out to security bloggers/YouTubers
- [ ] Tag Objective-See / Patrick Wardle on Twitter (complementary positioning)
- [ ] Submit to macOS app directories (MacUpdate, AlternativeTo)
- [ ] Measure: stars, installs, issues filed vs. OKR targets

---

## Files Created This Session

| File | Purpose |
|------|---------|
| `.pm/competitors/landscape-analysis.md` | 7 competitor profiles + market map |
| `.pm/research/user-needs.md` | 3 personas, JTBD, need priority matrix |
| `.pm/gaps/analysis.md` | 8 gaps scored with WINNING filter |
| `.pm/prds/argus-product-roadmap.md` | Full PRD + 5-phase roadmap |
| `.pm/metrics/north-star.md` | Metric tree, OKRs, success thresholds |
| `.project/orchestration-log.md` | Full phase progress tracking |
| `.project/status.md` | Phase status dashboard |
| `.project/environment.json` | Build/test environment detection |
| `.project/launch/hacker-news.md` | Show HN draft |
| `.project/launch/product-hunt.md` | PH listing draft |
| `.project/launch/reddit.md` | 4 subreddit posts |
| `.project/launch/twitter-x.md` | 3 tweet variations |
| `.project/launch/blog-post.md` | Dev.to blog post |
| `docs/landing/index.html` | Landing page |
| `homebrew/argus.rb` | Homebrew cask formula |
| `scripts/take-screenshots.js` | Playwright screenshot automation |
| `scripts/generate-icons.cjs` | Icon generation script |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Feature request template |
