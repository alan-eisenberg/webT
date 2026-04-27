#!/bin/bash
set -euo pipefail

# Diagnostic script for z.ai sandbox to debug why docky repo isn't being cloned.
# Usage: Run on the target machine (z.ai sandbox) and then inspect /tmp/docky-debug.log

LOG=/tmp/docky-debug.log
exec >"$LOG" 2>&1

echo "=== docky-debug starting at $(date) ==="
echo "User: $(whoami)"
echo "PWD: $(pwd)"
echo "HOME: ${HOME:-}" 
echo "Target base: /home/z"
echo "Preferred: /home/z/my-project"

echo "--- /home contents ---"
ls -la /home || true

echo "--- /home/z info ---"
if [ -e /home/z ]; then
  stat /home/z || true
  ls -la /home/z || true
else
  echo "/home/z does not exist"
fi

echo "--- preferred dir ---"
if [ -e /home/z/my-project ]; then
  stat /home/z/my-project || true
  ls -la /home/z/my-project || true
else
  echo "/home/z/my-project does not exist"
fi

echo "--- tool availability ---"
for tool in git wget curl rsync sed tar; do
  echo "$tool: $(command -v $tool || echo 'MISSING')"
  if command -v $tool >/dev/null 2>&1; then
    case $tool in
      git) git --version || true ;; 
      wget) wget --version | head -n1 || true ;; 
      curl) curl --version | head -n1 || true ;; 
      rsync) rsync --version | head -n1 || true ;; 
    esac
  fi
done

echo "--- network test: github.com (HEAD request) ---"
if command -v curl >/dev/null 2>&1; then
  curl -I -s -S -m 10 https://github.com || echo "curl failed"
else
  echo "curl not available"
fi

REPO_URL="https://github.com/alan-eisenberg/docky-main.git"
TARGET_BASE="/home/z"
PREFERRED="$TARGET_BASE/my-project"

if [ -d "$PREFERRED" ]; then
  TARGET="$PREFERRED"
else
  TARGET="$TARGET_BASE"
fi

echo "Using target: $TARGET"
mkdir -p "$TARGET" || echo "mkdir failed"

echo "--- contents before ---"
ls -la "$TARGET" || true

if [ -x "$TARGET/run.sh" ]; then
  echo "run.sh already present and executable in target; skipping clone"
else
  if [ -z "$(ls -A "$TARGET" 2>/dev/null)" ]; then
    echo "Target empty; attempting direct git clone into target"
    if command -v git >/dev/null 2>&1; then
      git clone --depth 1 "$REPO_URL" "$TARGET" || echo "git clone failed with $?"
    else
      echo "git not available; trying tarball fallback"
      wget -q -O /tmp/docky-main.tar.gz "https://github.com/alan-eisenberg/docky-main/archive/refs/heads/main.tar.gz" || echo "wget failed"
      tar -xzf /tmp/docky-main.tar.gz -C "$TARGET" --strip-components=1 || echo "tar extract failed"
    fi
  else
    echo "Target not empty; cloning into temporary dir and merging"
    TMPDIR=$(mktemp -d 2>/dev/null || echo "/tmp/docky-clone-$$")
    echo "tmpdir=$TMPDIR"
    if command -v git >/dev/null 2>&1; then
      git clone --depth 1 "$REPO_URL" "$TMPDIR" || echo "git clone tmp failed with $?"
    else
      wget -q -O /tmp/docky-main.tar.gz "https://github.com/alan-eisenberg/docky-main/archive/refs/heads/main.tar.gz" || echo "wget failed"
      tar -xzf /tmp/docky-main.tar.gz -C "$TMPDIR" --strip-components=1 || echo "tar extract failed"
    fi
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$TMPDIR"/ "$TARGET"/ || echo "rsync failed"
    else
      cp -a "$TMPDIR"/. "$TARGET"/ || echo "cp failed"
    fi
    rm -rf "$TMPDIR"
  fi
fi

echo "--- contents after ---"
ls -la "$TARGET" || true

if [ -x "$TARGET/run.sh" ]; then
  echo "run.sh content (first 200 lines):"
  sed -n '1,200p' "$TARGET/run.sh" || true
else
  echo "run.sh not present in target"
fi

echo "=== docky-debug finished at $(date) ==="

echo "Log written to $LOG"
exit 0
