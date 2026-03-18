#!/bin/bash
# Argus installer
# Usage: curl -fsSL https://raw.githubusercontent.com/user/argus/main/install.sh | bash

set -e

echo "Installing Argus..."
echo ""

# --- Check Node.js >= 18 ---
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed."
  echo "Please install Node.js 18 or later from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18 or later is required (found: $(node --version))"
  echo "Please upgrade Node.js from https://nodejs.org"
  exit 1
fi

echo "Node.js version: $(node --version)"

# --- Check npm ---
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not available."
  echo "Please install npm or use a Node.js version that includes it."
  exit 1
fi

echo "npm version: $(npm --version)"
echo ""

# --- Install argus ---
echo "Installing argus globally..."
npm install -g argus

echo ""
echo "Registering Argus as a system service..."
argus install

echo ""
echo "Starting Argus..."
argus start

echo ""
echo "Argus installed and running!"
echo ""
echo "Commands:"
echo "  argus status   - Check monitoring status"
echo "  argus logs -f  - Follow live logs"
echo "  argus watch    - Open dashboard"
echo "  argus report   - Daily report"
echo "  argus tcc      - Check AI app permissions"
echo ""
