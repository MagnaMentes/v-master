import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowUpCircle,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Download,
  Lock,
  KeyRound,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { ProxmoxAPTUpdate, SSHProfile } from '../types';

interface NodeUpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
  onOpenTerminal?: () => void;
}

export const NodeUpdatesModal: React.FC<NodeUpdatesModalProps> = ({
  isOpen,
  onClose,
  nodeName,
  onOpenTerminal,
}) => {
  const { activeServer, sshProfiles } = useApp();
  const [updates, setUpdates] = useState<ProxmoxAPTUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshingRepo, setRefreshingRepo] = useState(false);
  const [installingPkg, setInstallingPkg] = useState<string | null>(null);
  const [installingAllSafe, setInstallingAllSafe] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [hostPassword, setHostPassword] = useState<string>('');
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    callback: (password: string) => Promise<void>;
  }>({ isOpen: false, callback: async () => {} });
  const [tempPasswordInput, setTempPasswordInput] = useState('');

  const effectiveProfile: SSHProfile | null = useMemo(() => {
    if (!activeServer) return null;
    const existing = sshProfiles.find(
      (p) =>
        p.name.toLowerCase().includes(nodeName.toLowerCase()) ||
        (p.host && p.host === activeServer.host)
    );
    if (existing) return existing;
    return {
      id: `node-host-${nodeName}`,
      name: `${nodeName} (Host)`,
      host: activeServer.host,
      port: 22,
      username: 'root',
      authType: 'password' as const,
      node: nodeName,
    };
  }, [activeServer, nodeName, sshProfiles]);

  const requestHostPassword = (): Promise<string | null> => {
    if (hostPassword) return Promise.resolve(hostPassword);
    if (effectiveProfile?.password) return Promise.resolve(effectiveProfile.password);

    return new Promise((resolve) => {
      setTempPasswordInput('');
      setPasswordModal({
        isOpen: true,
        callback: async (pass: string) => {
          setHostPassword(pass);
          resolve(pass);
        },
      });
    });
  };

  const isKernelOrReboot = (pkgName: string) => {
    const n = pkgName.toLowerCase();
    return (
      n.startsWith('pve-kernel') ||
      n.startsWith('proxmox-kernel') ||
      n.startsWith('linux-image') ||
      n.startsWith('linux-headers') ||
      n.startsWith('grub') ||
      n.startsWith('systemd')
    );
  };

  const fetchUpdates = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      if (window.api?.proxmox?.getNodeUpdates) {
        const list = await window.api.proxmox.getNodeUpdates(activeServer, nodeName);
        setUpdates(list);
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Не вдалося отримати список оновлень Proxmox',
      });
    } finally {
      setLoading(false);
    }
  }, [activeServer, nodeName]);

  const handleRefreshRepo = async () => {
    if (!activeServer || !nodeName) return;
    setRefreshingRepo(true);
    setStatusMsg(null);
    try {
      if (window.api?.proxmox?.refreshNodeUpdates) {
        const res = await window.api.proxmox.refreshNodeUpdates(activeServer, nodeName);
        if (res.success) {
          setStatusMsg({
            type: 'success',
            text: 'Запит apt update відправлено. Оновлення списку пакетів...',
          });
          setTimeout(fetchUpdates, 3000);
        } else {
          setStatusMsg({
            type: 'error',
            text: res.error || 'Не вдалося оновити списки репозиторіїв',
          });
        }
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Помилка виконання apt update',
      });
    } finally {
      setRefreshingRepo(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUpdates();
      setSearchTerm('');
      setStatusMsg(null);
    }
  }, [isOpen, fetchUpdates]);

  if (!isOpen) return null;

  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentPackage: string;
    percent: number;
  } | null>(null);

  const handleInstallSingle = async (pkgName: string) => {
    if (!effectiveProfile) {
      setStatusMsg({
        type: 'error',
        text: 'Не знайдено інформації про хост Proxmox.',
      });
      return;
    }

    let pass = hostPassword || effectiveProfile.password;
    if (!pass) {
      pass = (await requestHostPassword()) || undefined;
      if (!pass) return;
    }

    setInstallingPkg(pkgName);
    setStatusMsg(null);
    try {
      if (window.api?.updates?.installUpdate) {
        const res = await window.api.updates.installUpdate(
          { ...effectiveProfile, password: pass },
          pkgName,
          pass
        );
        if (res.success) {
          setStatusMsg({
            type: 'success',
            text: `Пакет ${pkgName} успішно встановлено!`,
          });
          setUpdates((prev) => prev.filter((u) => u.package !== pkgName));
        } else {
          if (res.error?.includes('password is required') || res.error?.includes('incorrect password') || res.error?.includes('Authentication failed')) {
            setHostPassword('');
            requestHostPassword().then(async (newPass) => {
              if (newPass) await handleInstallSingle(pkgName);
            });
            return;
          }
          setStatusMsg({
            type: 'error',
            text: res.error || `Не вдалося встановити ${pkgName}`,
          });
        }
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Помилка встановлення пакета',
      });
    } finally {
      setInstallingPkg(null);
    }
  };

  const handleInstallAllSafe = async () => {
    if (!effectiveProfile) {
      setStatusMsg({
        type: 'error',
        text: 'Не знайдено інформації про хост Proxmox.',
      });
      return;
    }

    const safePkgs = updates.filter((u) => !isKernelOrReboot(u.package)).map((u) => u.package);
    if (safePkgs.length === 0) {
      setStatusMsg({
        type: 'error',
        text: 'Немає доступних безпечних оновлень (залишились лише оновлення ядра/завантажувача).',
      });
      return;
    }

    let pass = hostPassword || effectiveProfile.password;
    if (!pass) {
      pass = (await requestHostPassword()) || undefined;
      if (!pass) return;
    }

    setInstallingAllSafe(true);
    setStatusMsg(null);
    setBatchProgress({
      current: 0,
      total: safePkgs.length,
      currentPackage: safePkgs[0],
      percent: 0,
    });

    let successCount = 0;
    const errors: string[] = [];

    try {
      for (let i = 0; i < safePkgs.length; i++) {
        const pkg = safePkgs[i];
        const percent = Math.round((i / safePkgs.length) * 100);
        setBatchProgress({
          current: i + 1,
          total: safePkgs.length,
          currentPackage: pkg,
          percent,
        });

        if (window.api?.updates?.installUpdate) {
          let res = await window.api.updates.installUpdate(
            { ...effectiveProfile, password: pass },
            pkg,
            pass
          );

          if (!res.success && (res.error?.includes('ECONNREFUSED') || res.error?.includes('ETIMEDOUT'))) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            res = await window.api.updates.installUpdate(
              { ...effectiveProfile, password: pass },
              pkg,
              pass
            );
          }

          if (res.success) {
            successCount++;
            setUpdates((prev) => prev.filter((u) => u.package !== pkg));
          } else {
            if (
              res.error?.includes('password is required') ||
              res.error?.includes('incorrect password') ||
              res.error?.includes('Authentication failed')
            ) {
              setHostPassword('');
              setBatchProgress(null);
              setInstallingAllSafe(false);
              requestHostPassword().then(async (newPass) => {
                if (newPass) await handleInstallAllSafe();
              });
              return;
            }
            errors.push(`${pkg}: ${res.error || 'помилка'}`);
          }
        }
      }

      setBatchProgress({
        current: safePkgs.length,
        total: safePkgs.length,
        currentPackage: 'Завершено',
        percent: 100,
      });

      if (successCount > 0) {
        setStatusMsg({
          type: 'success',
          text: `Успішно встановлено ${successCount} з ${safePkgs.length} оновлень!${
            errors.length > 0 ? ` Помилок: ${errors.length}` : ''
          }`,
        });
        setTimeout(fetchUpdates, 1500);
      } else {
        setStatusMsg({
          type: 'error',
          text: errors[0] || 'Не вдалося встановити оновлення.',
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Помилка виконання оновлення',
      });
    } finally {
      setTimeout(() => {
        setBatchProgress(null);
        setInstallingAllSafe(false);
      }, 1000);
    }
  };

  const filteredUpdates = updates.filter(
    (u) =>
      u.package.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.title && u.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.description && u.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const safeCount = updates.filter((u) => !isKernelOrReboot(u.package)).length;
  const rebootCount = updates.length - safeCount;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white dark:bg-[#1E1E22] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden text-zinc-800 dark:text-zinc-100 modal-animate"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#25252a]/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                Оновлення системи Proxmox: {nodeName}
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {updates.length} доступно
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Перевірка та встановлення пакетів PVE і ядра хоста
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshRepo}
              disabled={refreshingRepo}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Оновити список пакетів з репозиторіїв (apt update)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingRepo ? 'animate-spin text-amber-500' : ''}`} />
              <span>{refreshingRepo ? 'Оновлення індексу...' : 'apt update'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            className={`px-6 py-2.5 border-b text-xs flex items-center gap-2 transition-colors ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="flex-1">{statusMsg.text}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Overview & Action Toolbar */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-[#18181b]/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Пошук пакетів (pve, qemu, kernel...)"
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-[#202024] border border-zinc-200 dark:border-zinc-700 text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Безпечні: {safeCount}</span>
            </span>

            {rebootCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Потребують рестарту (ядро): {rebootCount}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenTerminal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTerminal();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer shadow-2xs"
                title="Відкрити Shell вузла для інтерактивного оновлення через apt-get dist-upgrade"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                <span>Оновити через Shell</span>
              </button>
            )}

            {safeCount > 0 && (
              <button
                type="button"
                onClick={handleInstallAllSafe}
                disabled={installingAllSafe || !effectiveProfile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {batchProgress ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Оновлення {batchProgress.current}/{batchProgress.total} ({batchProgress.percent}%)...
                    </span>
                  </>
                ) : (
                  <>
                    <Download className={`w-3.5 h-3.5 ${installingAllSafe ? 'animate-bounce' : ''}`} />
                    <span>{installingAllSafe ? 'Встановлення...' : `Встановити безпечні (${safeCount})`}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Batch Progress Bar */}
        {batchProgress && (
          <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1c1c20]">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                Встановлення {batchProgress.current} з {batchProgress.total}:{' '}
                <code className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  {batchProgress.currentPackage}
                </code>
              </span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100 shrink-0 ml-2 font-mono">
                {batchProgress.percent}%
              </span>
            </div>
            <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                style={{ width: `${batchProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Packages List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-zinc-100 dark:divide-zinc-800/60 min-h-[280px]">
          {loading && updates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-amber-500" />
              <span className="text-xs">Перевірка доступних оновлень Proxmox...</span>
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-zinc-400 text-xs gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Всі пакети оновлено до актуальної версії!
              </span>
              <span className="text-[11px] text-zinc-400">
                Для перевірки нових релізів натисніть «apt update».
              </span>
            </div>
          ) : (
            filteredUpdates.map((pkg) => {
              const isDanger = isKernelOrReboot(pkg.package);
              const isInstallingThis = installingPkg === pkg.package;

              return (
                <div
                  key={pkg.package}
                  className="flex items-center justify-between py-2.5 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-xl transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0">
                      {isDanger ? (
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                      ) : (
                        <ArrowUpCircle className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 truncate">
                          {pkg.package}
                        </span>
                        {isDanger && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-medium shrink-0">
                            Ядро / Рестарт
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        {pkg.oldVersion && (
                          <>
                            <span>{pkg.oldVersion}</span>
                            <span>→</span>
                          </>
                        )}
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {pkg.version}
                        </span>
                      </div>
                      {pkg.description && (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-1 mt-0.5">
                          {pkg.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInstallSingle(pkg.package)}
                    disabled={isInstallingThis || !effectiveProfile || batchProgress !== null}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs shrink-0"
                    title="Встановити це оновлення"
                  >
                    <Download className={`w-3.5 h-3.5 ${isInstallingThis ? 'animate-bounce text-amber-500' : ''}`} />
                    <span>{isInstallingThis ? 'Встановлення...' : 'Оновити'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#25252a]/40 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            {effectiveProfile ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Вузол {nodeName} ({effectiveProfile.username}@{effectiveProfile.host})
              </span>
            ) : (
              <span>Для прямого встановлення налаштуйте SSH-профіль до сервера або використовуйте Shell</span>
            )}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            Закрити
          </button>
        </div>
      </div>

      {/* Host Password Prompt Modal */}
      {passwordModal.isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#1E1E22] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-5 modal-animate">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Пароль хоста Proxmox
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Потрібен пароль користувача {effectiveProfile?.username || 'root'} для встановлення
                </p>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!tempPasswordInput) return;
                const cb = passwordModal.callback;
                setPasswordModal({ isOpen: false, callback: async () => {} });
                await cb(tempPasswordInput);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Пароль ({effectiveProfile?.username || 'root'}@{effectiveProfile?.host || activeServer?.host})
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    autoFocus
                    placeholder="Введіть пароль root/SSH хоста"
                    value={tempPasswordInput}
                    onChange={(e) => setTempPasswordInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:border-amber-500 dark:focus:border-amber-400 text-zinc-900 dark:text-zinc-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPasswordModal({ isOpen: false, callback: async () => {} })}
                  className="px-3 py-1.5 rounded-lg text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors font-medium cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={!tempPasswordInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Підтвердити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
