import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Database,
  HardDrive,
  AlertTriangle,
  RotateCcw,
  Search,
  CheckCircle2,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  Settings,
  WifiOff,
  Key,
  FileText,
} from 'lucide-react';
import type { ProxmoxVM, SSHProfile, VMDiagnosticsData } from '../types';

interface ResourceDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vm: ProxmoxVM;
  sshProfile: SSHProfile | null;
  onOpenTerminal: () => void;
  onConfigureSSH?: () => void;
}

export const ResourceDiagnosticsModal: React.FC<ResourceDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  vm,
  sshProfile,
  onOpenTerminal,
  onConfigureSSH,
}) => {
  const [data, setData] = useState<VMDiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'mem' | 'cpu' | 'pid'>('mem');
  const [activeTab, setActiveTab] = useState<'processes' | 'disks' | 'logs'>('processes');
  const [actingPid, setActingPid] = useState<number | null>(null);
  const [isDroppingCache, setIsDroppingCache] = useState(false);
  const [sudoPass, setSudoPass] = useState<string>(sshProfile?.password || '');
  const [tempSudoInput, setTempSudoInput] = useState('');
  const [sudoModal, setSudoModal] = useState<{
    isOpen: boolean;
    callback: ((pass: string | null) => void) | null;
  }>({ isOpen: false, callback: null });

  // System logs state
  const [logsContent, setLogsContent] = useState<string>('');
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const [logUnit, setLogUnit] = useState<string>('');
  const [logSearch, setLogSearch] = useState<string>('');

  const effectiveProfile = useMemo(() => {
    const primaryIp = vm.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : undefined;
    if (sshProfile && sshProfile.username) {
      return { ...sshProfile, host: sshProfile.host || primaryIp || '' };
    }
    return null;
  }, [sshProfile, vm]);

  const fetchDiagnostics = useCallback(async () => {
    if (!effectiveProfile || !effectiveProfile.host) {
      setError('Для цієї ВМ не налаштовано SSH-профіль. Будь ласка, вкажіть користувача та параметри автентифікації.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (window.api?.diagnostics?.getDiagnostics) {
        let res = await window.api.diagnostics.getDiagnostics(effectiveProfile);

        // If connection refused/timed out and VM has other IPs, try them
        if (!res.success && res.error && (res.error.includes('ECONNREFUSED') || res.error.includes('ETIMEDOUT'))) {
          const alternateIps = (vm.ipAddresses || []).filter((ip) => ip !== effectiveProfile.host);
          for (const altIp of alternateIps) {
            const altProfile = { ...effectiveProfile, host: altIp };
            const altRes = await window.api.diagnostics.getDiagnostics(altProfile);
            if (altRes.success && altRes.data) {
              res = altRes;
              break;
            }
          }
        }

        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error || 'Не вдалося отримати дані діагностики');
        }
      } else {
        setError('API діагностики недоступне');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка підключення');
    } finally {
      setLoading(false);
    }
  }, [effectiveProfile, vm.ipAddresses]);

  const fetchLogs = useCallback(async () => {
    if (!effectiveProfile || !effectiveProfile.host) return;
    setIsLogsLoading(true);
    try {
      if (window.api?.diagnostics?.getSystemLogs) {
        const res = await window.api.diagnostics.getSystemLogs(
          effectiveProfile,
          logFilter,
          120,
          logUnit
        );
        if (res.success && res.logs) {
          setLogsContent(res.logs);
        } else {
          setLogsContent(res.error || 'Не вдалося отримати логи системи');
        }
      }
    } finally {
      setIsLogsLoading(false);
    }
  }, [effectiveProfile, logFilter, logUnit]);

  useEffect(() => {
    if (activeTab === 'logs' && isOpen) {
      fetchLogs();
    }
  }, [activeTab, isOpen, fetchLogs]);

  useEffect(() => {
    if (isOpen) {
      setStatusMsg(null);
      setError(null);
      fetchDiagnostics();
    }
  }, [isOpen, fetchDiagnostics]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const requestSudoPassword = (): Promise<string | null> => {
    if (sudoPass) return Promise.resolve(sudoPass);
    if (effectiveProfile?.password) return Promise.resolve(effectiveProfile.password);

    return new Promise((resolve) => {
      setTempSudoInput('');
      setSudoModal({
        isOpen: true,
        callback: (pass: string | null) => {
          if (pass) {
            setSudoPass(pass);
          }
          resolve(pass);
        },
      });
    });
  };

  const handleAction = async (
    action: 'kill' | 'kill-9' | 'restart-service' | 'drop-caches',
    target: string,
    pid?: number
  ) => {
    if (!effectiveProfile) return;
    if (pid) setActingPid(pid);
    if (action === 'drop-caches') setIsDroppingCache(true);
    setStatusMsg(null);

    let pass = sudoPass || effectiveProfile.password;

    try {
      let res = await window.api.diagnostics.manageProcess(effectiveProfile, action, target, pass);

      // If action requires sudo password, prompt user and retry
      if (
        !res.success &&
        res.error &&
        (res.error.toLowerCase().includes('password') ||
          res.error.toLowerCase().includes('sudo:') ||
          res.error.toLowerCase().includes('terminal'))
      ) {
        const entered = await requestSudoPassword();
        if (!entered) {
          if (pid) setActingPid(null);
          if (action === 'drop-caches') setIsDroppingCache(false);
          return;
        }
        pass = entered;
        res = await window.api.diagnostics.manageProcess(effectiveProfile, action, target, pass);
      }

      if (!res.success && res.error && (res.error.includes('ECONNREFUSED') || res.error.includes('ETIMEDOUT'))) {
        const alternateIps = (vm.ipAddresses || []).filter((ip) => ip !== effectiveProfile.host);
        for (const altIp of alternateIps) {
          const altProfile = { ...effectiveProfile, host: altIp };
          const altRes = await window.api.diagnostics.manageProcess(altProfile, action, target, pass);
          if (altRes.success) {
            res = altRes;
            break;
          }
        }
      }

      if (res.success) {
        setStatusMsg({
          type: 'success',
          text:
            action === 'drop-caches'
              ? 'Системний кеш Linux (Page Cache & Buffers) успішно очищено!'
              : action === 'restart-service'
              ? `Службу "${target}" успішно перезапущено!`
              : `Процес (PID: ${target}) зупинено.`,
        });
        // Refresh diagnostics
        setTimeout(fetchDiagnostics, 800);
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || `Не вдалося виконати дію над ${target || 'кешем'}`,
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Помилка виконання команди',
      });
    } finally {
      if (pid) setActingPid(null);
      if (action === 'drop-caches') setIsDroppingCache(false);
    }
  };

  const getServiceNameFromCommand = (cmd: string): string | null => {
    const lower = cmd.toLowerCase();
    if (lower.includes('nginx')) return 'nginx';
    if (lower.includes('apache') || lower.includes('httpd')) return 'apache2';
    if (lower.includes('mysql') || lower.includes('mysqld')) return 'mysql';
    if (lower.includes('mariadb')) return 'mariadb';
    if (lower.includes('postgres')) return 'postgresql';
    if (lower.includes('redis')) return 'redis-server';
    if (lower.includes('docker') || lower.includes('containerd')) return 'docker';
    if (lower.includes('php-fpm')) {
      const match = cmd.match(/php-fpm(\d+\.\d+)?/);
      return match ? match[0] : 'php-fpm';
    }
    return null;
  };

  const filteredProcesses = (data?.processes || [])
    .filter((p) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.command.toLowerCase().includes(term) ||
        p.user.toLowerCase().includes(term) ||
        p.pid.toString().includes(term)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'mem') return b.mem - a.mem;
      if (sortBy === 'cpu') return b.cpu - a.cpu;
      return a.pid - b.pid;
    });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1E1E22] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden text-zinc-800 dark:text-zinc-100 modal-animate"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#25252a]/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                Діагностика ресурсів: {vm.name}
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  VMID: {vm.vmid}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Аналіз процесів, використання памʼяті та дисків із можливістю швидкого перезапуску або зупинки
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Оновити дані"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Resource Overview Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-[#18181b]/30">
            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                    <span>Оперативна пам'ять</span>
                  </div>
                </div>
                <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  {data.memUsed} / {data.memTotal}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Доступно: {data.memAvailable || data.memFree}
                </div>
              </div>
              <button
                disabled={isDroppingCache}
                onClick={() => handleAction('drop-caches', '')}
                className="mt-2 px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title="Звільнити дисковий кеш ядра Linux (Page Cache & Buffers)"
              >
                <RotateCcw className={`w-3 h-3 ${isDroppingCache ? 'animate-spin' : ''}`} />
                <span>{isDroppingCache ? 'Очищення...' : 'Очистити кеш RAM'}</span>
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Файл підкачки (Swap)</span>
              </div>
              <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                {data.swapUsed || '0B'} / {data.swapTotal || '0B'}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Використання swap
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                <span>Кореневий диск (/)</span>
              </div>
              <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                {data.disks.find((d) => d.mountedOn === '/')?.usePercent || 'N/A'}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {data.disks.find((d) => d.mountedOn === '/')?.used} з {data.disks.find((d) => d.mountedOn === '/')?.size}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                <span>Глибока діагностика</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenTerminal();
                }}
                className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Відкрити SSH термінал</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* Status / Alert Messages */}
        {statusMsg && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium border ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span className="flex-1">{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && data && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Controls and Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('processes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'processes'
                  ? 'bg-white dark:bg-[#2A2A2E] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Топ процесів ({filteredProcesses.length})
            </button>
            <button
              onClick={() => setActiveTab('disks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'disks'
                  ? 'bg-white dark:bg-[#2A2A2E] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Дискові розділи ({data?.disks.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'logs'
                  ? 'bg-white dark:bg-[#2A2A2E] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Логи (Journal)</span>
            </button>
          </div>

          {activeTab === 'logs' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={() => setLogFilter('all')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    logFilter === 'all' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-2xs' : 'text-zinc-500'
                  }`}
                >
                  Всі
                </button>
                <button
                  onClick={() => setLogFilter('errors')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    logFilter === 'errors' ? 'bg-rose-500 text-white shadow-2xs' : 'text-zinc-500'
                  }`}
                >
                  Помилки
                </button>
                <button
                  onClick={() => setLogFilter('warnings')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    logFilter === 'warnings' ? 'bg-amber-500 text-white shadow-2xs' : 'text-zinc-500'
                  }`}
                >
                  Увага
                </button>
              </div>

              <input
                type="text"
                placeholder="Служба (unit)..."
                value={logUnit}
                onChange={(e) => setLogUnit(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden w-28"
              />

              <input
                type="text"
                placeholder="Пошук у логах..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden w-32"
              />

              <button
                onClick={fetchLogs}
                disabled={isLogsLoading}
                title="Оновити логи"
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLogsLoading ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>
          )}

          {activeTab === 'processes' && (
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Пошук процесу / PID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden focus:border-blue-500 w-44"
                />
              </div>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-zinc-400 text-[11px]">Сортувати:</span>
                <button
                  onClick={() => setSortBy('mem')}
                  className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                    sortBy === 'mem'
                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  RAM %
                </button>
                <button
                  onClick={() => setSortBy('cpu')}
                  className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                    sortBy === 'cpu'
                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  CPU %
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Table Area */}
        <div className="flex-1 overflow-y-auto p-5 min-h-[300px]">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-xs font-medium">Зчитування процесів та ресурсів ВМ...</span>
            </div>
          ) : !data && error ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
                <WifiOff className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5">
                {!effectiveProfile ? 'Потрібно налаштувати SSH-профіль' : 'Неможливо підключитися через SSH'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                {!effectiveProfile
                  ? 'Для перегляду процесів та керування памʼяттю необхідно вказати користувача та реквізити входу в налаштуваннях SSH цієї ВМ.'
                  : error.includes('ECONNREFUSED')
                  ? `ВМ відхилила підключення на порту ${effectiveProfile?.port || 22}. Перевірте, чи запущена служба SSH (sshd) та чи коректно вказано порт і реквізити в налаштуваннях.`
                  : error.includes('ETIMEDOUT')
                  ? `Час очікування підключення вичерпано. Перевірте доступність IP-адреси ${effectiveProfile?.host}.`
                  : error.includes('All configured authentication methods failed') || error.includes('автентифікації')
                  ? `Помилка автентифікації на ${effectiveProfile?.host}. Перевірте імʼя користувача, пароль або SSH-ключ у профілі підключення.`
                  : error}
              </p>
              <div className="w-full font-mono text-[11px] p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 mb-5 break-all border border-zinc-200 dark:border-zinc-700/60 text-left">
                {error}
              </div>
              <div className="flex items-center gap-3">
                {onConfigureSSH && (
                  <button
                    onClick={() => {
                      onClose();
                      onConfigureSSH();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Налаштувати SSH доступ</span>
                  </button>
                )}
                <button
                  onClick={fetchDiagnostics}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Повторити спробу</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'processes' ? (
            filteredProcesses.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-xs">
                {searchTerm ? 'Не знайдено процесів за вказаним фільтром.' : 'Немає даних про запущені процеси.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                      <th className="pb-2 font-semibold">PID</th>
                      <th className="pb-2 font-semibold">Користувач</th>
                      <th className="pb-2 font-semibold text-right">RAM %</th>
                      <th className="pb-2 font-semibold text-right">CPU %</th>
                      <th className="pb-2 font-semibold pl-4">Команда / Сервіс</th>
                      <th className="pb-2 font-semibold text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    {filteredProcesses.map((p) => {
                      const isHighMem = p.mem >= 10;
                      const isHighCpu = p.cpu >= 25;
                      const serviceName = getServiceNameFromCommand(p.command);
                      const isActing = actingPid === p.pid;

                      return (
                        <tr
                          key={p.pid}
                          className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                            isHighMem || isHighCpu ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="py-2.5 font-mono text-zinc-500 dark:text-zinc-400 font-medium">
                            {p.pid}
                          </td>
                          <td className="py-2.5 font-medium text-zinc-700 dark:text-zinc-300">
                            {p.user}
                          </td>
                          <td className="py-2.5 text-right font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                isHighMem
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold'
                                  : 'text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              {p.mem.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                isHighCpu
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold'
                                  : 'text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              {p.cpu.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2.5 pl-4 max-w-xs md:max-w-md truncate">
                            <div className="flex items-center gap-1.5">
                              {serviceName && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 shrink-0">
                                  {serviceName}
                                </span>
                              )}
                              <span
                                className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 truncate"
                                title={p.command}
                              >
                                {p.command}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {serviceName && (
                                <button
                                  disabled={isActing}
                                  onClick={() => handleAction('restart-service', serviceName, p.pid)}
                                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors flex items-center gap-1 disabled:opacity-50"
                                  title={`Перезапустити службу ${serviceName} через systemctl`}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restart</span>
                                </button>
                              )}
                              <button
                                disabled={isActing}
                                onClick={() => handleAction('kill', p.pid.toString(), p.pid)}
                                className="px-2 py-1 rounded-md text-[11px] font-medium bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors flex items-center gap-1 disabled:opacity-50"
                                title="Зупинити процес (kill)"
                              >
                                <X className="w-3 h-3" />
                                <span>Зупинити</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'disks' ? (
            <div className="space-y-3">
              {data?.disks.map((disk, idx) => {
                const numericPercent = parseInt(disk.usePercent.replace('%', ''), 10) || 0;
                const isOverload = numericPercent >= 85;

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#25252a] flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-zinc-800 dark:text-zinc-100">
                          {disk.mountedOn}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          ({disk.filesystem})
                        </span>
                      </div>
                      <div className="font-bold text-xs">
                        <span className={isOverload ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-300'}>
                          {disk.used}
                        </span>
                        <span className="text-zinc-400 font-normal"> з {disk.size} ({disk.usePercent})</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isOverload ? 'bg-rose-500' : numericPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(numericPercent, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Вільно: {disk.avail}</span>
                      {isOverload && (
                        <span className="text-rose-500 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Високий рівень заповнення диску
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col h-[460px] bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 select-text whitespace-pre-wrap">
                {isLogsLoading ? (
                  <div className="flex items-center justify-center h-full gap-2 text-zinc-500">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    <span>Завантаження системного журналу...</span>
                  </div>
                ) : logsContent ? (
                  logsContent
                    .split('\n')
                    .filter((line) => !logSearch || line.toLowerCase().includes(logSearch.toLowerCase()))
                    .map((line, idx) => {
                      const isErr = /error|failed|fault|crit|panic|emergency/i.test(line);
                      const isWarn = /warn|warning/i.test(line);
                      return (
                        <div
                          key={idx}
                          className={`hover:bg-zinc-900/80 px-1 py-0.5 rounded transition-colors ${
                            isErr
                              ? 'text-rose-400 bg-rose-950/20'
                              : isWarn
                              ? 'text-amber-400 bg-amber-950/10'
                              : 'text-zinc-300'
                          }`}
                        >
                          {line}
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-20 text-zinc-600">Журнал порожній або недоступний</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#25252a]/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Швидка дія зупиняє процес безпосередньо у віртуальній машині</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Закрити
          </button>
        </div>

        {/* Sudo password modal */}
        {sudoModal.isOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 rounded-2xl">
            <div className="bg-white dark:bg-[#202023] w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Потрібен пароль sudo</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Для виконання системної дії на віртуальній машині
                  </p>
                </div>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!tempSudoInput) return;
                  const cb = sudoModal.callback;
                  setSudoModal({ isOpen: false, callback: null });
                  if (cb) await cb(tempSudoInput);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Пароль користувача ({effectiveProfile?.username || 'користувач'})
                  </label>
                  <input
                    type="password"
                    autoFocus
                    placeholder="Введіть пароль для sudo"
                    value={tempSudoInput}
                    onChange={(e) => setTempSudoInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:border-blue-500 dark:focus:border-blue-400 text-zinc-900 dark:text-zinc-100 font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const cb = sudoModal.callback;
                      setSudoModal({ isOpen: false, callback: null });
                      if (cb) cb(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors font-medium cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={!tempSudoInput.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Підтвердити
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
