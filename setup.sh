#!/usr/bin/env bash
# =============================================================================
# Web Terminal — One-Click Setup & Run Script
# =============================================================================
# Usage:
#   chmod +x setup.sh && ./setup.sh           # Interactive (choose dev/prod)
#   ./setup.sh dev                             # Development mode (hot reload)
#   ./setup.sh start                           # Production mode (build + serve)
#   ./setup.sh build                           # Build production only
#   ./setup.sh stop                            # Stop production server (PM2)
#   ./setup.sh restart                         # Restart production server (PM2)
#   ./setup.sh logs                            # Tail production logs (PM2)
# =============================================================================

set -euo pipefail

# ---------- Colors ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ---------- Helpers ----------
info()    { echo -e "${BLUE}▸${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}!${NC} $1"; }
error()   { echo -e "${RED}✗${NC} $1" >&2; }
banner()  { echo -e "\n${CYAN}${BOLD}$1${NC}\n"; }

# ---------- Project root ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- Detect OS ----------
detect_os() {
  OS="$(uname -s)"
  case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *)       PLATFORM="unknown" ;;
  esac
}

# ---------- Check command exists ----------
cmd_exists() {
  command -v "$1" >/dev/null 2>&1
}

# ---------- Install Bun ----------
install_bun() {
  banner "Installing Bun Runtime"
  if cmd_exists curl; then
    curl -fsSL https://bun.sh/install | bash
    # Source bun immediately
    if [ -f "$HOME/.bun/env" ]; then
      # shellcheck disable=SC1091
      source "$HOME/.bun/env"
    elif [ -f "$HOME/.bashrc" ]; then
      # shellcheck disable=SC1091
      source "$HOME/.bashrc" 2>/dev/null || true
    fi
  elif cmd_exists wget; then
    wget -qO- https://bun.sh/install | bash
    if [ -f "$HOME/.bun/env" ]; then
      # shellcheck disable=SC1091
      source "$HOME/.bun/env"
    fi
  else
    error "Neither curl nor wget found. Cannot install Bun automatically."
    error "Install Bun manually: https://bun.sh/docs/installation"
    exit 1
  fi

  # Verify
  if cmd_exists bun; then
    success "Bun installed: $(bun --version)"
  else
    error "Bun installation failed. Try installing manually."
    exit 1
  fi
}

# ---------- Install Node (fallback) ----------
install_node() {
  banner "Installing Node.js (fallback)"
  warn "Bun unavailable. Falling back to Node.js + npm..."

  if cmd_exists apt-get; then
    sudo apt-get update -qq && sudo apt-get install -y -qq nodejs npm
  elif cmd_exists yum; then
    sudo yum install -y nodejs npm
  elif cmd_exists apk; then
    sudo apk add nodejs npm
  elif cmd_exists brew; then
    brew install node
  else
    error "Cannot auto-install Node.js on this system."
    error "Install Node.js manually: https://nodejs.org/"
    exit 1
  fi

  if cmd_exists node; then
    success "Node.js installed: $(node --version)"
  else
    error "Node.js installation failed."
    exit 1
  fi
}

# ---------- Ensure package manager ----------
ensure_runtime() {
  banner "Checking Runtime Environment"

  if cmd_exists bun; then
    success "Bun found: $(bun --version)"
    PKG_MANAGER="bun"
  elif cmd_exists node && [ "$(node --version | cut -d. -f1 | tr -d 'v')" -ge 18 ]; then
    success "Node.js found: $(node --version)"
    PKG_MANAGER="npm"
  else
    warn "No compatible runtime found."
    echo -e "  ${CYAN}1)${NC} Bun (recommended — fast)"
    echo -e "  ${CYAN}2)${NC} Node.js 18+ (fallback)"
    echo ""
    read -rp "  Choose runtime [1/2]: " choice </dev/tty

    case "$choice" in
      1) install_bun; PKG_MANAGER="bun" ;;
      2) install_node; PKG_MANAGER="npm" ;;
      *) install_bun; PKG_MANAGER="bun" ;;
    esac
  fi

  # Verify minimum Node version
  local node_version
  if [ "$PKG_MANAGER" = "bun" ]; then
    node_version=$(bun --version | head -1)
  else
    node_version=$(node --version)
  fi
  success "Using $PKG_MANAGER ($node_version)"
}

# ---------- Install dependencies ----------
install_deps() {
  banner "Installing Dependencies"

  if [ -d "node_modules" ]; then
    info "node_modules exists. Skipping install."
    info "Run 'rm -rf node_modules' first to force reinstall."
    return
  fi

  case "$PKG_MANAGER" in
    bun)
      bun install --frozen-lockfile 2>/dev/null || bun install
      ;;
    npm)
      npm ci --prefer-offline 2>/dev/null || npm install
      ;;
  esac

  success "Dependencies installed"
}

# ---------- Dev mode ----------
run_dev() {
  banner "Starting Development Server"
  info "URL: http://localhost:3000"
  echo ""
  case "$PKG_MANAGER" in
    bun) bun run dev ;;
    npm) npm run dev ;;
  esac
}

# ---------- Build ----------
run_build() {
  banner "Building for Production"

  case "$PKG_MANAGER" in
    bun) bun run build ;;
    npm) npm run build ;;
  esac

  # Copy static assets into standalone (required by Next.js standalone output)
  if [ -d ".next/static" ]; then
    rm -rf .next/standalone/.next/static
    cp -r .next/static .next/standalone/.next/
  fi
  if [ -d "public" ]; then
    rm -rf .next/standalone/public
    cp -r public .next/standalone/
  fi

  success "Build complete"
}

# ---------- Production start ----------
run_start() {
  banner "Starting Production Server"

  if [ ! -f ".next/standalone/server.js" ]; then
    warn "No production build found. Building now..."
    run_build
  fi

  if cmd_exists pm2 && pm2 describe web-terminal >/dev/null 2>&1; then
    warn "Server already running via PM2. Use './setup.sh restart' to restart."
    return
  fi

  if cmd_exists pm2; then
    info "Starting via PM2 (process manager)"
    PORT="${PORT:-3000}" NODE_ENV=production pm2 start ecosystem.config.js
    pm2 save
    success "Server started (PID: $(pm2 pid web-terminal))"
    info "URL: http://localhost:${PORT:-3000}"
    info "Logs: ./setup.sh logs"
    info "Stop: ./setup.sh stop"
  else
    info "Starting standalone server (no PM2 — use Ctrl+C to stop)"
    info "Install PM2 for process management: npm install -g pm2"
    PORT="${PORT:-3000}" NODE_ENV=production node .next/standalone/server.js
  fi
}

# ---------- PM2 helpers ----------
pm2_stop() {
  if cmd_exists pm2; then
    pm2 stop web-terminal 2>/dev/null || warn "No PM2 process found"
    pm2 delete web-terminal 2>/dev/null || true
    pm2 save
    success "Server stopped"
  else
    warn "PM2 not installed"
  fi
}

pm2_restart() {
  if cmd_exists pm2; then
    if pm2 describe web-terminal >/dev/null 2>&1; then
      pm2 restart web-terminal
      success "Server restarted"
    else
      run_start
    fi
  else
    warn "PM2 not installed. Starting fresh..."
    run_start
  fi
}

pm2_logs() {
  if cmd_exists pm2; then
    pm2 logs web-terminal --lines 100
  else
    warn "PM2 not installed"
  fi
}

# ---------- Status check ----------
show_status() {
  banner "Server Status"
  if cmd_exists pm2 && pm2 describe web-terminal >/dev/null 2>&1; then
    pm2 show web-terminal
  elif [ -f ".next/standalone/server.js" ]; then
    info "Production build: ready"
    warn "No PM2 process running"
  else
    warn "No build found. Run './setup.sh build' first."
  fi
}

# ---------- Interactive menu ----------
show_menu() {
  echo -e "${CYAN}${BOLD}  Web Terminal — Setup Menu${NC}"
  echo -e "  ─────────────────────────────────"
  echo -e "  ${GREEN}1${NC}  Install & run (development)"
  echo -e "  ${GREEN}2${NC}  Build & run  (production)"
  echo -e "  ${GREEN}3${NC}  Build only"
  echo -e "  ${GREEN}4${NC}  Start production server"
  echo -e "  ${GREEN}5${NC}  Stop server"
  echo -e "  ${GREEN}6${NC}  Restart server"
  echo -e "  ${GREEN}7${NC}  View logs"
  echo -e "  ${GREEN}8${NC}  Show status"
  echo ""
  read -rp "  Choose option [1-8]: " choice </dev/tty
  echo ""

  case "$choice" in
    1) ensure_runtime; install_deps; run_dev ;;
    2) ensure_runtime; install_deps; run_build; run_start ;;
    3) ensure_runtime; install_deps; run_build ;;
    4) run_start ;;
    5) pm2_stop ;;
    6) pm2_restart ;;
    7) pm2_logs ;;
    8) show_status ;;
    *) error "Invalid option. Run with: dev | start | build | stop | restart | logs" ;;
  esac
}

# ---------- Main ----------
main() {
  banner "🚀  Web Terminal — Deploy Script"
  info "Project directory: $SCRIPT_DIR"

  detect_os
  info "Platform: $PLATFORM ($(uname -m))"

  local cmd="${1:-}"

  case "$cmd" in
    dev)     ensure_runtime; install_deps; run_dev ;;
    start)   ensure_runtime; install_deps; run_build; run_start ;;
    build)   ensure_runtime; install_deps; run_build ;;
    stop)    pm2_stop ;;
    restart) ensure_runtime; install_deps; run_build; pm2_restart ;;
    logs)    pm2_logs ;;
    status)  show_status ;;
    "")      show_menu ;;
    *)       error "Unknown command: $cmd"; echo "Usage: $0 [dev|start|build|stop|restart|logs|status]" ;;
  esac
}

main "$@"
