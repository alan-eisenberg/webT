#!/bin/bash
# Monitors the web terminal and auto-restarts via the repo script if offline

PORT=3000
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! curl -s -m 5 "http://localhost:$PORT" > /dev/null; then
  echo "[$(date)] Web terminal is offline. Running sandbox-start.sh..."
  cd "$REPO_DIR" && bash ./sandbox-start.sh
else
  echo "[$(date)] Web terminal is healthy."
fi
