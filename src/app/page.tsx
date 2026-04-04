"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// Types
interface TerminalLine {
  id: number;
  type:
    | "info"
    | "success"
    | "prompt"
    | "command"
    | "stdout"
    | "stderr"
    | "error"
    | "separator"
    | "ctrl-c";
  content: string;
}

// Helper: escape HTML
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState("$ ");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isReady, setIsReady] = useState(false);

  const lineIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);

  // Add a line
  const addLine = useCallback(
    (type: TerminalLine["type"], content: string) => {
      lineIdRef.current += 1;
      setLines((prev) => [...prev, { id: lineIdRef.current, type, content }]);
    },
    []
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on click anywhere on terminal body
  const handleTerminalClick = useCallback(() => {
    if (inputRef.current && isReady) {
      inputRef.current.focus();
    }
  }, [isReady]);

  // Initialize terminal session
  useEffect(() => {
    let cancelled = false;

    async function init() {
      addLine("info", "Initializing terminal session...");

      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "init" }),
        });

        const data = await res.json();

        if (cancelled) return;

        if (data.sessionId) {
          setSessionId(data.sessionId);
          setCurrentPrompt(data.prompt || "$ ");

          addLine("success", "\u2713 Terminal session started");
          addLine("separator", "\u2500".repeat(60));
          addLine("info", "\u25B6 Running auto-start script...");

          // Display script output line by line
          if (data.scriptOutput) {
            const scriptLines = data.scriptOutput.split("\n");
            for (const line of scriptLines) {
              if (line.trim()) {
                addLine("stdout", line);
              }
            }
          }

          addLine("separator", "\u2500".repeat(60));
          addLine("success", "\u2713 Ready. Type commands below.");
          addLine("info", "");
          setIsReady(true);
        } else {
          addLine("error", "Failed to initialize terminal: " + (data.error || "Unknown error"));
        }
      } catch (err) {
        if (cancelled) return;
        addLine(
          "error",
          "Failed to connect to terminal backend: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [addLine]);

  // Send command
  const sendCommand = useCallback(
    async (cmd: string) => {
      if (!sessionId || isProcessing) return;

      const trimmed = cmd.trim();
      if (!trimmed) return;

      // Show the command with prompt
      addLine("prompt", currentPrompt);
      addLine("command", trimmed);
      setIsProcessing(true);

      // Update history
      historyRef.current = [...historyRef.current, trimmed];
      setHistory([...historyRef.current]);
      setHistoryIndex(-1);

      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, command: trimmed }),
        });

        const data = await res.json();

        if (data.clear) {
          setLines([]);
          setIsProcessing(false);
          return;
        }

        if (data.exit) {
          addLine("info", "Session ended. Refresh the page to start a new session.");
          setIsReady(false);
          setIsProcessing(false);
          return;
        }

        if (!data.success && data.error) {
          addLine("error", data.error);
        } else {
          // Display stdout
          if (data.stdout) {
            const outLines = data.stdout.split("\n");
            for (const line of outLines) {
              addLine("stdout", line);
            }
          }
          // Display stderr
          if (data.stderr) {
            const errLines = data.stderr.split("\n");
            for (const line of errLines) {
              if (line.trim()) {
                addLine("stderr", line);
              }
            }
          }
        }

        // Update prompt and cwd
        if (data.prompt) {
          setCurrentPrompt(data.prompt);
        }
      } catch (err) {
        addLine(
          "error",
          "Error executing command: " + (err instanceof Error ? err.message : String(err))
        );
      }

      setIsProcessing(false);
    },
    [sessionId, isProcessing, currentPrompt, addLine]
  );

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = input;
        setInput("");
        sendCommand(cmd);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length > 0) {
          const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex !== -1) {
          const newIndex = historyIndex + 1;
          if (newIndex >= history.length) {
            setHistoryIndex(-1);
            setInput("");
          } else {
            setHistoryIndex(newIndex);
            setInput(history[newIndex]);
          }
        }
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        setLines([]);
      } else if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        addLine("ctrl-c", "^C");
        setInput("");
      }
    },
    [input, history, historyIndex, sendCommand, addLine]
  );

  // Render a line
  const renderLine = (line: TerminalLine) => {
    switch (line.type) {
      case "info":
        return (
          <div key={line.id} className="text-[#8b949e]">
            {escapeHtml(line.content)}
          </div>
        );
      case "success":
        return (
          <div key={line.id} className="text-[#3fb950]">
            {escapeHtml(line.content)}
          </div>
        );
      case "prompt":
        return (
          <div key={line.id} className="text-[#3fb950] font-bold">
            {escapeHtml(line.content)}
          </div>
        );
      case "command":
        return (
          <div key={line.id} className="text-[#e6edf3]">
            {escapeHtml(line.content)}
          </div>
        );
      case "stdout":
        return (
          <div key={line.id} className="text-[#c9d1d9]">
            {escapeHtml(line.content)}
          </div>
        );
      case "stderr":
        return (
          <div key={line.id} className="text-[#ff7b72]">
            {escapeHtml(line.content)}
          </div>
        );
      case "error":
        return (
          <div key={line.id} className="text-[#f85149]">
            {escapeHtml(line.content)}
          </div>
        );
      case "separator":
        return (
          <div key={line.id} className="text-[#30363d]">
            {escapeHtml(line.content)}
          </div>
        );
      case "ctrl-c":
        return (
          <div key={line.id} className="text-[#e6edf3]">
            {escapeHtml(line.content)}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] overflow-hidden">
      {/* macOS-style header */}
      <div className="flex items-center h-[42px] px-4 bg-[#161b22] border-b border-[#30363d] shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 text-center text-[#8b949e] text-xs font-medium tracking-wide">
          Terminal &mdash; bash
        </div>
        <div className="w-[52px]" /> {/* Spacer to balance the dots */}
      </div>

      {/* Terminal body */}
      <div
        className="flex-1 overflow-hidden flex flex-col"
        onClick={handleTerminalClick}
      >
        {/* Output area */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto p-4 terminal-scrollbar"
          style={{
            fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', Menlo, Monaco, monospace",
            fontSize: "13px",
            lineHeight: "1.5",
          }}
        >
          {lines.map(renderLine)}

          {/* Current input line */}
          {isReady && (
            <div className="flex items-center">
              <span className="text-[#3fb950] font-bold shrink-0">{escapeHtml(currentPrompt)}</span>
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent text-[#e6edf3] outline-none border-none caret-[#58a6ff] terminal-input"
                  style={{
                    fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', Menlo, Monaco, monospace",
                    fontSize: "13px",
                    lineHeight: "1.5",
                  }}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                {/* Blinking cursor when processing */}
                {isProcessing && (
                  <span className="absolute top-0 left-0 text-[#58a6ff] animate-blink">
                    ▊
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
