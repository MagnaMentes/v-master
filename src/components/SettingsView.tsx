import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Terminal,
  Server,
  Key,
  Trash2,
  Edit2,
  Plus,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { ServerModal } from './ServerModal';
import { SSHProfileModal } from './SSHProfileModal';
import { terminalThemes } from '../utils/terminalThemes';
import type { ProxmoxServerConfig, SSHProfile, TerminalTheme } from '../types';

export const SettingsView: React.FC = () => {
  const { theme, setTheme, terminalTheme, setTerminalTheme, settings, updateSettings } = useTheme();
  const { servers, saveServer, deleteServer, sshProfiles, saveSSHProfile, deleteSSHProfile } = useApp();

  const [editingServer, setEditingServer] = useState<ProxmoxServerConfig | null>(null);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);

  const [editingSSHProfile, setEditingSSHProfile] = useState<SSHProfile | null>(null);
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);

  const [fontSize, setFontSize] = useState<number>(settings?.terminalFontSize || 14);

  const handleFontSizeChange = async (size: number) => {
    setFontSize(size);
    await updateSettings({ terminalFontSize: size });
  };

  const currentTerminalColors = terminalThemes[terminalTheme] || terminalThemes.dark;
  const themeOptions: { id: TerminalTheme; label: string; bg: string }[] = [
    { id: 'dark', label: 'Dark Default', bg: '#18181B' },
    { id: 'light', label: 'Light Clean', bg: '#FFFFFF' },
    { id: 'dracula', label: 'Dracula Dark', bg: '#282A36' },
    { id: 'monokai', label: 'Monokai Pro', bg: '#272822' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-[#18181B] text-zinc-800 dark:text-zinc-100 overflow-y-auto select-none p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold">Налаштування V-Master</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Керування зовнішнім виглядом, підключеннями та терміналами
          </p>
        </div>
      </div>

      {/* Visual Theme Settings (Rule #7 compliant) */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span>Тема інтерфейсу</span>
        </h2>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          <button
            onClick={() => setTheme('light')}
            className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
              theme === 'light'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <Sun className="w-5 h-5" />
            <span>Світла (Light)</span>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
              theme === 'dark'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <Moon className="w-5 h-5" />
            <span>Темна (Dark)</span>
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
              theme === 'system'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <Monitor className="w-5 h-5" />
            <span>macOS Auto</span>
          </button>
        </div>
      </div>

      {/* Terminal Settings */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-500" />
          <span>Налаштування термінала xterm</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl text-xs">
          <div>
            <label className="block font-medium mb-1.5">Кольорова палітра термінала</label>
            <select
              value={terminalTheme}
              onChange={(e) => setTerminalTheme(e.target.value as TerminalTheme)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden"
            >
              <option value="dark">Dark Default</option>
              <option value="light">Light Clean</option>
              <option value="dracula">Dracula Dark</option>
              <option value="monokai">Monokai Pro</option>
            </select>
          </div>

          <div>
            <label className="block font-medium mb-1.5">Розмір шрифту ({fontSize}px)</label>
            <input
              type="range"
              min="11"
              max="20"
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="w-full mt-2 cursor-pointer accent-blue-600"
            />
          </div>
        </div>

        {/* Live Visual Terminal Preview */}
        <div className="pt-2 max-w-2xl space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              Візуальний приклад зовнішнього вигляду
            </span>
            <div className="flex items-center gap-1.5">
              {themeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTerminalTheme(opt.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                    terminalTheme === opt.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold shadow-xs ring-1 ring-blue-500/30'
                      : 'border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/15 dark:border-white/20 inline-block shrink-0"
                    style={{ backgroundColor: opt.bg }}
                  />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Window Mockup */}
          <div
            className="rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700/80 shadow-md font-mono transition-colors duration-200"
            style={{
              backgroundColor: currentTerminalColors.background,
              color: currentTerminalColors.foreground,
            }}
          >
            {/* Window title bar */}
            <div
              className="px-3.5 py-2 flex items-center justify-between border-b"
              style={{
                borderColor: `${currentTerminalColors.foreground}18`,
                backgroundColor: `${currentTerminalColors.background}ee`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
              </div>
              <div
                className="text-[11px] font-sans font-medium tracking-wide opacity-70"
                style={{ color: currentTerminalColors.foreground }}
              >
                ubuntu@vmaster-node: ~ (bash)
              </div>
              <div className="w-12 text-right text-[10px] opacity-40 font-mono">
                {fontSize}px
              </div>
            </div>

            {/* Terminal Body */}
            <div
              className="p-4 space-y-1.5 select-text"
              style={{
                fontSize: `${Math.max(11, Math.min(18, fontSize))}px`,
                lineHeight: 1.45,
              }}
            >
              <div>
                <span style={{ color: currentTerminalColors.green, fontWeight: 'bold' }}>ubuntu@vmaster-node</span>
                <span style={{ color: currentTerminalColors.foreground }}>:</span>
                <span style={{ color: currentTerminalColors.blue }}>~</span>
                <span style={{ color: currentTerminalColors.foreground }}>$ </span>
                <span style={{ color: currentTerminalColors.foreground }}>uptime</span>
              </div>
              <div style={{ color: currentTerminalColors.brightBlack || currentTerminalColors.white, opacity: 0.85 }}>
                {' '}13:30:24 up 42 days, 3 users, load average: 0.12, 0.08, 0.05
              </div>
              <div>
                <span style={{ color: currentTerminalColors.green, fontWeight: 'bold' }}>ubuntu@vmaster-node</span>
                <span style={{ color: currentTerminalColors.foreground }}>:</span>
                <span style={{ color: currentTerminalColors.blue }}>~</span>
                <span style={{ color: currentTerminalColors.foreground }}>$ </span>
                <span style={{ color: currentTerminalColors.foreground }}>systemctl status nginx --no-pager</span>
              </div>
              <div>
                <span style={{ color: currentTerminalColors.green }}>●</span>
                <span style={{ color: currentTerminalColors.foreground }}> nginx.service - A high performance web server</span>
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: currentTerminalColors.green, fontWeight: 'bold' }}>ubuntu@vmaster-node</span>
                <span style={{ color: currentTerminalColors.foreground }}>:</span>
                <span style={{ color: currentTerminalColors.blue }}>~</span>
                <span style={{ color: currentTerminalColors.foreground }}>$ </span>
                <span
                  className="inline-block w-2 h-3.5 align-middle animate-pulse"
                  style={{ backgroundColor: currentTerminalColors.cursor }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proxmox Servers Management */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" />
            <span>Підключені сервери Proxmox VE</span>
          </h2>
          <button
            onClick={() => {
              setEditingServer(null);
              setIsServerModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Додати сервер</span>
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="text-xs text-zinc-400 py-3">Не додано жодного сервера Proxmox</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            {servers.map((srv) => (
              <div key={srv.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{srv.name}</div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    https://{srv.host}:{srv.port} ({srv.authType.toUpperCase()})
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingServer(srv);
                      setIsServerModalOpen(true);
                    }}
                    title="Редагувати"
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteServer(srv.id)}
                    title="Видалити"
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SSH Profiles Management */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-500" />
            <span>Збережені SSH профілі Ubuntu</span>
          </h2>
          <button
            onClick={() => {
              setEditingSSHProfile(null);
              setIsSSHModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Додати профіль</span>
          </button>
        </div>

        {sshProfiles.length === 0 ? (
          <div className="text-xs text-zinc-400 py-3">Не налаштовано жодного SSH профілю</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            {sshProfiles.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    {p.username}@{p.host}:{p.port || 22} ({p.authType === 'privateKey' ? 'SSH Key' : 'Password'})
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingSSHProfile(p);
                      setIsSSHModalOpen(true);
                    }}
                    title="Редагувати"
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteSSHProfile(p.id)}
                    title="Видалити"
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ServerModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSave={saveServer}
        initialServer={editingServer}
      />

      <SSHProfileModal
        isOpen={isSSHModalOpen}
        onClose={() => setIsSSHModalOpen(false)}
        onSave={saveSSHProfile}
        initialProfile={editingSSHProfile}
        allProfiles={sshProfiles}
      />
    </div>
  );
};
