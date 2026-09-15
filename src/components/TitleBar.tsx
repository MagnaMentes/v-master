import React from 'react';
import { Sun, Moon, Monitor, Server, RefreshCw, AlertCircle, Globe } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../contexts/LanguageContext';

export const TitleBar: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const { activeServer, refreshClusterData, isLoading, error } = useApp();
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

  return (
    <header className="titlebar-drag-region h-11 w-full flex items-center justify-between px-4 border-b select-none transition-colors duration-200 bg-[#ECECEC] dark:bg-[#1E1E22] border-[#D4D4D4] dark:border-[#2E2E32]">
      {/* Traffic Light Spacing on macOS */}
      <div className={`flex items-center gap-2 ${isMac ? 'pl-16' : 'pl-1'}`}>
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
          <span className="text-xs text-zinc-500">{t('sidebar.noServers')}</span>
        )}
      </div>

      {/* Center status message if any */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-900">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[320px]">{error}</span>
        </div>
      )}

      {/* Right controls: Refresh, Language & Theme Switcher */}
      <div className="titlebar-no-drag flex items-center gap-2">
        {activeServer && (
          <button
            onClick={() => refreshClusterData()}
            disabled={isLoading}
            title={t('titleBar.refreshCluster')}
            className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        )}

        {/* Language Switcher */}
        <div className="flex items-center p-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-semibold">
          <div className="px-1 text-zinc-400 dark:text-zinc-500">
            <Globe className="w-3 h-3" />
          </div>
          <button
            onClick={() => setLanguage('uk')}
            title="Українська мова"
            className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
              language === 'uk'
                ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            UA
          </button>
          <button
            onClick={() => setLanguage('en')}
            title="English language"
            className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
              language === 'en'
                ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            EN
          </button>
        </div>

        {/* Theme Switcher */}
        <div className="flex items-center p-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
          <button
            onClick={() => setTheme('light')}
            title={t('titleBar.themeLight')}
            className={`p-1 rounded cursor-pointer ${
              theme === 'light'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTheme('dark')}
            title={t('titleBar.themeDark')}
            className={`p-1 rounded cursor-pointer ${
              theme === 'dark'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                : 'hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTheme('system')}
            title={t('titleBar.themeSystem')}
            className={`p-1 rounded cursor-pointer ${
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
