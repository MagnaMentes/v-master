import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  Folder,
  File,
  ArrowUp,
  Download,
  Upload,
  Trash2,
  FolderPlus,
  RefreshCw,
  Loader2,
  Key,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileCode,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { SFTPFileEditorModal } from './SFTPFileEditorModal';
import type { SFTPItem, SSHProfile } from '../types';

const PROTECTED_SYSTEM_PATHS = [
  '/',
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/home',
  '/lib',
  '/lib64',
  '/media',
  '/mnt',
  '/opt',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/srv',
  '/sys',
  '/usr',
  '/var',
];

export const SFTPView: React.FC = () => {
  const { sshProfiles, selectedVM } = useApp();

  const getInitialPath = (profile: SSHProfile | null) => {
    if (!profile) return '/';
    if (profile.username === 'root') return '/root';
    if (profile.username && profile.username !== 'ubuntu') return `/home/${profile.username}`;
    return '.';
  };

  const [selectedProfile, setSelectedProfile] = useState<SSHProfile | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [items, setItems] = useState<SFTPItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New folder state
  const [isMkdirOpen, setIsMkdirOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // File editor modal state
  const [editingFile, setEditingFile] = useState<{ path: string; name: string } | null>(null);

  // Safe delete modal state
  const [deleteModalItem, setDeleteModalItem] = useState<SFTPItem | null>(null);
  const [deleteInputText, setDeleteInputText] = useState('');

  // Drag-and-drop upload state
  const [isDragging, setIsDragging] = useState(false);

  // Initial select profile from selectedVM or first available
  useEffect(() => {
    if (selectedVM) {
      const match = sshProfiles.find((p) => p.vmid === selectedVM.vmid);
      if (match) {
        setSelectedProfile(match);
        setCurrentPath(getInitialPath(match));
        return;
      }
    }
    if (sshProfiles.length > 0 && !selectedProfile) {
      setSelectedProfile(sshProfiles[0]);
      setCurrentPath(getInitialPath(sshProfiles[0]));
    }
  }, [selectedVM, sshProfiles, selectedProfile]);

  const loadDirectory = useCallback(async (dirPath: string) => {
    if (!selectedProfile) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await window.api.sftp.list(selectedProfile, dirPath);
      list.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      setItems(list);
      setCurrentPath(dirPath);
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження каталогу');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProfile]);

  useEffect(() => {
    if (selectedProfile) {
      loadDirectory(currentPath);
    } else {
      setItems([]);
    }
  }, [selectedProfile, loadDirectory]);

  const handleNavigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    loadDirectory(upPath === '' ? '/' : upPath);
  };

  const handleOpenItem = (item: SFTPItem) => {
    const itemPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    if (item.type === 'directory') {
      loadDirectory(itemPath);
    } else {
      setEditingFile({ path: itemPath, name: item.name });
    }
  };

  const handleUploadFile = async () => {
    if (!selectedProfile) return;
    try {
      const localFile = await window.api.sftp.selectLocalFile();
      if (!localFile) return;

      const fileName = localFile.split('/').pop() || 'uploaded-file';
      const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

      setIsLoading(true);
      const res = await window.api.sftp.upload(selectedProfile, localFile, remotePath);
      if (res.success) {
        setSuccessMsg(`Файл ${fileName} успішно вивантажено на сервер`);
        setTimeout(() => setSuccessMsg(null), 3000);
        await loadDirectory(currentPath);
      } else {
        setError(res.error || 'Помилка вивантаження файлу');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!selectedProfile) return;
    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    setIsLoading(true);
    let uploadedCount = 0;
    try {
      for (let i = 0; i < droppedFiles.length; i++) {
        const file = droppedFiles[i];
        // In Electron, File objects have a 'path' property pointing to absolute local filesystem path
        const localPath = (file as any).path;
        if (!localPath) continue;

        const fileName = file.name;
        const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

        const res = await window.api.sftp.upload(selectedProfile, localPath, remotePath);
        if (res.success) {
          uploadedCount++;
        }
      }

      if (uploadedCount > 0) {
        setSuccessMsg(`Успішно завантажено файлів: ${uploadedCount}`);
        setTimeout(() => setSuccessMsg(null), 3000);
        await loadDirectory(currentPath);
      }
    } catch (err: any) {
      setError(`Помилка перетягування файлів: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDownloadFile = async (item: SFTPItem) => {
    if (!selectedProfile) return;
    try {
      const localSavePath = await window.api.sftp.selectLocalSavePath(item.name);
      if (!localSavePath) return;

      const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
      setIsLoading(true);
      const res = await window.api.sftp.download(selectedProfile, remotePath, localSavePath);
      if (res.success) {
        setSuccessMsg(`Файл ${item.name} збережено на ваш Mac`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(res.error || 'Помилка завантаження файлу');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = (item: SFTPItem) => {
    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const normalized = remotePath.replace(/\/+$/, '') || '/';
    if (PROTECTED_SYSTEM_PATHS.includes(normalized)) {
      setError(`Видалення системного каталогу "${remotePath}" суворо заборонено.`);
      return;
    }
    setDeleteInputText('');
    setDeleteModalItem(item);
  };

  const confirmDelete = async () => {
    if (!selectedProfile || !deleteModalItem) return;
    const item = deleteModalItem;
    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    setDeleteModalItem(null);
    setDeleteInputText('');
    setIsLoading(true);
    try {
      const res = await window.api.sftp.delete(selectedProfile, remotePath, item.type === 'directory');
      if (res.success) {
        await loadDirectory(currentPath);
      } else {
        setError(res.error || 'Помилка видалення');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile || !newFolderName) return;
    const remotePath = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;

    setIsLoading(true);
    try {
      const res = await window.api.sftp.mkdir(selectedProfile, remotePath);
      if (res.success) {
        setIsMkdirOpen(false);
        setNewFolderName('');
        await loadDirectory(currentPath);
      } else {
        setError(res.error || 'Помилка створення папки');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-[#18181B] text-zinc-800 dark:text-zinc-100 overflow-hidden select-none">
      {/* Top Header & Target Host Selector */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#252528]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold">SFTP Файловий браузер</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Швидкий обмін файлами з віртуальними машинами Ubuntu
            </p>
          </div>
        </div>

        {/* Profile Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">ВМ / Профіль:</span>
          {sshProfiles.length > 0 ? (
            <select
              value={selectedProfile?.id || ''}
              onChange={(e) => {
                const found = sshProfiles.find((p) => p.id === e.target.value);
                if (found) setSelectedProfile(found);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-medium focus:outline-hidden"
            >
              {sshProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.username}@{p.host})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              <Key className="w-3.5 h-3.5" />
              <span>Немає налаштованих SSH профілів</span>
            </span>
          )}
        </div>
      </div>

      {/* Path Bar & Actions */}
      <div className="px-4 py-2.5 bg-zinc-100 dark:bg-[#202024] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
        {/* Navigation & Breadcrumb */}
        <div className="flex items-center gap-2 flex-1 mr-4 truncate">
          <button
            onClick={handleNavigateUp}
            disabled={currentPath === '/' || !selectedProfile}
            title="Перейти вгору"
            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <div className="px-3 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate flex-1">
            {currentPath}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading || !selectedProfile}
            title="Оновити список"
            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
          <button
            onClick={() => setIsMkdirOpen(true)}
            disabled={!selectedProfile}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors font-medium disabled:opacity-50"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
            <span>Папка</span>
          </button>
          <button
            onClick={handleUploadFile}
            disabled={isLoading || !selectedProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Вивантажити на ВМ</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border-b border-red-200 dark:border-red-900">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 border-b border-emerald-200 dark:border-emerald-900">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Files List Table */}
      <div
        className={`flex-1 overflow-y-auto relative transition-colors ${
          isDragging ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-30 bg-blue-500/10 dark:bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-xl m-2 flex flex-col items-center justify-center gap-3 backdrop-blur-2xs pointer-events-none">
            <Upload className="w-10 h-10 text-blue-500 animate-bounce" />
            <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
              Скиньте файли сюди для вивантаження
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Файли будуть завантажені у поточну директорію: {currentPath}
            </div>
          </div>
        )}

        {!selectedProfile ? (
          <div className="p-8 text-center text-xs text-zinc-400">
            Оберіть або налаштуйте SSH профіль у вкладці Налаштування або на сторінці ВМ
          </div>
        ) : isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-xs text-zinc-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span>Завантаження вмісту папки...</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-100 dark:bg-[#202024] border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-medium">
              <tr>
                <th className="px-4 py-2.5">Назва файлу / папки</th>
                <th className="px-4 py-2.5">Розмір</th>
                <th className="px-4 py-2.5">Права</th>
                <th className="px-4 py-2.5">Дата зміни</th>
                <th className="px-4 py-2.5 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <tr
                  key={item.name}
                  onDoubleClick={() => handleOpenItem(item)}
                  className="hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 flex items-center gap-2.5">
                    {item.type === 'directory' ? (
                      <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-blue-500 shrink-0" />
                    )}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {item.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 font-mono text-[11px]">
                    {item.type === 'directory' ? '—' : formatBytes(item.size)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">
                    {item.permissions || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-[11px]">
                    {item.modifyTime ? new Date(item.modifyTime * 1000).toLocaleString('uk-UA') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div
                      className="inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.type !== 'directory' && (
                        <>
                          <button
                            onClick={() => {
                              const itemPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
                              setEditingFile({ path: itemPath, name: item.name });
                            }}
                            title="Редагувати файл на сервері"
                            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-amber-600 dark:text-amber-400 transition-colors"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownloadFile(item)}
                            title="Зберегти на Mac"
                            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-blue-400 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteItem(item)}
                        title="Видалити"
                        className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SFTP File Editor Modal */}
      {editingFile && selectedProfile && (
        <SFTPFileEditorModal
          isOpen={Boolean(editingFile)}
          onClose={() => setEditingFile(null)}
          profile={selectedProfile}
          remoteFilePath={editingFile.path}
          fileName={editingFile.name}
        />
      )}

      {/* New Folder Modal */}
      {isMkdirOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white dark:bg-[#252528] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-5 text-zinc-800 dark:text-zinc-100 text-xs">
            <h3 className="font-bold text-sm mb-3">Створити нову директорію</h3>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Назва папки</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="my_folder"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMkdirOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  Створити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Delete Modal */}
      {deleteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate">
          <div className="w-full max-w-sm bg-white dark:bg-[#202023] rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-5 flex flex-col gap-4 modal-animate text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {deleteModalItem.type === 'directory' ? 'Видалення директорії' : 'Видалення файлу'}
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[200px]">
                  {deleteModalItem.name}
                </p>
              </div>
            </div>

            <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {deleteModalItem.type === 'directory'
                ? `Ви збираєтесь безповоротно видалити директорію "${deleteModalItem.name}" та весь її внутрішній вміст.`
                : `Ви збираєтесь видалити файл "${deleteModalItem.name}". Цю дію неможливо скасувати.`}
            </p>

            {deleteModalItem.type === 'directory' && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Введіть назву <strong className="font-mono text-zinc-900 dark:text-zinc-100">{deleteModalItem.name}</strong> для підтвердження:
                </label>
                <input
                  type="text"
                  value={deleteInputText}
                  onChange={(e) => setDeleteInputText(e.target.value)}
                  placeholder={deleteModalItem.name}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700/60">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalItem(null);
                  setDeleteInputText('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={Boolean(deleteModalItem.type === 'directory' && deleteInputText.trim() !== deleteModalItem.name)}
                onClick={confirmDelete}
                className="px-4 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
};
