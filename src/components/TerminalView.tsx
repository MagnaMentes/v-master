import React, { useState } from 'react';
import {
  Terminal,
  Plus,
  X,
  Columns2,
  Rows2,
  Code2,
  Play,
  Search,
  ArrowLeft,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { TerminalInstance } from './TerminalInstance';
import { SSHProfileModal } from './SSHProfileModal';
import type { TerminalTheme, SSHProfile } from '../types';

export const TerminalView: React.FC = () => {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    setActivePaneId,
    closeTab,
    splitPane,
    snippets,
    sendSnippetToTerminal,
    vms,
    selectedVM,
    setActiveView,
    openTerminalForVM,
    saveSSHProfile,
  } = useApp();

  const { terminalTheme, setTerminalTheme } = useTheme();

  const [isSnippetsDrawerOpen, setIsSnippetsDrawerOpen] = useState(false);
  const [snippetSearch, setSnippetSearch] = useState('');
  const [isNewTabMenuOpen, setIsNewTabMenuOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SSHProfile | null>(null);
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Terminal tab shortcuts (Cmd+T, Cmd+W, Cmd+1..9)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        if (activeTab) {
          e.preventDefault();
          closeTab(activeTab.id);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setIsNewTabMenuOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        if (tabs[index]) {
          e.preventDefault();
          setActiveTabId(tabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, tabs, closeTab, setActiveTabId]);

  const filteredSnippets = snippets.filter(
    (s) =>
      s.title.toLowerCase().includes(snippetSearch.toLowerCase()) ||
      s.command.toLowerCase().includes(snippetSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(snippetSearch.toLowerCase())
  );

  const themeOptions: { id: TerminalTheme; label: string }[] = [
    { id: 'dark', label: 'Dark Default' },
    { id: 'light', label: 'Light Clean' },
    { id: 'dracula', label: 'Dracula' },
    { id: 'monokai', label: 'Monokai' },
  ];

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 select-none">
        <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
          <Terminal className="w-7 h-7" />
        </div>
        <h2 className="text-base font-semibold mb-1">Немає відкритих терміналів</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-5">
          Виберіть активну віртуальну машину зі списку ліворуч або натисніть нижче, щоб відкрити термінал Ubuntu.
        </p>

        {vms.filter((v) => v.status === 'running').length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2 max-w-md mb-6">
            {vms
              .filter((v) => v.status === 'running')
              .sort((a, b) => a.vmid - b.vmid)
              .map((vm) => (
                <button
                  key={vm.vmid}
                  onClick={() => openTerminalForVM(vm, 'ssh')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 text-xs font-medium transition-colors shadow-xs"
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-500" />
                  <span>{vm.name}</span>
                  <span className="text-[10px] text-zinc-400">#{vm.vmid}</span>
                </button>
              ))}
          </div>
        ) : (
          <div className="text-xs text-zinc-400 mb-6">
            Запустіть віртуальну машину в огляді кластера для підключення
          </div>
        )}

        <button
          onClick={() => {
            if (selectedVM) {
              setActiveView('vm-detail');
            } else {
              setActiveView('dashboard');
            }
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{selectedVM ? `Повернутися до ${selectedVM.name}` : 'Повернутися до огляду'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 dark:bg-[#121214] overflow-hidden select-none">
      {/* Tabs Header & Controls Bar */}
      <div className="h-10 px-2 flex items-center justify-between bg-[#ECECEC] dark:bg-[#1E1E22] border-b border-zinc-300 dark:border-zinc-800 text-xs">
        {/* Tabs Scroller */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 h-full py-1">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                title={`Вкладка ${idx + 1} (⌘${idx + 1})`}
                className={`group flex items-center gap-2 px-3 h-full rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-[#28282D] text-blue-600 dark:text-blue-400 font-medium shadow-xs border border-zinc-300 dark:border-zinc-700'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[140px]">{tab.title}</span>
                {idx < 9 && (
                  <span className="text-[10px] text-zinc-400 group-hover:hidden select-none font-mono">
                    ⌘{idx + 1}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  title="Закрити вкладку (⌘W)"
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-opacity"
                >
                  <X className="w-3 h-3 text-zinc-500" />
                </button>
              </div>
            );
          })}

          {/* New Tab Button */}
          <div className="relative">
            <button
              onClick={() => setIsNewTabMenuOpen(!isNewTabMenuOpen)}
              title="Відкрити термінал для іншої ВМ"
              className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>

            {isNewTabMenuOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 w-48 bg-white dark:bg-[#28282D] border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 text-xs">
                <div className="px-3 py-1 font-semibold text-[10px] text-zinc-400 uppercase tracking-wider">
                  Виберіть ВМ
                </div>
                {vms
                  .filter((v) => v.status === 'running')
                  .sort((a, b) => a.vmid - b.vmid)
                  .map((vm) => (
                    <button
                      key={vm.vmid}
                      onClick={() => {
                        openTerminalForVM(vm, 'ssh');
                        setIsNewTabMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 flex items-center justify-between"
                    >
                      <span className="truncate">{vm.name}</span>
                      <span className="text-[10px] text-zinc-400">#{vm.vmid}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Layout & Tool Controls */}
        <div className="flex items-center gap-1.5 pl-2 shrink-0">
          {/* Split Buttons */}
          {activeTab && (
            <div className="flex items-center p-0.5 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
              <button
                onClick={() => splitPane(activeTab.id, 'split-vertical')}
                title="Розділити термінал по вертикалі"
                className="p-1 rounded hover:bg-white dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => splitPane(activeTab.id, 'split-horizontal')}
                title="Розділити термінал по горизонталі"
                className="p-1 rounded hover:bg-white dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
              >
                <Rows2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Terminal Theme Dropdown */}
          <div className="flex items-center gap-1">
            <select
              value={terminalTheme}
              onChange={(e) => setTerminalTheme(e.target.value as TerminalTheme)}
              title="Тема термінала"
              className="px-2 py-1 rounded-md bg-white dark:bg-[#28282D] border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs focus:outline-hidden"
            >
              {themeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Snippets Drawer Toggle */}
          <button
            onClick={() => setIsSnippetsDrawerOpen(!isSnippetsDrawerOpen)}
            title="Бібліотека швидких команд"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              isSnippetsDrawerOpen
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-[#28282D] border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Снипети</span>
          </button>

          {/* Close Terminal & Return to VM Button */}
          {activeTab && (
            <button
              onClick={() => closeTab(activeTab.id)}
              title="Закрити термінал та повернутися до віртуальної машини"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#28282D] text-zinc-700 dark:text-zinc-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:border-red-800 dark:hover:text-red-400 text-xs font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Закрити термінал</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Terminal Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Panes Container */}
        {activeTab && (
          <div
            className={`flex-1 grid h-full w-full gap-1 p-1 bg-black ${
              activeTab.layout === 'split-vertical'
                ? 'grid-cols-2 grid-rows-1'
                : activeTab.layout === 'split-horizontal'
                ? 'grid-cols-1 grid-rows-2'
                : activeTab.layout === 'grid-2x2'
                ? 'grid-cols-2 grid-rows-2'
                : 'grid-cols-1 grid-rows-1'
            }`}
          >
            {activeTab.panes.map((pane) => (
              <TerminalInstance
                key={pane.sessionId}
                pane={pane}
                isActive={activeTab.activePaneId === pane.id}
                onFocus={() => {
                  setActivePaneId(activeTab.id, pane.id);
                }}
                onOpenSSHModal={(prof) => {
                  setEditingProfile(prof);
                  setIsSSHModalOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {/* Quick Snippets Drawer (Flyout) */}
        {isSnippetsDrawerOpen && (
          <div className="w-72 h-full bg-white dark:bg-[#202024] border-l border-zinc-200 dark:border-zinc-800 flex flex-col shadow-2xl z-20 transition-all">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-xs text-zinc-800 dark:text-zinc-200">
                <Code2 className="w-4 h-4 text-blue-500" />
                <span>Швидкі команди Ubuntu</span>
              </div>
              <button
                onClick={() => setIsSnippetsDrawerOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  value={snippetSearch}
                  onChange={(e) => setSnippetSearch(e.target.value)}
                  placeholder="Пошук команди..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Snippets List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredSnippets.map((snip) => (
                <div
                  key={snip.id}
                  className="group p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-zinc-200 dark:border-zinc-750 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                      {snip.title}
                    </span>
                    <button
                      onClick={() => sendSnippetToTerminal(snip.command)}
                      title="Виконати в активному терміналі"
                      className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                    {snip.description}
                  </p>
                  <div className="mt-1.5 p-1 rounded bg-zinc-100 dark:bg-black/40 border border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-700 dark:text-zinc-300 truncate">
                    {snip.command}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SSH Profile Modal */}
      {isSSHModalOpen && editingProfile && (
        <SSHProfileModal
          isOpen={isSSHModalOpen}
          onClose={() => {
            setIsSSHModalOpen(false);
            setEditingProfile(null);
          }}
          onSave={async (prof) => {
            await saveSSHProfile(prof);
            setIsSSHModalOpen(false);
            setEditingProfile(null);
          }}
          initialProfile={editingProfile}
          defaultVmid={editingProfile.vmid}
          defaultHost={editingProfile.host}
        />
      )}
    </div>
  );
};
