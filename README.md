# Web Terminal

A full-featured, web-based terminal emulator built with **Next.js 16**, **TypeScript**, and **Tailwind CSS 4**. Connects to a real backend that executes shell commands on the server — complete with session management, command history, and a custom-built terminal UI.

---

## Quick Start

```bash
git clone <your-repo-url> && cd web-terminal
chmod +x setup.sh && ./setup.sh
```

That's it. The setup script handles everything: runtime detection, dependency installation, and launching the server. Works on any Linux or macOS host with zero manual configuration.

---

## Features

| Feature | Details |
|---------|---------|
| **Real shell execution** | Backend runs commands via `child_process.exec` with `/bin/bash` |
| **Session management** | Server-side sessions with persistent `cwd` and command history |
| **Custom terminal UI** | Built from scratch — no xterm.js dependency, pure React/HTML/CSS |
| **macOS-style chrome** | Dark header bar with colored dots and centered title |
| **Color-coded output** | Green prompts, white commands, gray stdout, red stderr |
| **Command history** | Arrow Up/Down to navigate previous commands |
| **Keyboard shortcuts** | `Ctrl+L` clear, `Ctrl+C` cancel input |
| **Auto-scroll** | Output area scrolls to bottom on new content |
| **Blinking cursor** | Blue cursor block with CSS animation |
| **Special commands** | `cd`, `pwd`, `clear`, `history`, `exit` — handled locally without exec |
| **ANSI stripping** | All ANSI escape sequences removed from output for clean display |
| **Auto-start script** | Runs a configurable init script on every new session |

---

## Deployment Methods

### Method 1: Setup Script (Recommended)

The fastest way to get running on any bare-metal server or VPS.

```bash
# Clone the repository
git clone <your-repo-url> && cd web-terminal

# Make setup executable and run
chmod +x setup.sh
./setup.sh
```

An interactive menu will appear. Select an option:

| Option | Description |
|--------|-------------|
| 1 | Install dependencies & run in **development** mode (hot reload) |
| 2 | Build & run in **production** mode |
| 3 | Build production bundle only |
| 4 | Start production server |
| 5 | Stop server (PM2) |
| 6 | Restart server (PM2) |
| 7 | View logs (PM2) |
| 8 | Show server status |

#### CLI Shortcuts

Skip the menu and run directly:

```bash
./setup.sh dev        # Development mode (hot reload on port 3000)
./setup.sh start      # Production mode (build + serve via PM2)
./setup.sh build      # Build only
./setup.sh stop       # Stop PM2 server
./setup.sh restart    # Restart PM2 server
./setup.sh logs       # Tail PM2 logs
./setup.sh status     # Show PM2 status
```

#### What the setup script does automatically

1. **Detects your OS** — Linux, macOS, or Windows (WSL)
2. **Finds a runtime** — Checks for Bun first (fast), falls back to Node.js 18+
3. **Installs Bun** if missing — Uses curl/wget to install the Bun runtime
4. **Installs dependencies** — Runs `bun install` or `npm install`
5. **Builds for production** — Runs `next build` and copies static assets into the standalone bundle
6. **Starts the server** — Launches via PM2 if available, otherwise runs standalone Node.js

#### Runtime Requirements

| Requirement | Minimum Version |
|-------------|-----------------|
| Bun (recommended) | Any recent version |
| Node.js (fallback) | 18.0+ |
| Git | Required for auto-start script |
| `/bin/bash` | Required for command execution |

If neither Bun nor Node.js is installed, the script offers to install Bun automatically. On servers without internet access, pre-install Bun or Node.js manually before running setup.

---

### Method 2: Docker

Build and run in an isolated container. No runtime installation needed on the host.

```bash
# Build the image
docker build -t web-terminal .

# Run (foreground — Ctrl+C to stop)
docker run -p 3000:3000 web-terminal

# Run (detached — persistent)
docker run -d -p 3000:3000 --name terminal web-terminal

# View logs
docker logs -f terminal

# Stop
docker stop terminal && docker rm terminal
```

#### Custom Port

```bash
docker run -d -p 8080:3000 --name terminal web-terminal
```

The Dockerfile uses a **multi-stage build** for a minimal final image:

| Stage | Base Image | Purpose |
|-------|-----------|---------|
| `deps` | `oven/bun:1` | Install npm dependencies |
| `builder` | `oven/bun:1` | Build the Next.js application |
| `runner` | `oven/bun:1` | Minimal production image with standalone output |

---

### Method 3: Docker Compose

One command to build and run with automatic restarts and health checks.

```bash
# Start (build + run in background)
docker compose up -d

# View logs
docker compose logs -f

# Rebuild after code changes
docker compose up -d --build

# Stop and remove
docker compose down
```

#### Custom Port

Edit the `PORT` environment variable in `.env` or use:

```bash
PORT=8080 docker compose up -d
```

The compose file includes:
- **Automatic restart** (`unless-stopped`) — survives server reboots
- **Health check** — HTTP probe every 30 seconds
- **Persistent logs** — Docker volume for log files

---

### Method 4: PM2 Process Manager

For production servers already using PM2.

```bash
# First time: install dependencies and build
npm install && npm run build

# Start via PM2
pm2 start ecosystem.config.js

# PM2 commands
pm2 logs web-terminal      # View logs
pm2 restart web-terminal   # Restart
pm2 stop web-terminal      # Stop
pm2 delete web-terminal    # Remove
pm2 save                   # Save process list for auto-restart on reboot
pm2 startup                # Generate startup script
```

The `ecosystem.config.js` configuration includes:
- **Auto-restart** on crashes
- **Memory limit** — restarts at 512MB
- **Log rotation** — writes to `./logs/error.log` and `./logs/out.log`
- **Auto-creates** the `logs/` directory on first run

---

### Method 5: systemd Service

For Linux servers without Docker or PM2. Runs as a system service with automatic startup.

```bash
# Build first
npm install && npm run build

# Deploy to standard location
sudo cp -r . /opt/web-terminal
cd /opt/web-terminal

# Install the service
sudo cp web-terminal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable web-terminal    # Auto-start on boot
sudo systemctl start web-terminal     # Start now

# Management commands
sudo systemctl status web-terminal    # Check status
sudo systemctl restart web-terminal   # Restart
sudo systemctl stop web-terminal      # Stop
journalctl -u web-terminal -f         # View logs
```

> **Note:** Edit `web-terminal.service` to match your deployment path if not using `/opt/web-terminal`. Also update `User=www-data` to your preferred user (e.g., `ubuntu`, `ec2-user`).

---

### Method 6: Nginx Reverse Proxy

Add HTTPS, domain support, and security headers using Nginx in front of any deployment method.

```bash
# Copy the example config
sudo cp nginx.conf.example /etc/nginx/sites-available/web-terminal

# Edit: replace 'your-domain.com' with your actual domain
sudo nano /etc/nginx/sites-available/web-terminal

# Enable the site
sudo ln -s /etc/nginx/sites-available/web-terminal /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

#### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Uncomment the HTTPS server block in the nginx config after obtaining certificates.

---

## Project Structure

```
web-terminal/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── terminal/
│   │   │       └── route.ts        # Backend API — session management & command execution
│   │   ├── globals.css             # Global styles (Tailwind + terminal resets)
│   │   ├── layout.tsx              # Root layout (Geist Mono font, dark bg)
│   │   └── page.tsx                # Terminal emulator UI (React client component)
│   ├── components/ui/              # shadcn/ui components (unused by terminal)
│   ├── hooks/                      # Shared React hooks
│   └── lib/                        # Utility functions
├── public/
│   ├── logo.svg
│   └── robots.txt
├── logs/
│   └── .gitkeep                    # Placeholder for PM2 log directory
├── setup.sh                        # One-click deploy script
├── Dockerfile                      # Multi-stage production Docker image
├── docker-compose.yml              # Docker Compose with health checks
├── ecosystem.config.js             # PM2 process configuration
├── nginx.conf.example              # Nginx reverse proxy template
├── web-terminal.service            # systemd service file
├── .dockerignore                   # Docker build context exclusions
├── .gitignore                      # Git exclusions
├── next.config.ts                  # Next.js config (standalone output)
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── tailwind.config.ts              # Tailwind CSS configuration
├── postcss.config.mjs              # PostCSS configuration
└── eslint.config.mjs               # ESLint configuration
```

---

## API Reference

### `POST /api/terminal`

The single API endpoint handles all terminal interactions.

#### Initialize a Session

**Request:**
```json
{ "action": "init" }
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid-string",
  "cwd": "/home/user",
  "prompt": "~ $ ",
  "stdout": "script output...",
  "stderr": ""
}
```

#### Execute a Command

**Request:**
```json
{ "sessionId": "uuid-string", "command": "ls -la" }
```

**Response:**
```json
{
  "success": true,
  "stdout": "total 32\ndrwxr-xr-x  5 user user 4096 ...",
  "stderr": "",
  "exitCode": 0,
  "prompt": "~ $ ",
  "cwd": "/home/user"
}
```

#### Special Responses

| Command | Response |
|---------|----------|
| `clear` / `cls` | `{ "success": true, "clear": true, "prompt": "...", "cwd": "..." }` |
| `exit` | `{ "success": true, "exit": true }` |

#### Error Response

```json
{ "success": false, "error": "Invalid or expired session." }
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listening port |
| `HOSTNAME` | `0.0.0.0` | Bind address (use `0.0.0.0` for external access) |
| `NODE_ENV` | `development` | Set to `production` for optimized builds |

### Custom Port

```bash
# Setup script
PORT=8080 ./setup.sh start

# Docker
docker run -p 8080:3000 web-terminal

# Docker Compose
PORT=8080 docker compose up -d

# PM2
PORT=8080 pm2 start ecosystem.config.js
```

### Auto-Start Script

The auto-start script runs once when a new terminal session is initialized. It is defined in `src/app/api/terminal/route.ts` as the `AUTO_SCRIPT` constant. Modify it to run any initialization commands when a user opens the terminal.

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16 | React framework with App Router |
| TypeScript | 5 | Type-safe JavaScript |
| Tailwind CSS | 4 | Utility-first CSS framework |
| React | 19 | UI rendering |
| Node.js | 18+ / Bun | Server runtime |
| child_process | Built-in | Shell command execution |

---

## Troubleshooting

### Port already in use

```bash
# Find what's using port 3000
lsof -i :3000
# or
ss -tulpn | grep 3000

# Kill the process or use a different port
PORT=3001 ./setup.sh start
```

### Permission denied on setup.sh

```bash
chmod +x setup.sh
```

### Build fails with out-of-memory

Increase Node.js memory limit:

```bash
NODE_OPTIONS="--max-old-space-size=4096" ./setup.sh build
```

### PM2 not found

```bash
npm install -g pm2
```

### Docker build fails

Ensure Docker is installed and the daemon is running:

```bash
docker --version
docker compose version
systemctl status docker   # Linux
```

### Browser can't connect

1. Verify the server is running: `curl http://localhost:3000`
2. Check the port is open: `ss -tulpn | grep 3000`
3. If using a firewall, allow the port: `sudo ufw allow 3000`
4. If on a VPS, ensure your security group allows inbound traffic on port 3000

### Commands not executing

The backend requires `/bin/bash` to be available on the server. Verify:

```bash
which bash
# Should output: /bin/bash
```

---

## License

Private project. All rights reserved.
