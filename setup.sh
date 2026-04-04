#!/usr/bin/env bash
# ============================================================================
#  Web Terminal — One-Command Setup Script
#  Usage: bash setup.sh
# ============================================================================
set -euo pipefail

# ---------- colors ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

banner() {
  echo ""
  echo -e "${BOLD}${CYAN}  ╔══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}  ║   ⬢  Web Terminal — Auto Setup           ║${NC}"
  echo -e "${BOLD}${CYAN}  ╚══════════════════════════════════════════╝${NC}"
  echo ""
}

# ---------- prereq checks ----------
check_prereqs() {
  info "Checking prerequisites..."

  # Check OS
  if [[ "$OSTYPE" != "linux-gnu"* && "$OSTYPE" != "darwin"* ]]; then
    warn "This script is designed for Linux/macOS. Other OS may have issues."
  fi

  # Check for git
  if ! command -v git &>/dev/null; then
    error "git is required but not installed. Install it first: https://git-scm.com"
  fi
  success "git $(git --version | awk '{print $3}')"

  # Check for bash
  if ! command -v bash &>/dev/null; then
    error "/bin/bash is required but not found."
  fi
  success "bash $(bash --version | head -1 | awk '{print $4}')"

  # Check for Node.js
  if command -v node &>/dev/null; then
    success "node $(node --version)"
  else
    warn "Node.js not found. Attempting to install..."
    if command -v curl &>/dev/null; then
      curl -fsSL https://fnm.vercel.app/install | bash
      export PATH="$HOME/.local/share/fnm:$PATH"
      eval "$(fnm env)"
      fnm install --lts
      fnm use lts-latest
      success "node $(node --version) installed via fnm"
    else
      error "curl not found. Install Node.js manually: https://nodejs.org"
    fi
  fi

  # Check for Bun (preferred) or fall back to npm
  if command -v bun &>/dev/null; then
    PKG_MANAGER="bun"
    success "bun $(bun --version)"
  elif command -v npm &>/dev/null; then
    PKG_MANAGER="npm"
    success "npm $(npm --version) (bun not found, using npm)"
  else
    error "No package manager found. Install Bun: https://bun.sh or npm via Node.js"
  fi

  echo ""
}

# ---------- install dependencies ----------
install_deps() {
  info "Installing dependencies using ${PKG_MANAGER}..."

  case "$PKG_MANAGER" in
    bun)
      bun install --frozen-lockfile 2>/dev/null || bun install
      ;;
    npm)
      npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps
      ;;
  esac

  success "Dependencies installed"
  echo ""
}

# ---------- create .env if missing ----------
setup_env() {
  if [[ ! -f ".env" ]]; then
    info "No .env found, creating with defaults..."
    echo 'DATABASE_URL="file:./prisma/dev.db"' > .env
    success ".env created with DATABASE_URL"
  else
    info ".env already exists, skipping"
  fi
  echo ""
}

# ---------- generate Prisma client (if schema exists) ----------
setup_prisma() {
  if [[ -f "prisma/schema.prisma" ]]; then
    info "Setting up Prisma..."
    case "$PKG_MANAGER" in
      bun) bunx prisma generate 2>/dev/null || npx prisma generate ;;
      npm) npx prisma generate ;;
    esac
    success "Prisma client generated"

    info "Creating/syncing database..."
    case "$PKG_MANAGER" in
      bun) bunx prisma db push 2>/dev/null || npx prisma db push ;;
      npm) npx prisma db push ;;
    esac
    success "Database ready"
  fi
  echo ""
}

# ---------- start dev server ----------
start_server() {
  info "Starting development server..."
  echo ""
  echo -e "${GREEN}${BOLD}  ┌──────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}${BOLD}  │  🚀 Web Terminal is starting...          │${NC}"
  echo -e "${GREEN}${BOLD}  │                                          │${NC}"
  echo -e "${GREEN}${BOLD}  │  Open: http://localhost:3000             │${NC}"
  echo -e "${GREEN}${BOLD}  └──────────────────────────────────────────┘${NC}"
  echo ""

  case "$PKG_MANAGER" in
    bun)
      exec bun run dev
      ;;
    npm)
      exec npm run dev
      ;;
  esac
}

# ---------- main ----------
main() {
  banner
  check_prereqs
  install_deps
  setup_env
  setup_prisma
  start_server
}

main "$@"
