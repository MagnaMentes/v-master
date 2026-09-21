import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Container,
} from 'lucide-react';
import type { ProxmoxVM, SSHProfile, VMDiagnosticsData, DockerContainer } from '../types';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../contexts/LanguageContext';

interface ResourceDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vm: ProxmoxVM;
  sshProfile: SSHProfile | null;
  onOpenTerminal: () => void;
  onConfigureSSH?: () => void;
}

function mergeLogs(existing: string, incoming: string): string {
  if (!existing || !existing.trim()) return incoming;
  if (!incoming || !incoming.trim()) return existing;

  const existingLines = existing.trimEnd().split('\n');
  const incomingLines = incoming.trimEnd().split('\n');

  // Exact match on the last known line
  const lastLine = existingLines[existingLines.length - 1];
  const lastIndex = incomingLines.lastIndexOf(lastLine);

  if (lastIndex !== -1) {
    const newLines = incomingLines.slice(lastIndex + 1);
    if (newLines.length === 0) return existing;
    return [...existingLines, ...newLines].slice(-1000).join('\n');
  }

  // Suffix matching up to 30 lines
  const maxCheck = Math.min(30, existingLines.length, incomingLines.length);
  for (let len = maxCheck; len > 0; len--) {
    const existingTail = existingLines.slice(-len);
    const incomingHead = incomingLines.slice(0, len);
    if (existingTail.every((line, i) => line === incomingHead[i])) {
      const newLines = incomingLines.slice(len);
      if (newLines.length === 0) return existing;
      return [...existingLines, ...newLines].slice(-1000).join('\n');
    }
  }

  // Append new incoming lines preserving history
  return [...existingLines, ...incomingLines].slice(-1000).join('\n');
}

export const ResourceDiagnosticsModal: React.FC<ResourceDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  vm,
  sshProfile,
  onOpenTerminal,
  onConfigureSSH,
}) => {
  const { t } = useTranslation();
  const { saveSSHProfile } = useApp();
  const [data, setData] = useState<VMDiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'mem' | 'cpu' | 'pid'>('mem');
  const [activeTab, setActiveTab] = useState<'processes' | 'disks' | 'logs' | 'docker'>('processes');
  const [actingPid, setActingPid] = useState<number | null>(null);
  const [isDroppingCache, setIsDroppingCache] = useState(false);
  const [sudoPass, setSudoPass] = useState<string>(sshProfile?.sudoPassword || sshProfile?.password || '');
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

  // Docker state
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [isDockerInstalled, setIsDockerInstalled] = useState<boolean>(true);
  const [isDockerLoading, setIsDockerLoading] = useState<boolean>(false);
  const [actingContainerId, setActingContainerId] = useState<string | null>(null);
  const [selectedContainerLogs, setSelectedContainerLogs] = useState<{ id: string; name: string; logs: string } | null>(null);

  const primaryIp = vm.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : undefined;
  const effectiveProfile = useMemo(() => {
    if (sshProfile && sshProfile.username) {
      return { ...sshProfile, host: sshProfile.host || primaryIp || '' };
    }
    return null;
  }, [
    sshProfile?.id,
    sshProfile?.host,
    sshProfile?.username,
    sshProfile?.password,
    sshProfile?.privateKeyPath,
    sshProfile?.port,
    primaryIp,
  ]);

  const fetchDiagnostics = useCallback(async () => {
    if (!effectiveProfile || !effectiveProfile.host) {
      setError(t.resourceDiagnostics.sshProfileRequired);
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
          setError(res.error || t.resourceDiagnostics.connError);
        }
      } else {
        setError(t.common.error);
      }
    } catch (err: any) {
      setError(err.message || t.resourceDiagnostics.connError);
    } finally {
      setLoading(false);
    }
  }, [effectiveProfile, vm.ipAddresses, t]);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const lastFilterRef = useRef({ filter: logFilter, unit: logUnit });

  const fetchLogs = useCallback(
    async (isBackground: boolean = false) => {
      if (!effectiveProfile || !effectiveProfile.host) return;

      const filterChanged =
        lastFilterRef.current.filter !== logFilter || lastFilterRef.current.unit !== logUnit;
      lastFilterRef.current = { filter: logFilter, unit: logUnit };

      if (!isBackground || filterChanged) {
        setIsLogsLoading(true);
      }

      try {
        if (window.api?.diagnostics?.getSystemLogs) {
          const res = await window.api.diagnostics.getSystemLogs(
            effectiveProfile,
            logFilter,
            120,
            logUnit
          );
          if (res.success && typeof res.logs === 'string') {
            const incomingLogs = res.logs;
            setLogsContent((prev) => {
              if (filterChanged || !prev) {
                return incomingLogs;
              }
              return mergeLogs(prev, incomingLogs);
            });
          } else if (!isBackground) {
            setLogsContent(res.error || t.resourceDiagnostics.emptyJournal);
          }
        }
      } finally {
        setIsLogsLoading(false);
      }
    },
    [effectiveProfile, logFilter, logUnit, t]
  );

  const fetchDockerContainers = useCallback(async () => {
    if (!effectiveProfile || !effectiveProfile.host) return;
    setIsDockerLoading(true);
    try {
      if (window.api?.diagnostics?.getDockerContainers) {
        const res = await window.api.diagnostics.getDockerContainers(effectiveProfile);
        if (res.success) {
          setIsDockerInstalled(res.isInstalled);
          setDockerContainers(res.containers || []);
        }
      }
    } catch {
      // Ignore
    } finally {
      setIsDockerLoading(false);
    }
  }, [effectiveProfile]);

  const handleRestartContainer = async (containerId: string) => {
    if (!effectiveProfile) return;
    setActingContainerId(containerId);
    try {
      let pass = await requestSudoPassword();
      const res = await window.api.diagnostics.restartDockerContainer(effectiveProfile, containerId, pass || undefined);
      if (res.success) {
        setStatusMsg({ type: 'success', text: `${containerId}: ${t.common.success}` });
        await fetchDockerContainers();
      } else {
        setStatusMsg({ type: 'error', text: res.error || t.common.error });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || t.common.error });
    } finally {
      setActingContainerId(null);
    }
  };

  const handleViewContainerLogs = async (container: DockerContainer) => {
    if (!effectiveProfile) return;
    try {
      const res = await window.api.diagnostics.getDockerLogs(effectiveProfile, container.id, 150);
      if (res.success) {
        setSelectedContainerLogs({
          id: container.id,
          name: container.names || container.id,
          logs: res.logs || t.resourceDiagnostics.emptyJournal,
        });
      } else {
        alert(res.error || t.common.error);
      }
    } catch (e: any) {
      alert(e.message || t.common.error);
    }
  };

  useEffect(() => {
    if (activeTab === 'docker' && isOpen) {
      fetchDockerContainers();
    }
  }, [activeTab, isOpen, fetchDockerContainers]);

  useEffect(() => {
    if (activeTab === 'logs' && isOpen) {
      fetchLogs(false);
      const timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        fetchLogs(true);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [activeTab, isOpen, fetchLogs]);

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logsContent, autoScroll]);

  const handleLogsScroll = () => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

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
    if (effectiveProfile?.sudoPassword) return Promise.resolve(effectiveProfile.sudoPassword);
    if (sudoPass) return Promise.resolve(sudoPass);
    if (effectiveProfile?.password) return Promise.resolve(effectiveProfile.password);

    return new Promise((resolve) => {
      setTempSudoInput('');
      setSudoModal({
        isOpen: true,
        callback: (pass: string | null) => {
          if (pass) {
            setSudoPass(pass);
            if (sshProfile) {
              saveSSHProfile({ ...sshProfile, sudoPassword: pass });
            }
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

    let pass = sudoPass || effectiveProfile.sudoPassword || effectiveProfile.password;

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
        setSudoPass('');
        if (sshProfile?.sudoPassword) {
          saveSSHProfile({ ...sshProfile, sudoPassword: '' });
        }
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
              ? t.resourceDiagnostics.cacheClearedSuccess
              : action === 'restart-service'
              ? t.resourceDiagnostics.serviceRestartSuccess.replace('{{target}}', target || '')
              : t.resourceDiagnostics.processKilledSuccess.replace('{{target}}', target || ''),
        });
        // Refresh diagnostics
        setTimeout(fetchDiagnostics, 800);
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || t.common.error,
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || t.common.error,
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
                {t.resourceDiagnostics.title.replace('{{name}}', vm.name)}
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  VMID: {vm.vmid}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t.resourceDiagnostics.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title={t.resourceDiagnostics.refreshData}
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
                    <span>{t.resourceDiagnostics.ram}</span>
                  </div>
                </div>
                <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  {data.memUsed} / {data.memTotal}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t.resourceDiagnostics.available.replace('{{amount}}', data.memAvailable || data.memFree)}
                </div>
              </div>
              <button
                disabled={isDroppingCache}
                onClick={() => handleAction('drop-caches', '')}
                className="mt-2 px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title={t.resourceDiagnostics.dropCacheTitle}
              >
                <RotateCcw className={`w-3 h-3 ${isDroppingCache ? 'animate-spin' : ''}`} />
                <span>{isDroppingCache ? t.resourceDiagnostics.droppingCache : t.resourceDiagnostics.dropCacheBtn}</span>
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>{t.resourceDiagnostics.swap}</span>
              </div>
              <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                {data.swapUsed || '0B'} / {data.swapTotal || '0B'}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t.resourceDiagnostics.swapUsage}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                <span>{t.resourceDiagnostics.rootDisk}</span>
              </div>
              <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                {data.disks.find((d) => d.mountedOn === '/')?.usePercent || 'N/A'}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {data.disks.find((d) => d.mountedOn === '/')?.used} / {data.disks.find((d) => d.mountedOn === '/')?.size}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#25252a] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t.resourceDiagnostics.deepDiag}</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenTerminal();
                }}
                className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>{t.resourceDiagnostics.openSsh}</span>
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
              {t.resourceDiagnostics.topProcesses.replace('{{count}}', String(filteredProcesses.length))}
            </button>
            <button
              onClick={() => setActiveTab('disks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'disks'
                  ? 'bg-white dark:bg-[#2A2A2E] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {t.resourceDiagnostics.diskPartitions.replace('{{count}}', String(data?.disks.length || 0))}
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
              <span>{t.resourceDiagnostics.logsJournal}</span>
            </button>
            <button
              onClick={() => setActiveTab('docker')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'docker'
                  ? 'bg-white dark:bg-[#2A2A2E] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Container className="w-3.5 h-3.5 text-blue-500" />
              <span>{t.resourceDiagnostics.dockerContainers.replace('{{count}}', String(dockerContainers.length))}</span>
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
                  {t.resourceDiagnostics.allLogs}
                </button>
                <button
                  onClick={() => setLogFilter('errors')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    logFilter === 'errors' ? 'bg-rose-500 text-white shadow-2xs' : 'text-zinc-500'
                  }`}
                >
                  {t.resourceDiagnostics.errorLogs}
                </button>
                <button
                  onClick={() => setLogFilter('warnings')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    logFilter === 'warnings' ? 'bg-amber-500 text-white shadow-2xs' : 'text-zinc-500'
                  }`}
                >
                  {t.resourceDiagnostics.warnLogs}
                </button>
              </div>

              <input
                type="text"
                placeholder={t.resourceDiagnostics.serviceUnitPlaceholder}
                value={logUnit}
                onChange={(e) => setLogUnit(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden w-28"
              />

              <input
                type="text"
                placeholder={t.resourceDiagnostics.searchLogsPlaceholder}
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden w-32"
              />

              <button
                type="button"
                onClick={() => {
                  setAutoScroll((prev) => !prev);
                  if (!autoScroll && logsContainerRef.current) {
                    logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                  }
                }}
                title={autoScroll ? t.resourceDiagnostics.autoScrollOn : t.resourceDiagnostics.autoScrollOff}
                className={`px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors flex items-center gap-1 ${
                  autoScroll
                    ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <span>{t.resourceDiagnostics.autoScroll}</span>
              </button>

              <button
                onClick={() => fetchLogs(false)}
                disabled={isLogsLoading}
                title={t.resourceDiagnostics.refreshLogs}
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
                  placeholder={t.resourceDiagnostics.searchProcess}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden focus:border-blue-500 w-44"
                />
              </div>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-zinc-400 text-[11px]">{t.resourceDiagnostics.sortBy}</span>
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
              <span className="text-xs font-medium">{t.resourceDiagnostics.loadingProcesses}</span>
            </div>
          ) : !data && error ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
                <WifiOff className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5">
                {!effectiveProfile ? t.terminal.setupSshTitle : t.resourceDiagnostics.connError}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                {!effectiveProfile
                  ? t.resourceDiagnostics.sshProfileRequired
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
                    <span>{t.resourceDiagnostics.setupSshAccess}</span>
                  </button>
                )}
                <button
                  onClick={fetchDiagnostics}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{t.resourceDiagnostics.retry}</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'processes' ? (
            filteredProcesses.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-xs">
                {searchTerm ? t.resourceDiagnostics.noProcessesFound : t.resourceDiagnostics.noProcessesData}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                      <th className="pb-2 font-semibold">{t.resourceDiagnostics.tablePid}</th>
                      <th className="pb-2 font-semibold">{t.resourceDiagnostics.tableUser}</th>
                      <th className="pb-2 font-semibold text-right">RAM %</th>
                      <th className="pb-2 font-semibold text-right">CPU %</th>
                      <th className="pb-2 font-semibold pl-4">{t.resourceDiagnostics.tableCommand}</th>
                      <th className="pb-2 font-semibold text-right">{t.common.actions}</th>
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
                                  title={t.resourceDiagnostics.restartServiceTitle.replace('{{name}}', serviceName)}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restart</span>
                                </button>
                              )}
                              <button
                                disabled={isActing || p.pid <= 2}
                                onClick={() => handleAction('kill', p.pid.toString(), p.pid)}
                                className="px-2 py-1 rounded-md text-[11px] font-medium bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={p.pid <= 2 ? t.resourceDiagnostics.protectedProcessTitle : t.resourceDiagnostics.killProcessTitle}
                              >
                                <X className="w-3 h-3" />
                                <span>{t.resourceDiagnostics.killProcess}</span>
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
                        <span className="text-zinc-400 font-normal"> / {disk.size} ({disk.usePercent})</span>
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
                      <span>{t.resourceDiagnostics.diskFree.replace('{{amount}}', disk.avail)}</span>
                      {isOverload && (
                        <span className="text-rose-500 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {t.resourceDiagnostics.diskWarning}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : activeTab === 'docker' ? (
            <div className="flex flex-col gap-3">
              {isDockerLoading ? (
                <div className="py-20 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>{t.resourceDiagnostics.dockerChecking}</span>
                </div>
              ) : !isDockerInstalled ? (
                <div className="py-16 text-center text-zinc-500 text-xs">
                  <Container className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">{t.resourceDiagnostics.dockerNotDetected}</p>
                  <p className="text-zinc-400 mt-1">{t.resourceDiagnostics.dockerNotDetectedDesc}</p>
                </div>
              ) : dockerContainers.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs">
                  <Container className="w-8 h-8 text-blue-500 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">{t.resourceDiagnostics.dockerNoActiveContainers}</p>
                  <p className="text-zinc-400 mt-1">{t.resourceDiagnostics.dockerNoActiveContainersDesc}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">{t.resourceDiagnostics.dockerTableState}</th>
                        <th className="px-4 py-2.5 font-medium">{t.resourceDiagnostics.dockerTableName}</th>
                        <th className="px-4 py-2.5 font-medium">{t.resourceDiagnostics.dockerTableImage}</th>
                        <th className="px-4 py-2.5 font-medium">{t.resourceDiagnostics.dockerTablePorts}</th>
                        <th className="px-4 py-2.5 font-medium text-right">{t.common.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {dockerContainers.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/30">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                c.state === 'running'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${c.state === 'running' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                              {c.state === 'running' ? 'Running' : c.state}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 font-mono">
                            <div>{c.names || c.id}</div>
                            <div className="text-[10px] text-zinc-400 font-normal">{c.id.slice(0, 12)}</div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 max-w-xs truncate" title={c.image}>
                            {c.image}
                          </td>
                          <td className="px-4 py-3 text-zinc-500 font-mono text-[11px] max-w-xs truncate" title={c.ports}>
                            {c.ports || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleViewContainerLogs(c)}
                                title={t.resourceDiagnostics.dockerLogsTitle}
                                className="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium transition-colors"
                              >
                                {t.resourceDiagnostics.dockerLogsBtn}
                              </button>
                              <button
                                onClick={() => handleRestartContainer(c.id)}
                                disabled={actingContainerId === c.id}
                                title={t.resourceDiagnostics.dockerRestartTitle}
                                className="p-1.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-950/50 text-amber-600 dark:text-amber-400 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${actingContainerId === c.id ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-[460px] bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden relative">
              {/* Subtle top indicator during background sync */}
              {isLogsLoading && logsContent && (
                <div className="absolute top-2.5 right-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-[10px] text-zinc-400 font-mono backdrop-blur-xs shadow-xs">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
                  <span>{t.resourceDiagnostics.syncingLogs}</span>
                </div>
              )}

              <div
                ref={logsContainerRef}
                onScroll={handleLogsScroll}
                className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 select-text whitespace-pre-wrap"
              >
                {isLogsLoading && !logsContent ? (
                  <div className="flex items-center justify-center h-full gap-2 text-zinc-500">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    <span>{t.resourceDiagnostics.loadingJournal}</span>
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
                  <div className="text-center py-20 text-zinc-600">{t.resourceDiagnostics.emptyJournal}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Docker Container Logs Modal */}
        {selectedContainerLogs && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-zinc-950 rounded-2xl border border-zinc-800 max-w-3xl w-full h-[500px] flex flex-col shadow-2xl modal-animate overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-300 bg-zinc-900/50">
                <div className="flex items-center gap-2 font-mono">
                  <Container className="w-4 h-4 text-blue-400" />
                  <span className="font-bold">{selectedContainerLogs.name}</span>
                  <span className="text-zinc-500">({selectedContainerLogs.id.slice(0, 12)})</span>
                </div>
                <button
                  onClick={() => setSelectedContainerLogs(null)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 select-text whitespace-pre-wrap">
                {selectedContainerLogs.logs}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#25252a]/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{t.resourceDiagnostics.footerHint}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {t.common.close}
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
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.resourceDiagnostics.sudoRequired}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {t.resourceDiagnostics.sudoRequiredDesc}
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
                    {t.resourceDiagnostics.sudoPasswordLabel.replace('{{user}}', effectiveProfile?.username || 'user')}
                  </label>
                  <input
                    type="password"
                    autoFocus
                    placeholder={t.resourceDiagnostics.sudoPlaceholder}
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
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={!tempSudoInput.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {t.common.confirm}
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
