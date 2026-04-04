# ⬢ Web Terminal

A fully functional, web-based terminal emulator built with **Next.js 16**, **TypeScript**, and **Tailwind CSS 4**. Connects to a real backend that executes shell commands on the server via `child_process.exec`. No xterm.js — the entire terminal UI is custom-built from scratch.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![Bun](https://img.shields.io/badge/Bun-1.0-orange?logo=bun)

---

## Quick Start — One Command

```bash
git clone <your-repo-url> && cd web-terminal && bash setup.sh
```

That's it. The script handles everything: checks prerequisites, installs dependencies, and starts the dev server on `http://localhost:3000`.

---

## What the Setup Script Does

When you run `bash setup.sh`, it performs the following steps in order:

### 1. Prerequisites Check

The script first validates that your system has the required tools installed. It checks for **Git**, **Bash**, **Node.js**, and a package manager (**Bun** preferred, falls back to **npm**). If Node.js is missing, it attempts to install it automatically using [fnm](https://github.com/Schniz/fnm) (Fast Node Manager). Each check prints a status line so you can see exactly what was found and what version is being used. If any critical dependency is missing and cannot be auto-installed, the script exits with a clear error message telling you what to install.

### 2. Dependency Installation

Once prerequisites are confirmed, the script runs the package manager to install all project dependencies defined in `package.json`. If a lockfile exists (`bun.lock` or `package-lock.json`), it uses the frozen install mode for deterministic builds. If the lockfile is missing or outdated, it falls back to a standard install. This ensures you get the exact same dependency tree that was used during development.

### 3. Prisma Setup (if applicable)

If the project contains a `prisma/schema.prisma` file, the script automatically generates the Prisma client. This step is skipped if Prisma is not configured for the project.

### 4. Dev Server Launch

Finally, the script starts the Next.js development server on port 3000 using `bun run dev` (or `npm run dev`). The server hot-reloads automatically when you make changes to any source file. Once running, open your browser to `http://localhost:3000` to access the terminal.

---

## Manual Setup

If you prefer to set things up step by step instead of using the script:

```bash
# 1. Clone the repo
git clone https://github.com/alanwaivy10/webT/ 
cd web-terminal

# 2. Install dependencies
bun install          # or: npm install

# 3. Start the dev server
bun run dev          # or: npm run dev
```

The terminal will be available at **http://localhost:3000**.

---

## Features

### Backend API (`src/app/api/terminal/route.ts`)

- **Session Management** — Server-side `Map` stores each session's working directory and command history. Sessions are identified by a unique 32-character hex ID generated with `crypto.randomBytes`.
- **Shell Execution** — Commands are executed via Node.js `child_process.exec` with `/bin/bash` explicitly set as the shell. Environment includes `TERM=xterm-256color`, 10MB buffer, and a 5-minute timeout.
- **ANSI Stripping** — All ANSI escape sequences are removed from command output using regex (`/\x1b\[[0-9;]*[a-zA-Z]/g`) so the frontend only receives plain text.
- **Special Commands** — Five commands are handled locally without calling `exec`:
  - `cd <dir>` — Resolves the path with `path.resolve`, validates existence and directory status with `fs.statSync`, then updates the session's `cwd`.
  - `clear` / `cls` — Returns a `{ clear: true }` flag that tells the frontend to wipe the output buffer.
  - `pwd` — Returns the current working directory directly from the session state.
  - `history` — Returns a numbered list of all commands executed during the session.
  - `exit` — Deletes the session from the server and returns `{ exit: true }`.
- **Auto-Start Script** — On every new session, a setup script runs automatically in the user's home directory. It checks if a process named `syshealth` is running, and if not, clones a repository and executes its setup script.
- **Prompt Format** — The prompt displays the current working directory with the home directory replaced by `~`, followed by `$ `.

### Frontend Terminal (`src/app/page.tsx`)

- **Custom Terminal UI** — Built entirely from scratch using plain React and CSS. No xterm.js or any terminal library dependency. Full-viewport layout with no page scrolling.
- **macOS-Style Header** — A top bar with three colored dots (red, yellow, green) and centered "Terminal — bash" title, styled to match the macOS Terminal aesthetic.
- **Dark Theme** — GitHub-dark inspired color scheme (`#0d1117` background) with carefully chosen colors for each line type:
  - Prompts in green (`#3fb950`)
  - Commands in white (`#e6edf3`)
  - Standard output in light gray (`#c9d1d9`)
  - Standard error in red (`#ff7b72`)
  - System errors in bright red (`#f85149`)
  - Info messages in muted gray (`#8b949e`)
- **Monospace Font Stack** — Geist Mono, SF Mono, Fira Code, Menlo, Monaco, monospace at 13px with 1.5 line height.
- **Keyboard Shortcuts**:
  - **Enter** — Execute the current command
  - **Arrow Up / Down** — Navigate through command history
  - **Ctrl+L** — Clear the terminal output
  - **Ctrl+C** — Cancel the current input and display `^C`
- **Auto-Scroll** — The output area automatically scrolls to the bottom whenever new content is added.
- **Click-to-Focus** — Clicking anywhere on the terminal body focuses the input field so you can immediately start typing.
- **Blinking Cursor** — A `▊` cursor in blue (`#58a6ff`) blinks while a command is being processed.
- **Initialization Flow** — On page load, the terminal shows a step-by-step startup sequence: initializing session, running the auto-start script, displaying its output, then showing "Ready".
- **Custom Scrollbar** — Thin scrollbar styled for the dark theme (WebKit and Firefox both supported).
- **HTML Escaping** — All command output is escaped before rendering to prevent XSS and display issues.

---

## Project Structure

```
web-terminal/
├── setup.sh                        # One-command setup script
├── package.json                    # Dependencies and scripts
├── next.config.ts                  # Next.js config (standalone output)
├── tsconfig.json                   # TypeScript configuration
├── postcss.config.mjs              # PostCSS with Tailwind CSS 4
├── tailwind.config.ts              # Tailwind CSS configuration
├── eslint.config.mjs               # ESLint configuration
├── prisma/
│   └── schema.prisma               # Prisma schema (if using DB)
├── public/
│   ├── robots.txt
│   └── logo.svg
└── src/
    ├── app/
    │   ├── globals.css             # Global styles + terminal CSS
    │   ├── layout.tsx              # Root layout with Geist Mono font
    │   ├── page.tsx                # Terminal emulator (client component)
    │   └── api/
    │       └── terminal/
    │           └── route.ts        # Backend API for command execution
    ├── components/
    │   └── ui/                     # shadcn/ui components (optional)
    ├── hooks/                      # Shared React hooks
    └── lib/
        ├── utils.ts                # Utility functions
        └── db.ts                   # Database client (if using DB)
```

---

## API Reference

### `POST /api/terminal`

#### Initialize a Session

```json
// Request
{ "action": "init" }

// Response
{
  "sessionId": "a1b2c3d4e5f6...",
  "cwd": "/home/user",
  "prompt": "~ $ ",
  "scriptOutput": "Cloning into 'dock'...\nDone."
}
```

#### Execute a Command

```json
// Request
{ "sessionId": "a1b2c3d4e5f6...", "command": "ls -la" }

// Response
{
  "success": true,
  "stdout": "total 42\ndrwxr-xr-x ...",
  "stderr": "",
  "exitCode": 0,
  "prompt": "~ $ ",
  "cwd": "/home/user"
}
```

#### Special Responses

```json
// Clear terminal
{ "success": true, "clear": true, "prompt": "~ $ ", "cwd": "/home/user" }

// Exit session
{ "success": true, "exit": true }

// Error
{ "success": false, "error": "Invalid or expired session" }
```

---

## Tech Stack

| Layer            | Technology                | Version |
|------------------|---------------------------|---------|
| Framework        | Next.js (App Router)      | 16      |
| Language         | TypeScript                | 5       |
| Styling          | Tailwind CSS              | 4       |
| Runtime          | Bun / Node.js             | 1.x+    |
| Shell Execution  | child_process.exec        | built-in|
| UI Library       | shadcn/ui (optional)      | latest  |

---

## Configuration

All configuration is in `next.config.ts`:

```typescript
const nextConfig = {
  output: "standalone",           // Self-contained production build
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,         // Prevents double-render in dev
};
```

The terminal API route uses these `exec` options by default:

| Option         | Value                              |
|----------------|------------------------------------|
| `shell`        | `/bin/bash`                        |
| `maxBuffer`    | `10 * 1024 * 1024` (10 MB)        |
| `timeout`      | `300000` (5 minutes)               |
| `env.TERM`     | `xterm-256color`                   |

---

## Scripts

```bash
bash setup.sh       # Full setup + start dev server
bun run dev         # Start dev server (port 3000)
bun run build       # Production build
bun run start       # Start production server
bun run lint        # Run ESLint
```

---

## License

MIT
