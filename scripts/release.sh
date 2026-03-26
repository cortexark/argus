#!/bin/bash
#
# Argus Release Script
#
# Usage:
#   ./scripts/release.sh patch    # 1.1.0 -> 1.1.1
#   ./scripts/release.sh minor    # 1.1.0 -> 1.2.0
#   ./scripts/release.sh major    # 1.1.0 -> 2.0.0
#   ./scripts/release.sh 1.3.0    # explicit version
#
# What it does:
#   1. Bumps version in package.json
#   2. Runs tests
#   3. Builds the DMG
#   4. Creates releases/<version>/ with DMG + RELEASE_NOTES.md
#   5. Updates releases/latest symlink
#   6. Commits and tags
#   7. Pushes to GitHub with release + DMG asset
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Guard: releases must be cut from main only
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${RED}[release]${NC} Must be on main branch to release. Currently on: $CURRENT_BRANCH"
    exit 1
fi

log() { echo -e "${GREEN}[release]${NC} $1"; }
warn() { echo -e "${YELLOW}[release]${NC} $1"; }
die() { echo -e "${RED}[release]${NC} $1"; exit 1; }

# Parse version bump type
BUMP_TYPE="${1:-patch}"
CURRENT_VERSION=$(node -p "require('./package.json').version")

if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    NEW_VERSION="$BUMP_TYPE"
elif [[ "$BUMP_TYPE" == "patch" ]]; then
    NEW_VERSION=$(echo "$CURRENT_VERSION" | awk -F. '{print $1"."$2"."$3+1}')
elif [[ "$BUMP_TYPE" == "minor" ]]; then
    NEW_VERSION=$(echo "$CURRENT_VERSION" | awk -F. '{print $1"."$2+1".0"}')
elif [[ "$BUMP_TYPE" == "major" ]]; then
    NEW_VERSION=$(echo "$CURRENT_VERSION" | awk -F. '{print $1+1".0.0"}')
else
    die "Usage: $0 [patch|minor|major|x.y.z]"
fi

RELEASE_DIR="releases/v${NEW_VERSION}"
DMG_NAME="Argus-${NEW_VERSION}-arm64.dmg"

log "Current version: $CURRENT_VERSION"
log "New version:     $NEW_VERSION"
log "Release dir:     $RELEASE_DIR"
echo ""

# Check for uncommitted changes
if [[ -n $(git status --porcelain -- ':!releases/' ':!dist*' ':!dist-old*') ]]; then
    warn "You have uncommitted changes. Commit or stash them first."
    git status --short -- ':!releases/' ':!dist*' ':!dist-old*'
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]] || die "Aborted."
fi

# Check release dir doesn't already exist
if [[ -d "$RELEASE_DIR" ]]; then
    die "Release directory $RELEASE_DIR already exists. Delete it first or choose a different version."
fi

# Step 1: Bump version in package.json
log "Step 1/7: Bumping version to $NEW_VERSION"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Step 2: Run tests
log "Step 2/7: Running tests"
npm run node:rebuild > /dev/null 2>&1
if ! npm test > /tmp/argus-test-output.txt 2>&1; then
    cat /tmp/argus-test-output.txt | tail -20
    die "Tests failed. Fix them before releasing."
fi
PASS_COUNT=$(grep -c "PASS:" /tmp/argus-test-output.txt || echo "0")
FAIL_COUNT=$(grep -c "FAIL:" /tmp/argus-test-output.txt || echo "0")
log "Tests: $PASS_COUNT passed, $FAIL_COUNT failed"

# Step 3: Build DMG
log "Step 3/7: Building DMG"
if [[ -d dist ]]; then
    mv dist "dist-prebuild-$(date +%s)" 2>/dev/null || true
fi
npm run electron:build > /tmp/argus-build-output.txt 2>&1
if [[ ! -f "dist/Argus-1.0.0-arm64.dmg" ]]; then
    die "DMG build failed. Check /tmp/argus-build-output.txt"
fi
log "DMG built successfully"

# Step 4: Create release directory with DMG and release notes
log "Step 4/7: Creating $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
cp "dist/Argus-1.0.0-arm64.dmg" "$RELEASE_DIR/$DMG_NAME"

# Generate release notes from git log
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$PREV_TAG" ]]; then
    COMMITS=$(git log "$PREV_TAG"..HEAD --oneline --no-merges 2>/dev/null || echo "No commits since last release")
else
    COMMITS=$(git log --oneline -20 --no-merges 2>/dev/null || echo "Initial release")
fi

cat > "$RELEASE_DIR/RELEASE_NOTES.md" << NOTES
# Argus v${NEW_VERSION}

Released: $(date '+%Y-%m-%d')

## Download

- **${DMG_NAME}** — macOS Apple Silicon (M1/M2/M3/M4)

## Changes since ${PREV_TAG:-initial release}

$(echo "$COMMITS" | sed 's/^/- /')

## Test Results

- $PASS_COUNT tests passed, $FAIL_COUNT failed

## Install

Download the DMG above, or install from source:

\`\`\`bash
npm install -g argus-monitor
argus install && argus start
\`\`\`
NOTES

log "Release notes written to $RELEASE_DIR/RELEASE_NOTES.md"

# Step 5: Update latest symlink
log "Step 5/7: Updating releases/latest symlink"
cd releases
if [[ -L latest ]]; then
    rm latest
fi
ln -s "v${NEW_VERSION}" latest
cd "$PROJECT_DIR"

# Step 6: Commit and tag
log "Step 6/7: Committing and tagging v${NEW_VERSION}"
git add package.json "$RELEASE_DIR" releases/latest
git commit -m "release: v${NEW_VERSION}

$(cat "$RELEASE_DIR/RELEASE_NOTES.md" | head -20)"
git tag -a "v${NEW_VERSION}" -m "Argus v${NEW_VERSION}"

# Step 7: Push and create GitHub release
log "Step 7/7: Pushing to GitHub"
git push origin HEAD
git push origin "v${NEW_VERSION}"

gh release create "v${NEW_VERSION}" \
    "$RELEASE_DIR/$DMG_NAME" \
    --repo cortexark/argus \
    --title "Argus v${NEW_VERSION}" \
    --notes-file "$RELEASE_DIR/RELEASE_NOTES.md"

echo ""
log "Release v${NEW_VERSION} complete!"
log "GitHub: https://github.com/cortexark/argus/releases/tag/v${NEW_VERSION}"
log "DMG:    $RELEASE_DIR/$DMG_NAME"
log "Latest: releases/latest -> v${NEW_VERSION}"
