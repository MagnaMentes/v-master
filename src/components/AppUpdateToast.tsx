import React, { useEffect, useState } from 'react';
import { DownloadCloud, CheckCircle2, RefreshCw, X } from 'lucide-react';
import type { AppUpdateInfo, AppUpdateProgress } from '../types';

export const AppUpdateToast: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (!window.api?.appUpdate) return;

    const unAvailable = window.api.appUpdate.onAvailable((info) => {
      setUpdateInfo(info);
      setIsDismissed(false);
    });

    const unProgress = window.api.appUpdate.onProgress((prog) => {
      setProgress(prog);
    });

    const unDownloaded = window.api.appUpdate.onDownloaded((info) => {
      setUpdateInfo(info);
      setIsDownloaded(true);
      setIsDismissed(false);
    });

    return () => {
      unAvailable();
      unProgress();
      unDownloaded();
    };
  }, []);

  if (isDismissed || !updateInfo) return null;

  const handleInstallNow = async () => {
    setIsInstalling(true);
    try {
      await window.api.appUpdate.installNow();
    } catch (err) {
      console.error('Failed to trigger install:', err);
      setIsInstalling(false);
    }
  };

  const percent = progress?.percent ? Math.round(progress.percent) : null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white/95 dark:bg-[#202024]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-4 text-zinc-900 dark:text-zinc-100 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isDownloaded
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            }`}>
              {isDownloaded ? <CheckCircle2 className="w-5 h-5" /> : <DownloadCloud className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Оновлення програми
              </h4>
              <p className="text-sm font-medium">
                {isDownloaded
                  ? `Версія v${updateInfo.version} готова!`
                  : `Завантажується v${updateInfo.version}...`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            aria-label="Закрити"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isDownloaded && percent !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Завантаження</span>
              <span>{percent}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
          {isDownloaded ? (
            <>
              <button
                onClick={handleInstallNow}
                disabled={isInstalling}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isInstalling ? 'animate-spin' : ''}`} />
                {isInstalling ? 'Перезапуск...' : 'Перезапустити зараз'}
              </button>
              <button
                onClick={() => setIsDismissed(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Пізніше
              </button>
            </>
          ) : (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Оновлення завантажиться автоматично у фоновому режимі.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
