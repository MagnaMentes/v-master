import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  RefreshCw,
  HardDrive,
  Network,
  Activity,
  FileText,
  Clock,
  Terminal,
  Search,
  Server,
  Layers,
  Cpu,
  Database,
  ArrowUpCircle,
  ShieldCheck,
  ShieldAlert,
  Download,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type {
  ProxmoxNodeStorage,
  ProxmoxNodeDisk,
  ProxmoxNodeTask,
  ProxmoxNodeNetwork,
  ProxmoxSyslogItem,
  ProxmoxAPTUpdate,
  SSHProfile,
} from '../types';

interface NodeAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
  onOpenTerminal?: () => void;
}

type TabType = 'overview' | 'storage' | 'network' | 'updates' | 'tasks' | 'syslog';

export const NodeAdminModal: React.FC<NodeAdminModalProps> = ({
  isOpen,
  onClose,
  nodeName,
  onOpenTerminal,
}) => {
  const { activeServer, sshProfiles } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Node Status / Hardware Overview
  const [nodeStatus, setNodeStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Storage & Disks
  const [storages, setStorages] = useState<ProxmoxNodeStorage[]>([]);
  const [disks, setDisks] = useState<ProxmoxNodeDisk[]>([]);
  const [loadingStorage, setLoadingStorage] = useState(false);

  // Network Interfaces
  const [networks, setNetworks] = useState<ProxmoxNodeNetwork[]>([]);
  const [loadingNetwork, setLoadingNetwork] = useState(false);

  // Cluster Tasks
  const [tasks, setTasks] = useState<ProxmoxNodeTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedTaskUpid, setSelectedTaskUpid] = useState<string | null>(null);
  const [taskLog, setTaskLog] = useState<string[]>([]);
  const [loadingTaskLog, setLoadingTaskLog] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  // Syslog
  const [syslog, setSyslog] = useState<ProxmoxSyslogItem[]>([]);
  const [loadingSyslog, setLoadingSyslog] = useState(false);
  const [syslogSearch, setSyslogSearch] = useState('');
  const [syslogFilter, setSyslogFilter] = useState<'all' | 'error' | 'warn'>('all');

  // Node APT Updates
  const [updates, setUpdates] = useState<ProxmoxAPTUpdate[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [refreshingRepo, setRefreshingRepo] = useState(false);
  const [installingPkg, setInstallingPkg] = useState<string | null>(null);
  const [installingAllSafe, setInstallingAllSafe] = useState(false);
  const [updateSearch, setUpdateSearch] = useState('');
  const [updateStatusMsg, setUpdateStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hostPassword, setHostPassword] = useState<string>('');
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    callback: (password: string) => Promise<void>;
  }>({ isOpen: false, callback: async () => {} });
  const [tempPasswordInput, setTempPasswordInput] = useState('');
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentPackage: string;
    percent: number;
  } | null>(null);

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

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const loadOverview = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoadingStatus(true);
    try {
      const data = await window.api.proxmox.getNodeStatus(activeServer, nodeName);
      setNodeStatus(data);
    } catch {
      setNodeStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [activeServer, nodeName]);

  const loadStorageAndDisks = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoadingStorage(true);
    try {
      const [storageData, disksData] = await Promise.all([
        window.api.proxmox.getNodeStorage(activeServer, nodeName),
        window.api.proxmox.getNodeDisks(activeServer, nodeName),
      ]);
      setStorages(storageData);
      setDisks(disksData);
    } catch {
      setStorages([]);
      setDisks([]);
    } finally {
      setLoadingStorage(false);
    }
  }, [activeServer, nodeName]);

  const loadNetwork = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoadingNetwork(true);
    try {
      const data = await window.api.proxmox.getNodeNetworks(activeServer, nodeName);
      setNetworks(data);
    } catch {
      setNetworks([]);
    } finally {
      setLoadingNetwork(false);
    }
  }, [activeServer, nodeName]);

  const loadTasks = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoadingTasks(true);
    try {
      const data = await window.api.proxmox.getNodeTasks(activeServer, nodeName, 100);
      setTasks(data);
    } catch {
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [activeServer, nodeName]);

  const loadSyslog = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoadingSyslog(true);
    try {
      const data = await window.api.proxmox.getNodeSyslog(activeServer, nodeName, 300);
      setSyslog(data);
    } catch {
      setSyslog([]);
    } finally {
      setLoadingSyslog(false);
    }
  }, [activeServer, nodeName]);

  const loadSingleTaskLog = useCallback(
    async (upid: string) => {
      if (!activeServer || !nodeName) return;
      setSelectedTaskUpid(upid);
      setLoadingTaskLog(true);
      try {
        const lines = await window.api.proxmox.getNodeTaskLog(activeServer, nodeName, upid);
        setTaskLog(lines);
      } catch {
        setTaskLog(['Помилка завантаження логу завдання']);
      } finally {
        setLoadingTaskLog(false);
      }
    },
    [activeServer, nodeName]
  );

  const loadUpdates = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoadingUpdates(true);
    setUpdateStatusMsg(null);
    try {
      if (window.api?.proxmox?.getNodeUpdates) {
        const list = await window.api.proxmox.getNodeUpdates(activeServer, nodeName);
        setUpdates(list);
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || 'Не вдалося отримати список оновлень Proxmox',
      });
    } finally {
      setLoadingUpdates(false);
    }
  }, [activeServer, nodeName]);

  const handleRefreshRepo = async () => {
    if (!activeServer || !nodeName) return;
    setRefreshingRepo(true);
    setUpdateStatusMsg(null);
    try {
      if (window.api?.proxmox?.refreshNodeUpdates) {
        const res = await window.api.proxmox.refreshNodeUpdates(activeServer, nodeName);
        if (res.success) {
          setUpdateStatusMsg({
            type: 'success',
            text: 'Запит apt update відправлено. Оновлення списку пакетів...',
          });
          setTimeout(loadUpdates, 3000);
        } else {
          setUpdateStatusMsg({
            type: 'error',
            text: res.error || 'Не вдалося оновити списки репозиторіїв',
          });
        }
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || 'Помилка виконання apt update',
      });
    } finally {
      setRefreshingRepo(false);
    }
  };

  const handleInstallSingle = async (pkgName: string) => {
    if (!effectiveProfile) {
      setUpdateStatusMsg({
        type: 'error',
        text: 'Не знайдено SSH інформації про хост Proxmox.',
      });
      return;
    }

    let pass = hostPassword || effectiveProfile.password;
    if (!pass) {
      pass = (await requestHostPassword()) || undefined;
      if (!pass) return;
    }

    setInstallingPkg(pkgName);
    setUpdateStatusMsg(null);
    try {
      if (window.api?.updates?.installUpdate) {
        const res = await window.api.updates.installUpdate(
          { ...effectiveProfile, password: pass },
          pkgName,
          pass
        );
        if (res.success) {
          setUpdateStatusMsg({
            type: 'success',
            text: `Пакет ${pkgName} успішно оновлено!`,
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
          setUpdateStatusMsg({
            type: 'error',
            text: res.error || `Не вдалося встановити ${pkgName}`,
          });
        }
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || 'Помилка оновлення пакета',
      });
    } finally {
      setInstallingPkg(null);
    }
  };

  const handleInstallAllSafe = async () => {
    if (!effectiveProfile) {
      setUpdateStatusMsg({
        type: 'error',
        text: 'Не знайдено інформації про хост Proxmox.',
      });
      return;
    }

    const safePkgs = updates.filter((u) => !isKernelOrReboot(u.package)).map((u) => u.package);
    if (safePkgs.length === 0) {
      setUpdateStatusMsg({
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
    setUpdateStatusMsg(null);
    setBatchProgress({
      current: 0,
      total: safePkgs.length,
      currentPackage: safePkgs[0],
      percent: 0,
    });

    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < safePkgs.length; i++) {
      const pkg = safePkgs[i];
      setBatchProgress({
        current: i + 1,
        total: safePkgs.length,
        currentPackage: pkg,
        percent: Math.round(((i + 1) / safePkgs.length) * 100),
      });

      try {
        if (window.api?.updates?.installUpdate) {
          const res = await window.api.updates.installUpdate(
            { ...effectiveProfile, password: pass },
            pkg,
            pass
          );
          if (res.success) {
            successCount++;
            setUpdates((prev) => prev.filter((u) => u.package !== pkg));
          } else {
            errors.push(`${pkg}: ${res.error || 'помилка'}`);
          }
        }
      } catch (err: any) {
        errors.push(`${pkg}: ${err.message || 'збій'}`);
      }
    }

    setInstallingAllSafe(false);
    setBatchProgress(null);

    if (errors.length === 0) {
      setUpdateStatusMsg({
        type: 'success',
        text: `Успішно оновлено всі безпечні пакети (${successCount})!`,
      });
    } else {
      setUpdateStatusMsg({
        type: 'error',
        text: `Оновлено: ${successCount}. Помилки у пакетах: ${errors.join(', ')}`,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOverview();
      loadStorageAndDisks();
      loadNetwork();
      loadTasks();
      loadSyslog();
      loadUpdates();
    }
  }, [isOpen, loadOverview, loadStorageAndDisks, loadNetwork, loadTasks, loadSyslog, loadUpdates]);

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks;
    const q = taskSearch.toLowerCase();
    return tasks.filter(
      (t) =>
        t.type?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        t.user?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q)
    );
  }, [tasks, taskSearch]);

  const filteredSyslog = useMemo(() => {
    return syslog.filter((item) => {
      const text = item.t || '';
      if (syslogFilter === 'error' && !/error|crit|fail|alert/i.test(text)) return false;
      if (syslogFilter === 'warn' && !/warn|error|fail/i.test(text)) return false;
      if (syslogSearch.trim() && !text.toLowerCase().includes(syslogSearch.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [syslog, syslogFilter, syslogSearch]);

  const filteredUpdates = useMemo(() => {
    if (!updateSearch.trim()) return updates;
    const q = updateSearch.toLowerCase();
    return updates.filter(
      (u) =>
        u.package.toLowerCase().includes(q) ||
        (u.description && u.description.toLowerCase().includes(q))
    );
  }, [updates, updateSearch]);

  const safeCount = useMemo(
    () => updates.filter((u) => !isKernelOrReboot(u.package)).length,
    [updates]
  );

  const rebootCount = useMemo(
    () => updates.filter((u) => isKernelOrReboot(u.package)).length,
    [updates]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate">
      <div className="bg-white dark:bg-[#1E1E20] w-full max-w-5xl h-[88vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden modal-animate">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-[#18181A]/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Адміністрування вузла: {nodeName}
                </h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  PVE Host
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {activeServer ? `${activeServer.name} (${activeServer.host})` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenTerminal && (
              <button
                onClick={onOpenTerminal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                title="Відкрити інтерактивний Shell термінал вузла"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Shell хоста</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1E1E20] overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Статус та ядро</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'storage'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Сховища та диски ({storages.length + disks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('network')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'network'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Мережеві мости ({networks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('updates')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'updates'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4 text-amber-500" />
            <div className="flex items-center gap-1.5">
              <span>Оновлення (APT)</span>
              {updates.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white leading-tight">
                  {updates.length}
                </span>
              )}
            </div>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Завдання кластера ({tasks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('syslog')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'syslog'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Системний журнал (Syslog)</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/50 dark:bg-[#161618]">
          {/* TAB 1: OVERVIEW & HARDWARE STATUS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {loadingStatus ? (
                <div className="py-20 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Завантаження інформації про статус вузла...</span>
                </div>
              ) : (
                <>
                  {/* Quick KPI stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* CPU Utilization & Spec */}
                    {(() => {
                      const cpuVal = typeof nodeStatus?.cpu === 'number' ? nodeStatus.cpu * 100 : 0;
                      const cpuPct = cpuVal.toFixed(1);
                      const cpuColor = cpuVal > 85 ? 'bg-rose-500' : cpuVal > 60 ? 'bg-amber-500' : 'bg-blue-500';
                      const textColor = cpuVal > 85 ? 'text-rose-500' : cpuVal > 60 ? 'text-amber-500' : 'text-blue-500';
                      const loadAvgStr = Array.isArray(nodeStatus?.loadavg) ? nodeStatus.loadavg.join(', ') : '';

                      return (
                        <div className="p-4 rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs">
                          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>Завантаження CPU</span>
                            <Cpu className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="mt-2 flex items-baseline justify-between">
                            <span className={`text-lg font-bold ${textColor}`}>
                              {cpuPct}%
                            </span>
                            {loadAvgStr && (
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono" title="Load Average (1, 5, 15 хв)">
                                LA: {loadAvgStr}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`${cpuColor} h-full rounded-full transition-all`}
                              style={{ width: `${Math.min(cpuVal, 100)}%` }}
                            />
                          </div>
                          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 truncate" title={nodeStatus?.cpuinfo?.model}>
                            {nodeStatus?.cpuinfo?.cpus || 1} CPU cores • {nodeStatus?.cpuinfo?.model || 'Процесор вузла'}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="p-4 rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs">
                      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Оперативна пам'ять (RAM)</span>
                        <Activity className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {formatBytes(nodeStatus?.memory?.used || 0)} / {formatBytes(nodeStatus?.memory?.total || 0)}
                      </div>
                      <div className="mt-1 w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              nodeStatus?.memory?.total ? ((nodeStatus.memory.used || 0) / nodeStatus.memory.total) * 100 : 0,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs">
                      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Файл підкачки (SWAP)</span>
                        <Layers className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {formatBytes(nodeStatus?.swap?.used || 0)} / {formatBytes(nodeStatus?.swap?.total || 0)}
                      </div>
                      <div className="mt-1 w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              nodeStatus?.swap?.total ? ((nodeStatus.swap.used || 0) / nodeStatus.swap.total) * 100 : 0,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* System & Kernel Detailed Table */}
                  <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
                    <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-xs text-zinc-700 dark:text-zinc-200 flex items-center justify-between">
                      <span>Системні відомості ядра та версій</span>
                      <button
                        onClick={loadOverview}
                        className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-xs font-mono">
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">Версія PVE Manager:</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{nodeStatus?.pveversion || 'Proxmox VE'}</span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">Версія ядра Linux (Kernel):</span>
                        <span className="text-zinc-800 dark:text-zinc-200">{nodeStatus?.kversion || '—'}</span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">Uptime вузла:</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {nodeStatus?.uptime ? `${Math.floor(nodeStatus.uptime / 86400)}д ${Math.floor((nodeStatus.uptime % 86400) / 3600)}г` : '—'}
                        </span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">Середнє навантаження (Load Average):</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {Array.isArray(nodeStatus?.loadavg) ? nodeStatus.loadavg.join(', ') : '—'}
                        </span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">Root Filesystem (/):</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {nodeStatus?.rootfs
                            ? `${formatBytes(nodeStatus.rootfs.used || 0)} / ${formatBytes(nodeStatus.rootfs.total || 0)} (${Math.round(
                                ((nodeStatus.rootfs.used || 0) / (nodeStatus.rootfs.total || 1)) * 100
                              )}%)`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: STORAGES & PHYSICAL DISKS */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              {/* Storages table */}
              <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
                <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500" />
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Сховища кластера (PVE Storage Pools)
                    </h4>
                  </div>
                  <button
                    onClick={loadStorageAndDisks}
                    className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStorage ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Статус</th>
                        <th className="px-4 py-2.5 font-medium">Сховище</th>
                        <th className="px-4 py-2.5 font-medium">Тип</th>
                        <th className="px-4 py-2.5 font-medium">Вміст (Content)</th>
                        <th className="px-4 py-2.5 font-medium">Заповненість</th>
                        <th className="px-4 py-2.5 font-medium text-right">Вільний простір</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                      {storages.map((s) => {
                        const pct = s.total ? Math.round((s.used / s.total) * 100) : 0;
                        return (
                          <tr key={s.storage} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  s.active
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                }`}
                              >
                                {s.active ? 'Активне' : 'Вимкнено'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 font-sans">
                              {s.storage}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500 uppercase text-[11px]">{s.type}</td>
                            <td className="px-4 py-2.5 text-zinc-500 text-[11px] font-sans truncate max-w-xs" title={s.content}>
                              {s.content}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-8 text-[11px]">{pct}%</span>
                                <div className="w-20 bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pct > 85 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium">
                              {formatBytes(s.avail)} / {formatBytes(s.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Physical Disks & SMART Table */}
              <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
                <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Фізичні диски та SMART стан ({disks.length})
                    </h4>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">SMART</th>
                        <th className="px-4 py-2.5 font-medium">Пристрій</th>
                        <th className="px-4 py-2.5 font-medium">Модель</th>
                        <th className="px-4 py-2.5 font-medium">Серійний №</th>
                        <th className="px-4 py-2.5 font-medium">Тип</th>
                        <th className="px-4 py-2.5 font-medium">Розмір</th>
                        <th className="px-4 py-2.5 text-right font-medium">Знос / Температура</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                      {disks.map((d) => {
                        const isGood = d.health === 'PASSED' || d.health === 'OK';
                        return (
                          <tr key={d.devpath} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isGood
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {d.health}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold text-zinc-900 dark:text-zinc-100">{d.devpath}</td>
                            <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300 font-sans">{d.model}</td>
                            <td className="px-4 py-2.5 text-zinc-400 text-[11px]">{d.serial || '—'}</td>
                            <td className="px-4 py-2.5 text-zinc-500 uppercase">{d.type}</td>
                            <td className="px-4 py-2.5 font-semibold">{formatBytes(d.size)}</td>
                            <td className="px-4 py-2.5 text-right font-sans">
                              {d.wearout !== undefined ? `Знос: ${d.wearout}%` : ''}
                              {d.temperature !== undefined ? ` ${d.temperature}°C` : ''}
                              {d.wearout === undefined && d.temperature === undefined ? '—' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NETWORKING & BRIDGES */}
          {activeTab === 'network' && (
            <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
              <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Мережеві інтерфейси вузла (Linux Bridges, Bonds, NICs)
                  </h4>
                </div>
                <button
                  onClick={loadNetwork}
                  className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingNetwork ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Стан</th>
                      <th className="px-4 py-2.5 font-medium">Інтерфейс</th>
                      <th className="px-4 py-2.5 font-medium">Тип</th>
                      <th className="px-4 py-2.5 font-medium">CIDR / IP адреса</th>
                      <th className="px-4 py-2.5 font-medium">Шлюз (Gateway)</th>
                      <th className="px-4 py-2.5 font-medium">Порти мосту (Bridge Ports)</th>
                      <th className="px-4 py-2.5 text-right font-medium">Коментар</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                    {networks.map((net) => (
                      <tr key={net.iface} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              net.active
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {net.active ? 'Active' : 'Down'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-zinc-900 dark:text-zinc-100">{net.iface}</td>
                        <td className="px-4 py-2.5 text-zinc-500 uppercase text-[11px]">{net.type}</td>
                        <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-semibold">
                          {net.cidr || net.address || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{net.gateway || '—'}</td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300 font-sans">
                          {net.bridge_ports || net.slaves || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 font-sans">{net.comments || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CLUSTER TASKS LOG */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Пошук завдань (qmstart, vzdump, user)..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1E1E20] text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={loadTasks}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTasks ? 'animate-spin' : ''}`} />
                  <span>Оновити задачі</span>
                </button>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Статус</th>
                        <th className="px-4 py-2.5 font-medium">Тип операції</th>
                        <th className="px-4 py-2.5 font-medium">ID сутності</th>
                        <th className="px-4 py-2.5 font-medium">Користувач</th>
                        <th className="px-4 py-2.5 font-medium">Час старту</th>
                        <th className="px-4 py-2.5 text-right font-medium">Лог</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                      {filteredTasks.map((t) => {
                        const isOk = !t.status || t.status === 'OK';
                        return (
                          <tr key={t.upid} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isOk
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {t.status || 'OK'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold text-zinc-900 dark:text-zinc-100">{t.type}</td>
                            <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400">{t.id || '—'}</td>
                            <td className="px-4 py-2.5 text-zinc-500 font-sans">{t.user}</td>
                            <td className="px-4 py-2.5 text-zinc-400 text-[11px]">
                              {new Date(t.starttime * 1000).toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => loadSingleTaskLog(t.upid)}
                                className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-zinc-700 dark:text-zinc-300 hover:text-blue-600 text-[11px] font-sans transition-colors cursor-pointer"
                              >
                                Переглянути лог
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Task Log Details Modal / Flyout */}
              {selectedTaskUpid && (
                <div className="p-4 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-800 font-mono text-xs shadow-lg space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-[11px] text-zinc-400 truncate max-w-lg">Лог UPID: {selectedTaskUpid}</span>
                    <button onClick={() => setSelectedTaskUpid(null)} className="text-zinc-400 hover:text-zinc-200">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {loadingTaskLog ? (
                    <div className="py-6 text-center text-zinc-500">Завантаження логу задачі...</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-0.5 text-[11px] leading-relaxed">
                      {taskLog.map((line, idx) => (
                        <div key={idx} className="whitespace-pre-wrap">{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SYSLOG REALTIME VIEWER */}
          {activeTab === 'syslog' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={syslogSearch}
                      onChange={(e) => setSyslogSearch(e.target.value)}
                      placeholder="Фільтр логів хоста..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1E1E20] text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
                    />
                  </div>
                  <select
                    value={syslogFilter}
                    onChange={(e: any) => setSyslogFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1E1E20] text-xs text-zinc-700 dark:text-zinc-300"
                  >
                    <option value="all">Усі записи</option>
                    <option value="warn">Попередження</option>
                    <option value="error">Лише помилки</option>
                  </select>
                </div>

                <button
                  onClick={loadSyslog}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSyslog ? 'animate-spin' : ''}`} />
                  <span>Оновити Syslog</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 text-zinc-200 font-mono text-[11px] border border-zinc-800 shadow-inner max-h-[520px] overflow-y-auto leading-relaxed select-text">
                {filteredSyslog.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500">Записів у журналі не знайдено</div>
                ) : (
                  filteredSyslog.map((item, idx) => {
                    const isErr = /error|crit|fail|alert/i.test(item.t);
                    const isWarn = !isErr && /warn/i.test(item.t);
                    return (
                      <div
                        key={idx}
                        className={`py-0.5 border-b border-zinc-900/60 ${
                          isErr ? 'text-rose-400 bg-rose-950/20' : isWarn ? 'text-amber-300' : 'text-zinc-300'
                        }`}
                      >
                        {item.t}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 6: NODE APT UPDATES */}
          {activeTab === 'updates' && (
            <div className="space-y-4">
              {/* Status Message */}
              {updateStatusMsg && (
                <div
                  className={`px-4 py-2.5 rounded-xl border text-xs flex items-center gap-2 transition-colors ${
                    updateStatusMsg.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
                  }`}
                >
                  {updateStatusMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="flex-1">{updateStatusMsg.text}</span>
                  <button
                    onClick={() => setUpdateStatusMsg(null)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Toolbar */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={updateSearch}
                      onChange={(e) => setUpdateSearch(e.target.value)}
                      placeholder="Пошук пакетів (pve, qemu, kernel...)"
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
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
                  <button
                    type="button"
                    onClick={handleRefreshRepo}
                    disabled={refreshingRepo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                    title="Оновити список пакетів з репозиторіїв (apt update)"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingRepo ? 'animate-spin text-amber-500' : ''}`} />
                    <span>{refreshingRepo ? 'Оновлення індексу...' : 'apt update'}</span>
                  </button>

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
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1E1E20] shadow-xs">
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
              <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
                {loadingUpdates && updates.length === 0 ? (
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
                        className="flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors gap-3"
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
            </div>
          )}
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
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Потрібен пароль хоста</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Для автентифікації на вузлі через SSH
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