#!/usr/bin/env bash
# =============================================================================
# Sandbox One-Click Setup — Non-interactive
# =============================================================================
# Usage:
#   bun run sandbox          (after clone)
#
# What it does:
#   1. Install dependencies
#   2. Build for production (standalone)
#   3. Install PM2 if missing
#   4. Start server on port 3000 via PM2 (auto-restarts on crash)
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${BLUE}▸${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }

cd "$(dirname "${BASH_SOURCE[0]}")"
PORT="${PORT:-3000}"

# Step 1 — Install dependencies
info "Installing dependencies..."
bun install
success "Dependencies installed"

# Step 2 — Build for production
info "Building for production..."
bun run build
success "Build complete"

# Step 3 — Ensure PM2 is available
if ! command -v pm2 >/dev/null 2>&1; then
  info "Installing PM2..."
  bun add -g pm2 >/dev/null 2>&1 || npm install -g pm2 >/dev/null 2>&1
  success "PM2 installed: $(pm2 --version 2>/dev/null | head -1)"
fi

# Step 4 — Start (or restart) via PM2
if pm2 describe web-terminal >/dev/null 2>&1; then
  info "Server already running. Restarting..."
  pm2 restart web-terminal
else
  info "Starting server on port ${PORT} via PM2..."
  PORT="$PORT" NODE_ENV=production pm2 start .next/standalone/server.js \
    --name web-terminal \
    -- -p "$PORT" -H 0.0.0.0
  pm2 save
fi

# Step 5 — Verify
sleep 3
if ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then
  echo ""
  success "Server is running on port ${PORT}"
  info "Useful commands:"
  echo "  pm2 logs web-terminal    — view logs"
  echo "  pm2 restart web-terminal — restart"
  echo "  pm2 stop web-terminal    — stop"
else
  echo ""
  echo "${YELLOW}! Server may still be starting. Check: pm2 logs web-terminal${NC}"
fi