import React from 'react';
import { Sun, Moon, Monitor, Server, RefreshCw, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';

export const TitleBar: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { activeServer, refreshClusterData, isLoading, error } = useApp();

  return (
    <header className="titlebar-drag-region h-11 w-full flex items-center justify-between px-4 border-b select-none transition-colors duration-200 bg-[#ECECEC] dark:bg-[#1E1E22] border-[#D4D4D4] dark:border-[#2E2E32]">
      {/* Traffic Light Spacing (macOS) */}
      <div className="flex items-center gap-2 pl-16">
        <span className="font-semibold text-xs tracking-wide text-zinc-700 dark:text-zinc-300">
          V-Master
        </span>
        <span className="text-zinc-400 dark:text-zinc-600 text-xs">/</span>
        {activeServer ? (
          <div className="flex items-center gap-1.5 text-xs text-zinc-800 dark:text-zinc-200">
            <Server className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-medium truncate max-w-[200px]">{activeServer.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              {activeServer.host}
            </span>
          </div>
        ) : (
          <span className="text-xs text-zinc-500">Сервер не обрано</span>
        )}
      </div>

      {/* Center status message if any */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-900">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[320px]">{error}</span>
        </div>
      )}

      {/* Right controls: Refresh & Theme Switcher */}
      <div className="titlebar-no-drag flex items-center gap-2">
        {activeServer && (
          <button
            onClick={() => refreshClusterData()}
            disabled={isLoading}
            title="Оновити дані кластера"
            className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        )}

        <div className="flex items-center p-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
          <button
            onClick={() => setTheme('light')}
            title="Світла тема"
            className={`p-1 rounded ${
              theme === 'light'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTheme('dark')}
            title="Темна тема"
            className={`p-1 rounded ${
              theme === 'dark'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTheme('system')}
            title="Тема системи macOS"
            className={`p-1 rounded ${
              theme === 'system'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
