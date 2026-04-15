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
