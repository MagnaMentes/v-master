import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Radio,
} from 'lucide-react';
import type { SSHProfile } from '../types';

interface SFTPFileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: SSHProfile;
  remoteFilePath: string;
  fileName: string;
}

export const SFTPFileEditorModal: React.FC<SFTPFileEditorModalProps> = ({
  isOpen,
  onClose,
  profile,
  remoteFilePath,
  fileName,
}) => {
  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLiveTail, setIsLiveTail] = useState<boolean>(false);

  const isDirty = content !== initialContent;

  const loadFile = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    if (!silent) setSuccessMsg(null);
    try {
      if (window.api?.sftp?.readFile) {
        const res = await window.api.sftp.readFile(profile, remoteFilePath);
        if (res.success && typeof res.content === 'string') {
          setContent(res.content);
          if (!silent) setInitialContent(res.content);
        } else if (!silent) {
          setError(res.error || 'Не вдалося прочитати вміст файлу');
        }
      }
    } catch (err: any) {
      if (!silent) setError(err.message || 'Помилка читання файлу');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadFile(false);
  }, [isOpen, profile, remoteFilePath]);

  useEffect(() => {
    if (!isOpen || !isLiveTail) return;
    const interval = setInterval(() => {
      loadFile(true);
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpen, isLiveTail, profile, remoteFilePath]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (window.api?.sftp?.writeFile) {
        const res = await window.api.sftp.writeFile(profile, remoteFilePath, content);
        if (res.success) {
          setInitialContent(content);
          setSuccessMsg('Файл успішно збережено на сервері!');
          setTimeout(() => setSuccessMsg(null), 3000);
        } else {
          setError(res.error || 'Не вдалося зберегти файл на сервері');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Помилка збереження файлу');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      if (confirm('У вас є незбережені зміни. Ви дійсно бажаєте закрити редактор?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Keyboard shortcut Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, isSaving]);

  if (!isOpen) return null;

  const linesCount = content.split('\n').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#1E1E22] w-full max-w-4xl h-[80vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#25252A]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold truncate">{fileName}</h3>
                {isDirty && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" title="Незбережені зміни" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 font-mono truncate">{remoteFilePath}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {successMsg && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Збережено</span>
              </span>
            )}
            {error && (
              <span className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium truncate max-w-[200px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{error}</span>
              </span>
            )}

            <button
              onClick={() => setIsLiveTail(!isLiveTail)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                isLiveTail
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
              title={isLiveTail ? 'Вимкнути автооновлення файлу' : 'Увімкнути автооновлення файлу (Live Tail)'}
            >
              <Radio className={`w-3.5 h-3.5 ${isLiveTail ? 'animate-pulse text-emerald-500' : ''}`} />
              <span>{isLiveTail ? 'Live Tail (Увімкнено)' : 'Live Tail'}</span>
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty || isLiveTail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? 'Збереження...' : 'Зберегти (⌘S)'}</span>
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code Editor Body */}
        <div className="flex-1 relative bg-zinc-950 text-zinc-200 font-mono text-xs overflow-hidden flex">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-zinc-500">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
              <span>Завантаження вмісту файлу...</span>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="flex-1 p-4 bg-transparent outline-hidden resize-none leading-relaxed font-mono select-text"
            />
          )}
        </div>

        {/* Footer Info */}
        <div className="px-5 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#25252A] flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-3">
            <span>Рядків: {linesCount}</span>
            <span>Кодування: UTF-8</span>
          </div>
          <span>Натисніть ⌘S для швидкого збереження</span>
        </div>
      </div>
    </div>
  );
};
