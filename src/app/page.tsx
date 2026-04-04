'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TerminalLine {
  id: string;
  type: 'prompt' | 'stdout' | 'stderr' | 'error' | 'success' | 'info' | 'command' | 'separator';
  content: string;
}

let lineIdCounter = 0;
function nextLineId(): string {
  return `line-${++lineIdCounter}`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines((prev) => [...prev, { id: nextLineId(), type, content }]);
  }, []);

  const addLines = useCallback((newLines: { type: TerminalLine['type']; content: string }[]) => {
    setLines((prev) => [
      ...prev,
      ...newLines.map((l) => ({ id: nextLineId(), type: l.type, content: l.content })),
    ]);
  }, []);

  // Initialize terminal session
  useEffect(() => {
    async function init() {
      addLine('info', 'Initializing terminal session...');

      try {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'init' }),
        });

        const data = await res.json();

        if (!data.success) {
          addLine('error', `Failed to initialize: ${data.error}`);
          return;
        }

        setSessionId(data.sessionId);
        setCurrentPrompt(data.prompt);
        addLine('success', '✓ Terminal session started');

        // Add separator
        addLine('separator', '─'.repeat(60));

        // Show script output
        if (data.stdout || data.stderr) {
          addLine('info', '▶ Running auto-start script...');

          if (data.stdout) {
            data.stdout.trim().split('\n').forEach((line: string) => {
              if (line.trim()) addLine('stdout', line);
            });
          }
          if (data.stderr) {
            data.stderr.trim().split('\n').forEach((line: string) => {
              if (line.trim()) addLine('stderr', line);
            });
          }

          addLine('separator', '─'.repeat(60));
        }

        addLine('success', '✓ Ready. Type commands below.');
        setIsInitialized(true);
      } catch (err) {
        addLine('error', `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    init();
  }, []);

  // Auto-scroll on new lines
  useEffect(() => {
    scrollToBottom();
  }, [lines, scrollToBottom]);

  // Focus input when initialized
  useEffect(() => {
    if (isInitialized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInitialized]);

  const sendCommand = useCallback(
    async (command: string) => {
      if (!sessionId || isProcessing) return;

      // Record command in local history
      setHistory((prev) => [...prev, command]);
      setHistoryIndex(-1);

      // Show prompt + command
      addLine('prompt', `${currentPrompt}${escapeHtml(command)}`);
      setIsProcessing(true);
      setInput('');

      try {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, command }),
        });

        const data = await res.json();

        if (!data.success) {
          addLine('error', data.error || 'Command failed');
          setIsProcessing(false);
          return;
        }

        // Handle clear
        if (data.clear) {
          setLines([]);
          setIsProcessing(false);
          if (inputRef.current) inputRef.current.focus();
          return;
        }

        // Handle exit
        if (data.exit) {
          addLine('info', 'Session ended. Refresh the page to start a new session.');
          setSessionId(null);
          setIsInitialized(false);
          setIsProcessing(false);
          return;
        }

        // Update prompt and cwd
        if (data.prompt) {
          setCurrentPrompt(data.prompt);
        }

        // Display stdout
        if (data.stdout) {
          data.stdout.split('\n').forEach((line: string) => {
            addLine('stdout', line);
          });
        }

        // Display stderr
        if (data.stderr) {
          data.stderr.split('\n').forEach((line: string) => {
            addLine('stderr', line);
          });
        }
      } catch (err) {
        addLine('error', `Error: ${err instanceof Error ? err.message : 'Request failed'}`);
      }

      setIsProcessing(false);
      if (inputRef.current) inputRef.current.focus();
    },
    [sessionId, isProcessing, currentPrompt, addLine]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = input.trim();
        if (cmd) {
          sendCommand(cmd);
        } else {
          // Empty command — show prompt
          addLine('prompt', `${currentPrompt}`);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length === 0) return;
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === -1) return;
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        setLines([]);
      } else if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        addLine('prompt', `${currentPrompt}${escapeHtml(input)}^C`);
        setInput('');
        setHistoryIndex(-1);
      }
    },
    [input, history, historyIndex, currentPrompt, sendCommand, addLine]
  );

  const getLineColor = (type: TerminalLine['type']): string => {
    switch (type) {
      case 'prompt':
        return 'text-[#3fb950] font-bold';
      case 'command':
        return 'text-[#e6edf3]';
      case 'stdout':
        return 'text-[#c9d1d9]';
      case 'stderr':
        return 'text-[#ff7b72]';
      case 'error':
        return 'text-[#f85149]';
      case 'success':
        return 'text-[#3fb950]';
      case 'info':
        return 'text-[#8b949e]';
      case 'separator':
        return 'text-[#30363d]';
      default:
        return 'text-[#c9d1d9]';
    }
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden select-none"
      style={{ backgroundColor: '#0d1117' }}
    >
      {/* macOS-style header bar */}
      <div
        className="flex items-center justify-center px-4 py-2.5 shrink-0"
        style={{
          backgroundColor: '#161b22',
          borderBottom: '1px solid #30363d',
        }}
      >
        <div className="flex items-center gap-1.5 absolute left-4">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: '#ff5f57' }}
          />
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: '#febc2e' }}
          />
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: '#28c840' }}
          />
        </div>
        <span
          className="text-xs font-medium"
          style={{ color: '#8b949e' }}
        >
          Terminal — bash
        </span>
      </div>

      {/* Terminal body */}
      <div
        ref={terminalBodyRef}
        className="flex-1 flex flex-col min-h-0 cursor-text"
        onClick={() => {
          if (inputRef.current) inputRef.current.focus();
        }}
      >
        {/* Output area */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto p-4 min-h-0"
          style={{
            fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', Menlo, Monaco, monospace",
            fontSize: '13px',
            lineHeight: '1.5',
            // Custom scrollbar
            scrollbarWidth: 'thin',
            scrollbarColor: '#30363d transparent',
          }}
        >
          {lines.map((line) => (
            <div
              key={line.id}
              className={`${getLineColor(line.type)}`}
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {line.content}
            </div>
          ))}

          {/* Current input line (prompt + typed text) */}
          {isInitialized && !isProcessing && (
            <div className="flex" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span className="text-[#3fb950] font-bold">{currentPrompt}</span>
              <span className="text-[#e6edf3]">{escapeHtml(input)}</span>
              <span
                className="inline-block"
                style={{
                  color: '#58a6ff',
                  animation: 'blink 1s step-end infinite',
                }}
              >
                ▊
              </span>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span className="text-[#3fb950] font-bold">{currentPrompt}</span>
              <span
                className="inline-block"
                style={{
                  color: '#58a6ff',
                  animation: 'blink 1s step-end infinite',
                }}
              >
                ▊
              </span>
            </div>
          )}
        </div>

        {/* Hidden input that captures keyboard */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isInitialized || isProcessing}
          className="absolute opacity-0 pointer-events-none"
          style={{ width: 0, height: 0 }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Terminal input"
        />
      </div>

      {/* Blinking cursor animation */}
      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Custom scrollbar for WebKit browsers */
        div::-webkit-scrollbar {
          width: 6px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background-color: #30363d;
          border-radius: 3px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background-color: #484f58;
        }

        /* Remove body margin and scrolling */
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
