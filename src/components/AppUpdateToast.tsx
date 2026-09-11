import React, { useEffect, useState } from 'react';
import { DownloadCloud, CheckCircle2, RefreshCw, Sparkles, X } from 'lucide-react';
import type { AppUpdateInfo, AppUpdateProgress } from '../types';

export const AppUpdateToast: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Post-update announcement state
  const [postUpdateNotes, setPostUpdateNotes] = useState<string | null>(null);
  const [showPostUpdateToast, setShowPostUpdateToast] = useState(false);

  useEffect(() => {
    // Check if app was just updated to a newer version
    const lastVersion = localStorage.getItem('vmaster_last_version');
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.12';

    if (lastVersion && lastVersion !== currentVersion) {
      const cachedNotes = localStorage.getItem(`vmaster_notes_${currentVersion}`);
      if (cachedNotes) {
        setPostUpdateNotes(cachedNotes);
        setShowPostUpdateToast(true);
      } else if (window.api?.appUpdate?.getReleaseNotes) {
        window.api.appUpdate.getReleaseNotes(currentVersion).then((notes) => {
          if (notes) {
            setPostUpdateNotes(notes);
            setShowPostUpdateToast(true);
          }
        });
      }
    }
    localStorage.setItem('vmaster_last_version', currentVersion);

    if (!window.api?.appUpdate) return;

    const unAvailable = window.api.appUpdate.onAvailable((info) => {
      setUpdateInfo(info);
      setIsDismissed(false);
      setShowPostUpdateToast(false);
      if (info.releaseNotes) {
        const text = typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n: any) => (typeof n === 'string' ? n : n.note || '')).join('\n')
          : '';
        if (text) {
          localStorage.setItem(`vmaster_notes_${info.version}`, text);
        }
      }
    });

    const unProgress = window.api.appUpdate.onProgress((prog) => {
      setProgress(prog);
    });

    const unDownloaded = window.api.appUpdate.onDownloaded((info) => {
      setUpdateInfo(info);
      setIsDownloaded(true);
      setIsDismissed(false);
      setShowPostUpdateToast(false);
      if (info.releaseNotes) {
        const text = typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n: any) => (typeof n === 'string' ? n : n.note || '')).join('\n')
          : '';
        if (text) {
          localStorage.setItem(`vmaster_notes_${info.version}`, text);
        }
      }
    });

    return () => {
      unAvailable();
      unProgress();
      unDownloaded();
    };
  }, []);

  const handleDismissPostUpdate = () => {
    setShowPostUpdateToast(false);
  };

  const parseCleanLines = (notesText: string) => {
    return notesText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .slice(0, 6);
  };

  const renderReleaseNotes = (notesSource?: any) => {
    const raw = notesSource || updateInfo?.releaseNotes;
    if (!raw) return null;

    let notesText = '';
    if (typeof raw === 'string') {
      notesText = raw;
    } else if (Array.isArray(raw)) {
      notesText = raw
        .map((n: any) => (typeof n === 'string' ? n : n.note || ''))
        .filter(Boolean)
        .join('\n');
    }

    if (!notesText.trim()) return null;
    const cleanLines = parseCleanLines(notesText);
    if (cleanLines.length === 0) return null;

    return (
      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-2.5 text-[11px] border border-zinc-200/70 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-300">
        <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1 flex items-center gap-1.5">
          <span>Що нового:</span>
        </div>
        <ul className="space-y-1 pl-1">
          {cleanLines.map((line, idx) => (
            <li key={idx} className="flex items-start gap-1.5 leading-tight">
              <span className="text-indigo-500 dark:text-indigo-400 mt-0.5">•</span>
              <span className="truncate">{line.replace(/^-\s*/, '')}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

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

  // 1. Post-update "What's New" celebratory toast
  if (showPostUpdateToast && postUpdateNotes && !updateInfo) {
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.12';
    return (
      <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="bg-white/95 dark:bg-[#202024]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-4 text-zinc-900 dark:text-zinc-100 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Успішно оновлено!
                </h4>
                <p className="text-sm font-medium">
                  V-Master v{currentVersion}
                </p>
              </div>
            </div>
            <button
              onClick={handleDismissPostUpdate}
              aria-label="Закрити"
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {renderReleaseNotes(postUpdateNotes)}

          <div className="flex justify-end pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
            <button
              onClick={handleDismissPostUpdate}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pre-update (downloading or ready to restart) toast
  if (isDismissed || !updateInfo) return null;

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

        {renderReleaseNotes()}

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
