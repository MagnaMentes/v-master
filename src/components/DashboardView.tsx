import React, { useState, useEffect } from 'react';
import {
  Server,
  HardDrive,
  Cpu,
  Activity,
  Terminal,
  Play,
  Square,
  RotateCcw,
  Plus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Lock,
  ArrowUpCircle,
  ExternalLink,
  Settings,
  Layers,
  AlertTriangle,
  RefreshCw,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ServerModal } from './ServerModal';
import { NodeServicesModal } from './NodeServicesModal';
import { NodeAdminModal } from './NodeAdminModal';
import type { ProxmoxVM } from '../types';

export const DashboardView: React.FC = () => {
  const {
    activeServer,
    nodes,
    vms,
    vmAlerts,
    vmUpdates,
    vmOSMetrics,
    fetchVMOSMetrics,
    selectVM,
    saveServer,
    openTerminalForVM,
    openTerminalForNode,
    refreshClusterData,
    checkVMUpdates,
  } = useApp();

  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isEditServerModalOpen, setIsEditServerModalOpen] = useState(false);
  const [selectedNodeServices, setSelectedNodeServices] = useState<string | null>(null);
  const [selectedNodeAdmin, setSelectedNodeAdmin] = useState<string | null>(null);
  const [confirmNodeAction, setConfirmNodeAction] = useState<{ node: string; action: 'reboot' | 'shutdown' } | null>(null);
  const [confirmNodeInputText, setConfirmNodeInputText] = useState('');
  const [confirmVMAction, setConfirmVMAction] = useState<{ vm: ProxmoxVM; action: 'stop' | 'reboot' } | null>(null);
  const [isNodeActionLoading, setIsNodeActionLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [isInactiveCollapsed, setIsInactiveCollapsed] = useState(true);

  // Batch actions state
  const [selectedVMIds, setSelectedVMIds] = useState<number[]>([]);
  const [isBatchExecuting, setIsBatchExecuting] = useState(false);
  const [batchProgressMsg, setBatchProgressMsg] = useState<string | null>(null);

  const sortedVMs = [...vms].sort((a, b) => a.vmid - b.vmid);
  const runningVMs = sortedVMs.filter((v) => v.status === 'running');
  const stoppedVMs = sortedVMs.filter((v) => v.status !== 'running');

  useEffect(() => {
    for (const vm of vms) {
      if (vm.status === 'running') {
        fetchVMOSMetrics(vm.vmid);
      }
    }
  }, [vms, fetchVMOSMetrics]);

  // Cluster CPU & RAM calculation
  const totalCpuUsage = nodes.reduce((acc, n) => acc + (n.cpu || 0), 0) / (nodes.length || 1);
  const totalMem = nodes.reduce((acc, n) => acc + (n.maxmem || 0), 0);
  const usedMem = nodes.reduce((acc, n) => acc + (n.mem || 0), 0);
  const memPercentage = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

  const handleBatchAction = async (action: 'start' | 'stop' | 'reboot' | 'check-updates') => {
    if (!activeServer || selectedVMIds.length === 0) return;
    const targetVMs = vms.filter((v) => selectedVMIds.includes(v.vmid));
    setIsBatchExecuting(true);

    try {
      if (action === 'check-updates') {
        setBatchProgressMsg('Сканування оновлень ОС...');
        for (const vm of targetVMs) {
          if (vm.status === 'running') {
            await checkVMUpdates(vm.vmid);
          }
        }
      } else {
        for (let i = 0; i < targetVMs.length; i++) {
          const vm = targetVMs[i];
          const actionText = action === 'start' ? 'Запуск' : action === 'stop' ? 'Зупинка' : 'Перезапуск';
          setBatchProgressMsg(`${actionText} ${vm.name} (${i + 1}/${targetVMs.length})...`);
          await window.api.proxmox.executeVMAction(activeServer, vm.node, vm.vmid, action, vm.type);
        }
        setTimeout(() => refreshClusterData(), 1200);
      }
    } catch (err: any) {
      console.error('Batch action error:', err);
    } finally {
      setIsBatchExecuting(false);
      setBatchProgressMsg(null);
    }
  };

  const handleQuickPowerAction = async (vm: ProxmoxVM, action: 'start' | 'stop' | 'reboot') => {
    if (!activeServer) return;
    if (action === 'stop' || action === 'reboot') {
      setConfirmVMAction({ vm, action });
      return;
    }

    setActionLoading(vm.vmid);
    try {
      await window.api.proxmox.executeVMAction(activeServer, vm.node, vm.vmid, action, vm.type);
      await refreshClusterData();
    } catch (e: any) {
      alert(`Помилка виконання дії: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const executeConfirmedVMAction = async (vm: ProxmoxVM, action: 'stop' | 'reboot') => {
    if (!activeServer) return;
    setActionLoading(vm.vmid);
    try {
      await window.api.proxmox.executeVMAction(activeServer, vm.node, vm.vmid, action, vm.type);
      await refreshClusterData();
    } catch (e: any) {
      alert(`Помилка виконання дії: ${e.message}`);
    } finally {
      setActionLoading(null);
      setConfirmVMAction(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}д ${h}год`;
    if (h > 0) return `${h}год ${m}хв`;
    return `${m}хв`;
  };

  const renderVMRow = (vm: ProxmoxVM, isDimmed: boolean = false) => {
    const isRunning = vm.status === 'running';
    const cpuUsage = vm.cpu ? (vm.cpu * 100).toFixed(1) : '0.0';
    const osMetric = vmOSMetrics[vm.vmid];
    const ramPct = osMetric
      ? osMetric.percent.toFixed(1)
      : vm.freemem !== undefined && vm.freemem > 0 && vm.maxmem && vm.freemem <= vm.maxmem
      ? (((vm.maxmem - vm.freemem) / vm.maxmem) * 100).toFixed(1)
      : vm.maxmem
      ? (((vm.mem || 0) / vm.maxmem) * 100).toFixed(1)
      : '0.0';
    const actualMemBytes = osMetric
      ? osMetric.usedBytes
      : vm.freemem !== undefined && vm.freemem > 0 && vm.maxmem && vm.freemem <= vm.maxmem
      ? vm.maxmem - vm.freemem
      : vm.mem || 0;
    const totalMemBytes = osMetric ? osMetric.totalBytes : vm.maxmem || 1;
    const ip = vm.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : '—';

    const isSelected = selectedVMIds.includes(vm.vmid);

    return (
      <tr
        key={vm.vmid}
        onClick={() => selectVM(vm)}
        className={`hover:bg-zinc-50 dark:hover:bg-zinc-700/30 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50/60 dark:bg-blue-950/30'
            : isDimmed
            ? 'opacity-80 dark:opacity-75 bg-zinc-50/40 dark:bg-zinc-900/20'
            : ''
        }`}
      >
        <td className="w-8 pl-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {
              setSelectedVMIds((prev) =>
                prev.includes(vm.vmid) ? prev.filter((id) => id !== vm.vmid) : [...prev, vm.vmid]
              );
            }}
            className="rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
          />
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isRunning
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : vm.status === 'paused'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
            {isRunning ? 'Running' : vm.status === 'paused' ? 'Paused' : 'Stopped'}
          </span>
        </td>
        <td className="px-4 py-3 font-mono font-medium">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase ${
                vm.type === 'lxc'
                  ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                  : 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              {vm.type === 'lxc' ? 'CT' : 'VM'}
            </span>
            <span>{vm.vmid}</span>
          </div>
        </td>
        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
          <div className="flex items-center gap-1.5">
            <span>{vm.name}</span>
            {vmAlerts[vm.vmid]?.hasAlert && (
              <span
                title={`Високе навантаження: CPU ${vmAlerts[vm.vmid].cpuPercent}%, RAM ${vmAlerts[vm.vmid].ramPercent}%`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  vmAlerts[vm.vmid].severity === 'critical'
                    ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 animate-pulse'
                    : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                }`}
              >
                <Flame className="w-2.5 h-2.5" />
                <span>{vmAlerts[vm.vmid].severity === 'critical' ? 'Високе навантаження' : 'Увага'}</span>
              </span>
            )}
            {vmUpdates[vm.vmid]?.isLoading && (
              <span
                title="Перевірка оновлень ОС..."
                className="inline-flex items-center justify-center p-1 text-zinc-400 dark:text-zinc-500 shrink-0"
              >
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              </span>
            )}
            {vmUpdates[vm.vmid]?.hasCritical && (
              <span
                title="Критичні оновлення ОС потребують уваги!"
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-rose-500 text-white font-bold text-[9px] shrink-0 animate-pulse shadow-xs"
              >
                !
              </span>
            )}
            {vmUpdates[vm.vmid]?.hasDangerousOnly && !vmUpdates[vm.vmid]?.hasCritical && (
              <span
                title="Є заблоковані оновлення високого ризику (ядро/GRUB). Потребують ручного оновлення зі снапшотом."
                className="inline-flex items-center justify-center p-1 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 shadow-2xs shrink-0"
              >
                <Lock className="w-2.5 h-2.5" />
              </span>
            )}
            {!vmUpdates[vm.vmid]?.hasCritical && (vmUpdates[vm.vmid]?.safeCount || 0) > 0 && (
              <span
                title={`Доступно ${vmUpdates[vm.vmid].safeCount} дозволених оновлень`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-2xs shrink-0"
              >
                <ArrowUpCircle className="w-2.5 h-2.5" />
                <span>{vmUpdates[vm.vmid].safeCount}</span>
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-zinc-500">{vm.node}</td>
        <td className="px-4 py-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
          {ip}
        </td>
        <td className="px-4 py-3">
          {isRunning ? (
            <div className="flex items-center gap-1.5">
              <span className="w-9 font-mono">{cpuUsage}%</span>
              <div className="w-14 bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{ width: `${Math.min(Number(cpuUsage), 100)}%` }}
                />
              </div>
            </div>
          ) : (
            '—'
          )}
        </td>
        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
          {isRunning && (vm.mem || osMetric) && (vm.maxmem || osMetric) ? (
            <div
              className="flex items-center gap-1.5 cursor-default"
              title={
                osMetric
                  ? `Оперативна пам'ять ОС: ${formatBytes(actualMemBytes)} / ${formatBytes(totalMemBytes)} (${ramPct}%)`
                  : vm.freemem !== undefined && vm.freemem > 0
                  ? `Оперативна пам'ять (Ballooning): ${formatBytes(actualMemBytes)} / ${formatBytes(totalMemBytes)} (${ramPct}%)`
                  : `Оперативна пам'ять (KVM Host): ${formatBytes(actualMemBytes)} / ${formatBytes(totalMemBytes)} (${ramPct}%)`
              }
            >
              <span className="w-9 font-mono">{ramPct}%</span>
              <div className="w-14 bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden shrink-0">
                <div
                  className={`${
                    Number(ramPct) >= 90
                      ? 'bg-rose-500'
                      : Number(ramPct) >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  } h-full rounded-full transition-all`}
                  style={{ width: `${Math.min(Number(ramPct), 100)}%` }}
                />
              </div>
              {osMetric && (
                <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 px-1 py-0.2 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800">
                  ОС
                </span>
              )}
            </div>
          ) : (
            '—'
          )}
        </td>
        <td className="px-4 py-3 text-zinc-500">{formatUptime(vm.uptime)}</td>
        <td className="px-4 py-3 text-right">
          <div
            className="inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {isRunning ? (
              <>
                <button
                  onClick={() => openTerminalForVM(vm, 'ssh')}
                  title="Відкрити SSH термінал Ubuntu"
                  className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-blue-400 transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={actionLoading === vm.vmid}
                  onClick={() => handleQuickPowerAction(vm, 'reboot')}
                  title="Перезавантажити ВМ"
                  className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-amber-600 dark:text-amber-400 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={actionLoading === vm.vmid}
                  onClick={() => handleQuickPowerAction(vm, 'stop')}
                  title="Зупинити ВМ"
                  className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-red-600 dark:text-red-400 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                disabled={actionLoading === vm.vmid}
                onClick={() => handleQuickPowerAction(vm, 'start')}
                title="Запустити ВМ"
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-emerald-600 dark:text-emerald-400 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (!activeServer) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-zinc-50 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400 shadow-sm">
          <Server className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Ласкаво просимо до V-Master</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-6">
          Додайте ваш сервер або кластер Proxmox VE для моніторингу та зручного адміністрування віртуальних машин Ubuntu.
        </p>
        <button
          onClick={() => setIsServerModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" />
          <span>Підключити сервер Proxmox</span>
        </button>

        <ServerModal
          isOpen={isServerModalOpen}
          onClose={() => setIsServerModalOpen(false)}
          onSave={saveServer}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50 dark:bg-[#18181B] text-zinc-800 dark:text-zinc-100 select-none">
      {/* Top Banner / Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Огляд кластера</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {activeServer ? `${activeServer.name} (${activeServer.host})` : 'Сервер не вибрано'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeServer && (
            <>
              <button
                type="button"
                onClick={() => {
                  const url = `https://${activeServer.host}:${activeServer.port}`;
                  if (window.api?.system?.openExternal) {
                    window.api.system.openExternal(url);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                title={`Відкрити веб-панель Proxmox (${activeServer.host}) у браузері`}
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                <span>Веб-інтерфейс Proxmox</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditServerModalOpen(true)}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                title="Налаштування сервера"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => refreshClusterData()}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors cursor-pointer"
              >
                Оновити
              </button>
            </>
          )}
          <button
            onClick={() => setIsServerModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Додати сервер</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Вузли онлайн</span>
            <Server className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {nodes.filter((n) => n.status === 'online').length} / {nodes.length}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Кластер активний</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Всі ВМ</span>
            <HardDrive className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{vms.length}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="text-emerald-500 font-medium">{runningVMs.length} активні</span>
            <span className="text-zinc-400">•</span>
            <span className="text-zinc-400">{stoppedVMs.length} вимкнені</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Використання CPU</span>
            <Cpu className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{(totalCpuUsage * 100).toFixed(1)}%</div>
          <div className="mt-1 w-full bg-zinc-100 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all"
              style={{ width: `${Math.min(totalCpuUsage * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-medium">Використання RAM</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{memPercentage.toFixed(1)}%</div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
            <span>{formatBytes(usedMem)}</span>
            <span>{formatBytes(totalMem)}</span>
          </div>
        </div>
      </div>

      {/* Proxmox Nodes & Cluster Admin Section */}
      <div className="rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-700/80 flex items-center justify-between bg-zinc-50/50 dark:bg-[#202024]/50">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Список вузлів Proxmox</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {nodes.length} {nodes.length === 1 ? 'вузол' : 'вузлів'}
            </span>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Керування службами гіпервізора, терміналом Shell та живленням
          </span>
        </div>

        {nodes.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400">
            Вузлів не знайдено на вибраному сервері
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700/80">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                  <th className="px-4 py-2.5 font-medium">Назва вузла</th>
                  <th className="px-4 py-2.5 font-medium">Хост / IP</th>
                  <th className="px-4 py-2.5 font-medium">CPU %</th>
                  <th className="px-4 py-2.5 font-medium">RAM %</th>
                  <th className="px-4 py-2.5 font-medium">Uptime</th>
                  <th className="px-4 py-2.5 font-medium text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {nodes.map((n) => {
                  const isOnline = n.status === 'online';
                  const cpuPct = n.cpu ? (n.cpu * 100).toFixed(1) : '0.0';
                  const ramPct = n.maxmem && n.mem ? ((n.mem / n.maxmem) * 100).toFixed(1) : '0.0';

                  return (
                    <tr
                      key={n.node}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isOnline
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                            }`}
                          />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        <div className="flex items-center gap-2">
                          <Server className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold">{n.node}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            Host
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {activeServer.host}
                      </td>
                      <td className="px-4 py-3">
                        {isOnline ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-9 font-mono">{cpuPct}%</span>
                            <div className="w-14 bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  Number(cpuPct) > 85 ? 'bg-rose-500' : Number(cpuPct) > 60 ? 'bg-amber-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${Math.min(Number(cpuPct), 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {isOnline && n.mem && n.maxmem ? (
                          <div
                            className="flex items-center gap-1.5 cursor-default"
                            title={`Оперативна пам'ять: ${formatBytes(n.mem)} / ${formatBytes(n.maxmem)} (${ramPct}%)`}
                          >
                            <span className="w-9 font-mono">{ramPct}%</span>
                            <div className="w-14 bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  Number(ramPct) > 90 ? 'bg-rose-500' : Number(ramPct) > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(Number(ramPct), 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{formatUptime(n.uptime)}</td>
                      <td className="px-4 py-3 text-right">
                        <div
                          className="inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedNodeAdmin(n.node)}
                            title="Адміністрування вузла (Сховища, Диски, Мережа, Оновлення, Завдання, Syslog)"
                            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openTerminalForNode(n.node)}
                            title="Відкрити Shell вузла Proxmox"
                            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedNodeServices(n.node)}
                            title="Служби Proxmox"
                            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmNodeAction({ node: n.node, action: 'reboot' })}
                            title="Перезавантажити вузол"
                            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick VMs Table */}
      <div className="rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-700/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Список віртуальних машин</h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{vms.length} знайдено</span>
        </div>

        {vms.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400">
            Віртуальних машин не знайдено на вибраному сервері
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700/80">
                <tr>
                  <th className="w-8 pl-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={vms.length > 0 && selectedVMIds.length === vms.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVMIds(vms.map((v) => v.vmid));
                        } else {
                          setSelectedVMIds([]);
                        }
                      }}
                      title="Вибрати всі віртуальні машини"
                      className="rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                  <th className="px-4 py-2.5 font-medium">VMID</th>
                  <th className="px-4 py-2.5 font-medium">Назва</th>
                  <th className="px-4 py-2.5 font-medium">Вузол</th>
                  <th className="px-4 py-2.5 font-medium">IP адреса</th>
                  <th className="px-4 py-2.5 font-medium">CPU %</th>
                  <th className="px-4 py-2.5 font-medium">RAM %</th>
                  <th className="px-4 py-2.5 font-medium">Uptime</th>
                  <th className="px-4 py-2.5 font-medium text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {/* Active VMs sorted by VMID */}
                {runningVMs.map((vm) => renderVMRow(vm, false))}

                {runningVMs.length === 0 && stoppedVMs.length > 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-4 text-center text-xs text-zinc-400">
                      Немає активних віртуальних машин
                    </td>
                  </tr>
                )}

                {/* Collapsible Inactive VMs at the bottom */}
                {stoppedVMs.length > 0 && (
                  <>
                    <tr className="bg-zinc-100/70 dark:bg-zinc-800/40 border-t border-zinc-200 dark:border-zinc-700/80">
                      <td colSpan={10} className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setIsInactiveCollapsed(!isInactiveCollapsed)}
                          className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-full text-left cursor-pointer select-none"
                        >
                          {isInactiveCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <span>Неактивні віртуальні машини ({stoppedVMs.length})</span>
                          <span className="text-[10px] text-zinc-400 font-normal">
                            ({isInactiveCollapsed ? 'згорнуто, натисніть для перегляду' : 'розгорнуто'})
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isInactiveCollapsed && stoppedVMs.map((vm) => renderVMRow(vm, true))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Node Services Modal */}
      {selectedNodeServices && (
        <NodeServicesModal
          isOpen={Boolean(selectedNodeServices)}
          onClose={() => setSelectedNodeServices(null)}
          nodeName={selectedNodeServices}
        />
      )}

      {/* Node Admin Modal (Storage, Disks, Networks, Updates, Tasks, Syslog) */}
      {selectedNodeAdmin && (
        <NodeAdminModal
          isOpen={Boolean(selectedNodeAdmin)}
          onClose={() => setSelectedNodeAdmin(null)}
          nodeName={selectedNodeAdmin}
          onOpenTerminal={() => openTerminalForNode(selectedNodeAdmin)}
        />
      )}

      {/* Add New Server Modal */}
      {isServerModalOpen && (
        <ServerModal
          isOpen={isServerModalOpen}
          onClose={() => setIsServerModalOpen(false)}
          onSave={saveServer}
        />
      )}

      {/* Edit Server Modal */}
      {isEditServerModalOpen && activeServer && (
        <ServerModal
          isOpen={isEditServerModalOpen}
          onClose={() => setIsEditServerModalOpen(false)}
          onSave={saveServer}
          initialServer={activeServer}
        />
      )}

      {/* Confirm Node Reboot Modal */}
      {confirmNodeAction && (() => {
        const runningVMsOnNode = vms.filter((v) => v.node === confirmNodeAction.node && v.status === 'running');
        const hasRunningVMs = runningVMsOnNode.length > 0;
        const isConfirmDisabled = isNodeActionLoading || (hasRunningVMs && confirmNodeInputText.trim() !== confirmNodeAction.node);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate">
            <div className="bg-white dark:bg-[#202023] w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-5 flex flex-col gap-4 modal-animate">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {confirmNodeAction.action === 'shutdown' ? 'Вимкнення вузла' : 'Перезавантаження вузла'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Вузол: {confirmNodeAction.node}
                  </p>
                </div>
              </div>

              <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed space-y-2">
                <p>
                  Ви впевнені, що бажаєте {confirmNodeAction.action === 'shutdown' ? 'вимкнути' : 'перезавантажити'} весь фізичний сервер Proxmox <strong>{confirmNodeAction.node}</strong>?
                </p>
                {hasRunningVMs ? (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-[11px]">
                    <strong>Критична дія:</strong> На цьому вузлі зараз працює <strong>{runningVMsOnNode.length}</strong> активних віртуальних машин/контейнерів. Вони будуть аварійно зупинені!
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    На вузлі немає активних віртуальних машин.
                  </p>
                )}
              </div>

              {hasRunningVMs && (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Введіть <strong>{confirmNodeAction.node}</strong> для підтвердження:
                  </label>
                  <input
                    type="text"
                    value={confirmNodeInputText}
                    onChange={(e) => setConfirmNodeInputText(e.target.value)}
                    placeholder={confirmNodeAction.node}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700/60">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmNodeAction(null);
                    setConfirmNodeInputText('');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  disabled={isConfirmDisabled}
                  onClick={async () => {
                    if (!activeServer || !confirmNodeAction) return;
                    setIsNodeActionLoading(true);
                    try {
                      await window.api.proxmox.executeNodeAction(activeServer, confirmNodeAction.node, confirmNodeAction.action);
                      setConfirmNodeAction(null);
                      setConfirmNodeInputText('');
                      await refreshClusterData();
                    } catch (e: any) {
                      alert(`Помилка: ${e.message}`);
                    } finally {
                      setIsNodeActionLoading(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isNodeActionLoading ? 'Виконання...' : 'Підтвердити'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm VM Power Action Modal */}
      {confirmVMAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate">
          <div className="bg-white dark:bg-[#202023] w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-5 flex flex-col gap-4 modal-animate">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl ${
                  confirmVMAction.action === 'stop'
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {confirmVMAction.action === 'stop' ? 'Примусова зупинка (Hard Stop)' : 'Перезавантаження ВМ'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {confirmVMAction.vm.name} (VMID: {confirmVMAction.vm.vmid})
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {confirmVMAction.action === 'stop'
                ? `Ви впевнені, що бажаєте примусово зупинити ВМ "${confirmVMAction.vm.name}"? Увага: це аналог раптового знеструмлення, незбережені дані та стан баз даних можуть бути пошкоджені.`
                : `Ви впевнені, що бажаєте надіслати команду перезавантаження для ВМ "${confirmVMAction.vm.name}"?`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700/60">
              <button
                type="button"
                onClick={() => setConfirmVMAction(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={actionLoading === confirmVMAction.vm.vmid}
                onClick={() => executeConfirmedVMAction(confirmVMAction.vm, confirmVMAction.action)}
                className={`px-4 py-1.5 rounded-lg text-xs text-white font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                  confirmVMAction.action === 'stop'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {actionLoading === confirmVMAction.vm.vmid ? 'Виконання...' : 'Підтвердити'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Batch Action Bar */}
      {selectedVMIds.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 mx-auto z-40 max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="bg-white/95 dark:bg-[#202024]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 shadow-2xl rounded-2xl p-3 text-zinc-900 dark:text-zinc-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-semibold">
                  Вибрано {selectedVMIds.length} {selectedVMIds.length === 1 ? 'ВМ' : selectedVMIds.length < 5 ? 'ВМ' : 'ВМ'}
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-700 pl-3 text-[11px] text-zinc-500">
                <button
                  type="button"
                  onClick={() => setSelectedVMIds(runningVMs.map((v) => v.vmid))}
                  className="hover:text-blue-500 underline cursor-pointer"
                >
                  Запущені ({runningVMs.length})
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSelectedVMIds(stoppedVMs.map((v) => v.vmid))}
                  className="hover:text-blue-500 underline cursor-pointer"
                >
                  Зупинені ({stoppedVMs.length})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isBatchExecuting ? (
                <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 px-3 py-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{batchProgressMsg || 'Виконання групової операції...'}</span>
                </div>
              ) : (
                <>
                  {/* Start action for stopped VMs */}
                  {selectedVMIds.some((id) => stoppedVMs.some((v) => v.vmid === id)) && (
                    <button
                      type="button"
                      onClick={() => handleBatchAction('start')}
                      title="Запустити всі вибрані зупинені ВМ"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Запустити</span>
                    </button>
                  )}

                  {/* Reboot action for running VMs */}
                  {selectedVMIds.some((id) => runningVMs.some((v) => v.vmid === id)) && (
                    <button
                      type="button"
                      onClick={() => handleBatchAction('reboot')}
                      title="Перезавантажити всі вибрані активні ВМ"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Перезапуск</span>
                    </button>
                  )}

                  {/* Stop action for running VMs */}
                  {selectedVMIds.some((id) => runningVMs.some((v) => v.vmid === id)) && (
                    <button
                      type="button"
                      onClick={() => handleBatchAction('stop')}
                      title="Зупинити всі вибрані активні ВМ"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Зупинити</span>
                    </button>
                  )}

                  {/* Check updates for running VMs */}
                  {selectedVMIds.some((id) => runningVMs.some((v) => v.vmid === id)) && (
                    <button
                      type="button"
                      onClick={() => handleBatchAction('check-updates')}
                      title="Опитати стан оновлень ОС для вибраних ВМ"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Оновлення</span>
                    </button>
                  )}

                  {/* Deselect all button */}
                  <button
                    type="button"
                    onClick={() => setSelectedVMIds([])}
                    title="Зняти вибір (Esc)"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
