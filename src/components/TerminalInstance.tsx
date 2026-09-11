import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { terminalThemes } from '../utils/terminalThemes';
import { useTheme } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { Loader2, AlertCircle, RefreshCw, Key } from 'lucide-react';
import type { TerminalPane, SSHProfile } from '../types';

interface TerminalInstanceProps {
  pane: TerminalPane;
  isActive: boolean;
  onFocus: () => void;
  onOpenSSHModal?: (profile: SSHProfile) => void;
}

export const TerminalInstance: React.FC<TerminalInstanceProps> = ({
  pane,
  isActive,
  onFocus,
  onOpenSSHModal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { terminalTheme, settings } = useTheme();
  const { sshProfiles } = useApp();

  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<SSHProfile | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let disposables: (() => void)[] = [];

    const initTerminal = async () => {
      if (!containerRef.current) return;
      setIsConnecting(true);
      setError(null);

      // Clean up previous terminal from DOM
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      containerRef.current.innerHTML = '';

      const themeConfig = terminalThemes[terminalTheme] || terminalThemes.dark;

      const term = new XTerm({
        theme: themeConfig,
        fontSize: settings?.terminalFontSize || 14,
        fontFamily: settings?.terminalFontFamily || 'Menlo, Monaco, "Courier New", monospace',
        cursorBlink: true,
        cursorStyle: 'block',
        allowProposedApi: true,
        macOptionIsMeta: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // 1. Setup ResizeObserver immediately so PTY always has correct dimensions
      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          term.scrollToBottom();
          const r = term.rows > 0 ? term.rows : 24;
          const c = term.cols > 0 ? term.cols : 80;
          window.api.ssh.resize(pane.sessionId, r, c);
        } catch {
          // Ignored
        }
      });
      resizeObserver.observe(containerRef.current);

      // 2. Setup listeners immediately so no user keystrokes or remote data are missed
      const dataListener = term.onData((data) => {
        window.api.ssh.write(pane.sessionId, data);
      });

      const unsubData = window.api.ssh.onData((sessionId, data) => {
        if (sessionId === pane.sessionId && termRef.current) {
          termRef.current.write(data);
          termRef.current.scrollToBottom();
        }
      });

      const unsubClosed = window.api.ssh.onClosed((sessionId) => {
        if (sessionId === pane.sessionId && termRef.current) {
          termRef.current.writeln('\r\n\x1b[33m[Сесію термінала завершено]\x1b[0m\r\n');
        }
      });

      const unsubError = window.api.ssh.onError((sessionId, errMsg) => {
        if (sessionId === pane.sessionId && termRef.current) {
          termRef.current.writeln(`\r\n\x1b[31m[Помилка]: ${errMsg}\x1b[0m\r\n`);
        }
      });

      disposables.push(
        () => resizeObserver.disconnect(),
        () => dataListener.dispose(),
        () => unsubData(),
        () => unsubClosed(),
        () => unsubError(),
        () => term.dispose()
      );

      // 3. Determine SSH profile (check context, then direct store, then system defaults)
      let profile = sshProfiles.find((p) => p.id === pane.sshProfileId || p.vmid === pane.vmid);

      if (!profile && window.api?.store?.getSSHProfiles) {
        try {
          const stored = await window.api.store.getSSHProfiles();
          if (isCancelled) return;
          profile = stored?.find((p) => p.id === pane.sshProfileId || p.vmid === pane.vmid);
        } catch {
          // Fallback below
        }
      }

      if (!profile) {
        const defaults = await window.api.ssh.getSystemDefaults(pane.host);
        if (isCancelled) return;
        profile = {
          id: `auto-${pane.vmid}`,
          name: `VM-${pane.vmid}`,
          host: pane.host || '',
          port: 22,
          username: defaults.username || '',
          authType: 'privateKey',
          privateKeyPath: defaults.privateKeyPath || '~/.ssh/id_ed25519',
          vmid: pane.vmid,
        };
      }
      setCurrentProfile(profile);

      if (!profile.host) {
        setError('Не вказано IP адресу для віртуальної машини.');
        setIsConnecting(false);
        return;
      }

      // 4. Connect to SSH with valid rows and cols
      try {
        fitAddon.fit();
        const rows = term.rows > 0 ? term.rows : 24;
        const cols = term.cols > 0 ? term.cols : 80;
        const res = await window.api.ssh.connect(pane.sessionId, profile, rows, cols);

        if (isCancelled) {
          window.api.ssh.disconnect(pane.sessionId);
          return;
        }

        if (!res.success) {
          setError(res.error || 'Помилка підключення до SSH сервера');
          term.writeln(`\r\n\x1b[31m[Помилка SSH]: ${res.error || 'Не вдалося підключитися'}\x1b[0m\r\n`);
          term.writeln(`\x1b[33mНатисніть кнопку "Налаштувати SSH" вгорі, щоб перевірити логін (наприклад, magna_mentes або root) та ключ.\x1b[0m\r\n`);
        } else {
          term.writeln('\x1b[32m[V-Master]: Підключено до Ubuntu термінала через SSH PTY.\x1b[0m\r\n');
          setTimeout(() => {
            term.focus();
            term.textarea?.focus();
          }, 50);
        }
      } catch (e: any) {
        if (!isCancelled) {
          setError(e.message);
          term.writeln(`\r\n\x1b[31m[Помилка]: ${e.message}\x1b[0m\r\n`);
        }
      } finally {
        if (!isCancelled) {
          setIsConnecting(false);
          setTimeout(() => {
            termRef.current?.focus();
            termRef.current?.textarea?.focus();
          }, 50);
        }
      }
    };

    initTerminal();

    return () => {
      isCancelled = true;
      disposables.forEach((fn) => {
        try {
          fn();
        } catch {
          // Ignored
        }
      });
      window.api.ssh.disconnect(pane.sessionId);
    };
  }, [pane.sessionId, pane.sshProfileId]);

  // Focus terminal when pane becomes active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
      termRef.current.textarea?.focus();
    }
  }, [isActive]);

  // Update theme dynamically
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = terminalThemes[terminalTheme] || terminalThemes.dark;
    }
  }, [terminalTheme]);

  const handleTerminalFocus = () => {
    onFocus();
    if (termRef.current) {
      termRef.current.focus();
      termRef.current.textarea?.focus();
    }
  };

  return (
    <div
      onClick={onFocus}
      className={`relative w-full h-full flex flex-col overflow-hidden transition-all ${
        isActive ? 'ring-2 ring-blue-500/80 ring-inset' : 'border border-zinc-300 dark:border-zinc-800'
      }`}
    >
      {/* Terminal Pane Header */}
      <div className="h-8 px-3 flex items-center justify-between bg-zinc-200/90 dark:bg-[#1E1E22] border-b border-zinc-300 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-[11px] truncate">{pane.title}</span>
          {pane.host && <span className="font-mono text-[10px] text-zinc-400">({pane.host})</span>}
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1 text-[10px] text-red-500 truncate max-w-[200px]" title={error}>
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>Помилка автентифікації</span>
            </span>
          )}

          {onOpenSSHModal && currentProfile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenSSHModal(currentProfile);
              }}
              title="Налаштувати облікові дані SSH (користувач, ключ, пароль)"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-[11px] font-medium transition-colors border border-amber-300 dark:border-amber-800"
            >
              <Key className="w-3 h-3" />
              <span>Налаштувати SSH</span>
            </button>
          )}

          <button
            onClick={() => {
              // Trigger reconnect by toggling connecting state and restarting
              if (termRef.current) {
                termRef.current.focus();
              }
              window.api.ssh.disconnect(pane.sessionId);
              setIsConnecting(true);
              // Small delay to allow clean disconnect
              setTimeout(() => {
                if (pane.host && currentProfile) {
                  const { rows, cols } = termRef.current || { rows: 24, cols: 80 };
                  window.api.ssh.connect(pane.sessionId, currentProfile, rows, cols).then(() => {
                    setIsConnecting(false);
                    termRef.current?.focus();
                  });
                }
              }, 100);
            }}
            title="Перепідключити термінал"
            className="p-1 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Terminal Canvas */}
      <div
        className="relative flex-1 w-full h-full bg-black cursor-text overflow-hidden outline-none"
        onMouseDown={handleTerminalFocus}
        onClick={handleTerminalFocus}
      >
        {isConnecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-xs text-zinc-300 text-xs gap-2 pointer-events-none select-none">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Підключення до Ubuntu VM...</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="absolute inset-0 p-1"
          onMouseDown={handleTerminalFocus}
          onClick={handleTerminalFocus}
        />
      </div>
    </div>
  );
};
