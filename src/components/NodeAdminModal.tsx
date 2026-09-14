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
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type {
  ProxmoxNodeStorage,
  ProxmoxNodeDisk,
  ProxmoxNodeTask,
  ProxmoxNodeNetwork,
  ProxmoxSyslogItem,
} from '../types';

interface NodeAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
  onOpenTerminal?: () => void;
}

type TabType = 'overview' | 'storage' | 'network' | 'tasks' | 'syslog';

export const NodeAdminModal: React.FC<NodeAdminModalProps> = ({
  isOpen,
  onClose,
  nodeName,
  onOpenTerminal,
}) => {
  const { activeServer } = useApp();
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

  useEffect(() => {
    if (isOpen) {
      loadOverview();
      loadStorageAndDisks();
      loadNetwork();
      loadTasks();
      loadSyslog();
    }
  }, [isOpen, loadOverview, loadStorageAndDisks, loadNetwork, loadTasks, loadSyslog]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 modal-animate">
      <div className="bg-white dark:bg-[#1E1E20] w-full max-w-5xl h-[88vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
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
        </div>
      </div>
    </div>
  );
};