import React, { useEffect, useState, useCallback } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  Terminal,
  Camera,
  Key,
  Cpu,
  Activity,
  HardDrive,
  Network,
  Trash2,
  Undo2,
  Plus,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  ArrowUpCircle,
  Lock,
  X,
  Flame,
  Download,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { SSHProfileModal } from './SSHProfileModal';
import { ResourceDiagnosticsModal } from './ResourceDiagnosticsModal';
import type { VMMetrics, VMSnapshot, SSHProfile } from '../types';

export const VMDetailView: React.FC = () => {
  const {
    activeServer,
    selectedVM,
    sshProfiles,
    vmUpdates,
    vmAlerts,
    vmOSMetrics,
    updateVMOSMetrics,
    checkVMUpdates,
    installVMUpdate,
    installAllSafeVMUpdates,
    saveSSHProfile,
    openTerminalForVM,
    refreshClusterData,
  } = useApp();

  const [metrics, setMetrics] = useState<VMMetrics | null>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState<boolean>(selectedVM?.status === 'running');
  const [snapshots, setSnapshots] = useState<VMSnapshot[]>([]);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  // New Snapshot modal state
  const [isCreateSnapOpen, setIsCreateSnapOpen] = useState(false);
  const [snapName, setSnapName] = useState('');
  const [snapDesc, setSnapDesc] = useState('');
  const [snapIncludeRam, setSnapIncludeRam] = useState(true);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({ isOpen: false, title: '', message: '', action: async () => {} });

  const [updatingPackage, setUpdatingPackage] = useState<string | null>(null);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [locallyInstalled, setLocallyInstalled] = useState<Record<number, string[]>>({});
  const [liveOSMem, setLiveOSMem] = useState<{
    used: string;
    total: string;
    available: string;
    usedBytes?: number;
    totalBytes?: number;
    percent?: number;
  } | null>(null);
  const [isInstallingAgent, setIsInstallingAgent] = useState(false);

  useEffect(() => {
    if (!updateStatusMsg) return;
    // Success messages dismiss in 4 seconds, errors stay longer (12 seconds) so the user has time to read
    const duration = updateStatusMsg.type === 'error' ? 12000 : 4000;
    const timer = setTimeout(() => {
      setUpdateStatusMsg(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [updateStatusMsg]);

  const [sudoPassword, setSudoPassword] = useState<string>('');
  const [sudoModal, setSudoModal] = useState<{
    isOpen: boolean;
    callback: (password: string) => Promise<void>;
  }>({ isOpen: false, callback: async () => {} });
  const [tempSudoInput, setTempSudoInput] = useState('');

  const requestSudoPassword = (): Promise<string | null> => {
    // If profile already has password or we already stored it this session, use it
    if (sudoPassword) return Promise.resolve(sudoPassword);
    if (existingSSHProfile?.password) return Promise.resolve(existingSSHProfile.password);

    return new Promise((resolve) => {
      setTempSudoInput('');
      setSudoModal({
        isOpen: true,
        callback: async (pass: string) => {
          setSudoPassword(pass);
          resolve(pass);
        },
      });
    });
  };

  const handleInstallSingleUpdate = async (pkgName: string) => {
    if (!selectedVM) return;

    let pass = sudoPassword || existingSSHProfile?.password;
    if (!pass && existingSSHProfile?.username !== 'root') {
      pass = (await requestSudoPassword()) || undefined;
      if (!pass) return;
    }

    setUpdatingPackage(pkgName);
    setUpdateStatusMsg(null);
    try {
      const res = await installVMUpdate(selectedVM.vmid, pkgName, pass);
      if (res.success) {
        setLocallyInstalled((prev) => ({
          ...prev,
          [selectedVM.vmid]: [...(prev[selectedVM.vmid] || []), pkgName],
        }));
        checkVMUpdates(selectedVM.vmid);
        setUpdateStatusMsg({ type: 'success', text: `Компонент ${pkgName} успішно оновлено!` });
      } else {
        if (res.error?.includes('password is required') || res.error?.includes('incorrect password')) {
          setSudoPassword('');
          // Re-ask password
          requestSudoPassword().then(async (newPass) => {
            if (newPass) {
              await handleInstallSingleUpdate(pkgName);
            }
          });
          return;
        }
        setUpdateStatusMsg({ type: 'error', text: res.error || `Помилка оновлення ${pkgName}` });
      }
    } finally {
      setUpdatingPackage(null);
    }
  };

  const [isClearingCache, setIsClearingCache] = useState(false);

  const handleDropCaches = async () => {
    if (!existingSSHProfile || !existingSSHProfile.username) {
      setIsSSHModalOpen(true);
      setUpdateStatusMsg({
        type: 'error',
        text: 'Для цієї ВМ ще не налаштовано SSH-профіль. Будь ласка, збережіть користувача та авторизацію для виконання операцій.',
      });
      return;
    }

    const profile: SSHProfile = {
      ...existingSSHProfile,
      host: existingSSHProfile.host || primaryIp || '',
    };

    if (!profile.host) {
      setUpdateStatusMsg({
        type: 'error',
        text: 'Не знайдено IP-адресу для підключення до ВМ.',
      });
      return;
    }

    let pass = sudoPassword || profile.password;
    if (!pass && profile.username !== 'root') {
      pass = (await requestSudoPassword()) || undefined;
      if (!pass) return;
    }

    setIsClearingCache(true);
    setUpdateStatusMsg(null);
    try {
      if (window.api?.diagnostics?.manageProcess) {
        const res = await window.api.diagnostics.manageProcess(profile, 'drop-caches', '', pass);
        if (res.success) {
          setUpdateStatusMsg({
            type: 'success',
            text: 'Системний кеш Linux (Page Cache & Buffers) успішно очищено!',
          });
          // Also fetch fresh in-OS memory status to update UI immediately
          try {
            if (window.api?.diagnostics?.getDiagnostics) {
              const diagRes = await window.api.diagnostics.getDiagnostics(profile);
              if (diagRes.success && diagRes.data) {
                setLiveOSMem({
                  used: diagRes.data.memUsed,
                  total: diagRes.data.memTotal,
                  available: diagRes.data.memAvailable || diagRes.data.memFree,
                });
              }
            }
          } catch {
            // Non-critical
          }
          // Refresh VM metrics from Proxmox
          setTimeout(() => {
            loadVMMetrics();
            refreshClusterData(true);
          }, 800);
        } else {
          setUpdateStatusMsg({
            type: 'error',
            text: res.error || 'Не вдалося очистити кеш памʼяті',
          });
        }
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || 'Помилка виконання команди',
      });
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleInstallGuestAgent = async () => {
    if (!existingSSHProfile || !existingSSHProfile.username) {
      setIsSSHModalOpen(true);
      return;
    }

    const profile: SSHProfile = {
      ...existingSSHProfile,
      host: existingSSHProfile.host || primaryIp || '',
    };

    let pass = sudoPassword || profile.password;
    if (!pass && profile.username !== 'root') {
      pass = (await requestSudoPassword()) || undefined;
      if (!pass) return;
    }

    setIsInstallingAgent(true);
    setUpdateStatusMsg(null);
    try {
      if (window.api?.updates?.installUpdate) {
        const res = await window.api.updates.installUpdate(profile, 'qemu-guest-agent', pass);
        if (res.success) {
          setUpdateStatusMsg({
            type: 'success',
            text: 'QEMU Guest Agent успішно встановлено! Proxmox тепер зможе точно відслідковувати вільну RAM після активації агента в налаштуваннях ВМ.',
          });
          setTimeout(() => {
            loadVMMetrics();
            refreshClusterData(true);
          }, 1500);
        } else {
          setUpdateStatusMsg({
            type: 'error',
            text: res.error || 'Не вдалося встановити qemu-guest-agent',
          });
        }
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || 'Помилка встановлення qemu-guest-agent',
      });
    } finally {
      setIsInstallingAgent(false);
    }
  };


  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentPackage: string;
    percent: number;
  } | null>(null);
  const [autoCreateSnapshot, setAutoCreateSnapshot] = useState(true);
  const [lastPreUpdateSnapshot, setLastPreUpdateSnapshot] = useState<string | null>(null);

  const handleInstallAllSafe = async () => {
    if (!selectedVM) return;
    const installed = locallyInstalled[selectedVM.vmid] || [];
    const safePackages = (vmUpdates[selectedVM.vmid]?.updates || [])
      .filter((u) => !installed.includes(u.packageName) && !u.isDangerous)
      .map((u) => u.packageName);

    if (safePackages.length === 0) return;

    let pass = sudoPassword || existingSSHProfile?.password;
    if (!pass && existingSSHProfile?.username !== 'root') {
      pass = (await requestSudoPassword()) || undefined;
      if (!pass) return;
    }

    setUpdateStatusMsg(null);

    // 1. Create Pre-update Safety Snapshot if enabled
    let createdSnapshotName: string | null = null;
    if (autoCreateSnapshot && activeServer && window.api?.proxmox?.createSnapshot) {
      setBatchProgress({
        current: 0,
        total: safePackages.length,
        currentPackage: 'Створення захисного снапшота...',
        percent: 10,
      });

      const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
      const snapName = `pre_upd_${dateStr}`;
      try {
        const snapRes = await window.api.proxmox.createSnapshot(
          activeServer,
          selectedVM.node,
          selectedVM.vmid,
          snapName,
          `Захисний снапшот перед оновленням ${safePackages.length} пакетів`,
          false
        );
        if (snapRes.success) {
          createdSnapshotName = snapName;
          setLastPreUpdateSnapshot(snapName);
          loadSnapshots();
        }
      } catch (snapErr) {
        console.warn('Failed to create pre-update safety snapshot:', snapErr);
      }
    }

    setBatchProgress({
      current: 1,
      total: safePackages.length,
      currentPackage: safePackages.join(', '),
      percent: 30,
    });

    try {
      const res = await installAllSafeVMUpdates(selectedVM.vmid, safePackages, pass);

      if (res.success) {
        setLocallyInstalled((prev) => ({
          ...prev,
          [selectedVM.vmid]: [...(prev[selectedVM.vmid] || []), ...safePackages],
        }));
        setBatchProgress({
          current: safePackages.length,
          total: safePackages.length,
          currentPackage: 'Завершено',
          percent: 100,
        });
        setUpdateStatusMsg({
          type: 'success',
          text: `Успішно оновлено всі ${res.installedCount || safePackages.length} компонентів в єдиній сесії!${
            createdSnapshotName ? ` Створено снапшот: ${createdSnapshotName}` : ''
          }`,
        });
      } else {
        if (res.error?.includes('password is required') || res.error?.includes('incorrect password')) {
          setSudoPassword('');
          setUpdateStatusMsg({
            type: 'error',
            text: 'Невірний або відсутній sudo пароль. Введіть коректний пароль користувача.',
          });
          return;
        }
        setUpdateStatusMsg({
          type: 'error',
          text: res.error || 'Помилка пакетного оновлення компонентів.',
        });
      }
    } finally {
      setBatchProgress(null);
      checkVMUpdates(selectedVM.vmid);
    }
  };

  const loadVMMetrics = useCallback(async () => {
    if (!activeServer || !selectedVM || selectedVM.status !== 'running') {
      setIsMetricsLoading(false);
      return;
    }
    try {
      const data = await window.api.proxmox.getVMMetrics(activeServer, selectedVM.node, selectedVM.vmid);
      setMetrics(data);
    } catch {
      // Ignored
    } finally {
      setIsMetricsLoading(false);
    }
  }, [activeServer, selectedVM?.node, selectedVM?.vmid, selectedVM?.status]);

  const loadSnapshots = useCallback(async () => {
    if (!activeServer || !selectedVM) {
      setIsSnapshotLoading(false);
      return;
    }
    setIsSnapshotLoading(true);
    try {
      const snaps = await window.api.proxmox.getSnapshots(activeServer, selectedVM.node, selectedVM.vmid);
      setSnapshots(snaps);
    } catch {
      // Ignored
    } finally {
      setIsSnapshotLoading(false);
    }
  }, [activeServer, selectedVM?.node, selectedVM?.vmid]);

  // Reset state and reload when selected VM changes (by vmid)
  useEffect(() => {
    setIsDiagnosticsOpen(false);
    setIsSSHModalOpen(false);
    setIsCreateSnapOpen(false);
    setMetrics(null);
    setLiveOSMem(null);
    setSnapshots([]);
    setIsMetricsLoading(selectedVM?.status === 'running');
    setIsSnapshotLoading(true);
    if (selectedVM) {
      loadSnapshots();
    }
  }, [selectedVM?.vmid, selectedVM?.status, loadSnapshots]);

  // Poll metrics every 3 seconds for active VM
  useEffect(() => {
    if (selectedVM) {
      loadVMMetrics();

      const interval = setInterval(() => {
        if (selectedVM.status === 'running') {
          loadVMMetrics();
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedVM?.vmid, selectedVM?.status, loadVMMetrics]);

  // Check OS updates on selected VM if not checked yet (debounced)
  useEffect(() => {
    if (selectedVM && selectedVM.status === 'running') {
      const vmid = selectedVM.vmid;
      const hasProfile = sshProfiles.some((p) => p.vmid === vmid);
      if (hasProfile && !vmUpdates[vmid]) {
        const timer = setTimeout(() => {
          checkVMUpdates(vmid);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedVM?.vmid, selectedVM?.status, sshProfiles]);

  // Fetch real in-OS memory statistics via SSH diagnostics periodically
  useEffect(() => {
    if (!selectedVM || selectedVM.status !== 'running') {
      setLiveOSMem(null);
      return;
    }

    const profile = sshProfiles.find((p) => p.vmid === selectedVM.vmid);
    const primaryIp = selectedVM.ipAddresses && selectedVM.ipAddresses.length > 0 ? selectedVM.ipAddresses[0] : '';
    const effectiveProf = profile && profile.username
      ? { ...profile, host: profile.host || primaryIp }
      : null;

    if (!effectiveProf || !effectiveProf.host) return;

    let isMounted = true;

    const fetchOSMem = async () => {
      try {
        if (window.api?.diagnostics?.getDiagnostics) {
          const res = await window.api.diagnostics.getDiagnostics(effectiveProf);
          if (isMounted && res.success && res.data) {
            let percent: number | undefined;
            if (res.data.memUsedBytes && res.data.memTotalBytes && res.data.memTotalBytes > 0) {
              percent = Math.round((res.data.memUsedBytes / res.data.memTotalBytes) * 1000) / 10;
              updateVMOSMetrics(selectedVM.vmid, {
                usedBytes: res.data.memUsedBytes,
                totalBytes: res.data.memTotalBytes,
                availableBytes: res.data.memAvailableBytes,
                percent,
              });
            }
            setLiveOSMem({
              used: res.data.memUsed,
              total: res.data.memTotal,
              available: res.data.memAvailable || res.data.memFree,
              usedBytes: res.data.memUsedBytes,
              totalBytes: res.data.memTotalBytes,
              percent,
            });
          }
        }
      } catch {
        // Ignored
      }
    };

    fetchOSMem();
    const interval = setInterval(fetchOSMem, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedVM?.vmid, selectedVM?.status, selectedVM?.ipAddresses, sshProfiles]);

  if (!selectedVM) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-[#18181B]">
        Виберіть віртуальну машину зі списку ліворуч для перегляду деталей
      </div>
    );
  }

  const isRunning = selectedVM.status === 'running';
  const existingSSHProfile = sshProfiles.find((p) => p.vmid === selectedVM.vmid);
  const primaryIp = selectedVM.ipAddresses && selectedVM.ipAddresses.length > 0 ? selectedVM.ipAddresses[0] : '';



  const handlePowerAction = async (action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'suspend' | 'resume') => {
    if (!activeServer) return;

    const perform = async () => {
      setIsActionLoading(true);
      try {
        await window.api.proxmox.executeVMAction(activeServer, selectedVM.node, selectedVM.vmid, action);
        await refreshClusterData();
      } catch (err: any) {
        alert(`Помилка: ${err.message}`);
      } finally {
        setIsActionLoading(false);
      }
    };

    if (action === 'stop') {
      setConfirmModal({
        isOpen: true,
        title: 'Примусова зупинка ВМ',
        message: `Ви впевнені, що бажаєте примусово зупинити ВМ "${selectedVM.name}" (VMID: ${selectedVM.vmid})? Це аналог висмикування живлення і може призвести до втрати незбережених даних.`,
        action: perform,
      });
      return;
    }

    if (action === 'shutdown') {
      setConfirmModal({
        isOpen: true,
        title: 'Вимкнення ВМ (Shutdown)',
        message: `Ви впевнені, що бажаєте вимкнути ВМ "${selectedVM.name}" (VMID: ${selectedVM.vmid})? Системі буде надіслано сигнал коректного завершення роботи.`,
        action: perform,
      });
      return;
    }

    if (action === 'reboot') {
      setConfirmModal({
        isOpen: true,
        title: 'Перезавантаження ВМ (Reboot)',
        message: `Ви впевнені, що бажаєте перезавантажити ВМ "${selectedVM.name}" (VMID: ${selectedVM.vmid})? Усі запущені процеси та сервіси будуть перезапущені.`,
        action: perform,
      });
      return;
    }

    await perform();
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServer || !snapName) return;
    setIsActionLoading(true);
    try {
      await window.api.proxmox.createSnapshot(
        activeServer,
        selectedVM.node,
        selectedVM.vmid,
        snapName,
        snapDesc,
        snapIncludeRam
      );
      setIsCreateSnapOpen(false);
      setSnapName('');
      setSnapDesc('');
      await loadSnapshots();
    } catch (e: any) {
      alert(`Помилка створення снапшота: ${e.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRollbackSnapshot = (snap: VMSnapshot) => {
    if (!activeServer) return;
    setConfirmModal({
      isOpen: true,
      title: 'Відкат снапшота',
      message: `Ви впевнені, що бажаєте відкотити стан ВМ до снапшота "${snap.name}"? Поточні незбережені зміни після знімка буде втрачено.`,
      action: async () => {
        setIsActionLoading(true);
        try {
          await window.api.proxmox.rollbackSnapshot(activeServer, selectedVM.node, selectedVM.vmid, snap.name);
          await refreshClusterData();
          await loadSnapshots();
        } catch (e: any) {
          alert(`Помилка відкату: ${e.message}`);
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  const handleDeleteSnapshot = (snap: VMSnapshot) => {
    if (!activeServer) return;
    setConfirmModal({
      isOpen: true,
      title: 'Видалення снапшота',
      message: `Видалити снапшот "${snap.name}"? Цю дію неможливо скасувати.`,
      action: async () => {
        setIsActionLoading(true);
        try {
          await window.api.proxmox.deleteSnapshot(activeServer, selectedVM.node, selectedVM.vmid, snap.name);
          await loadSnapshots();
        } catch (e: any) {
          alert(`Помилка видалення: ${e.message}`);
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const cachedOSMem = selectedVM ? vmOSMetrics[selectedVM.vmid] : undefined;
  const activeOSMem = liveOSMem || (cachedOSMem ? {
    used: `${Math.round(cachedOSMem.usedBytes / 1024 / 1024)} MiB`,
    total: `${Math.round(cachedOSMem.totalBytes / 1024 / 1024)} MiB`,
    available: cachedOSMem.availableBytes ? `${Math.round(cachedOSMem.availableBytes / 1024 / 1024)} MiB` : '',
    usedBytes: cachedOSMem.usedBytes,
    totalBytes: cachedOSMem.totalBytes,
    percent: cachedOSMem.percent,
  } : null);

  const cpuVal = metrics ? metrics.cpu * 100 : (selectedVM.cpu ? selectedVM.cpu * 100 : 0);
  const cpuPercent = cpuVal.toFixed(1);
  const rawRamUsed = metrics?.mem || selectedVM.mem || 0;
  const ramMax = metrics?.maxmem || selectedVM.maxmem || 1;
  const freemem = metrics?.freemem !== undefined ? metrics.freemem : selectedVM.freemem;

  // If Proxmox provides freemem via ballooning/guest-agent or OS metrics exist, compute true active RAM
  const ramUsed =
    activeOSMem?.usedBytes !== undefined && activeOSMem.usedBytes > 0
      ? activeOSMem.usedBytes
      : freemem !== undefined && freemem > 0 && freemem <= ramMax
      ? ramMax - freemem
      : rawRamUsed;

  const effectiveRamMax =
    activeOSMem?.totalBytes !== undefined && activeOSMem.totalBytes > 0
      ? activeOSMem.totalBytes
      : ramMax;

  const ramVal =
    activeOSMem?.percent !== undefined
      ? activeOSMem.percent
      : (ramUsed / effectiveRamMax) * 100;

  const ramPercent = ramVal.toFixed(1);
  const isAgentActive = (freemem !== undefined && freemem > 0) || activeOSMem !== null;
  const isKvmAllocated = !isAgentActive && (rawRamUsed / ramMax) * 100 >= 85;

  const diskUsed = metrics?.disk || selectedVM.disk || 0;
  const diskMax = metrics?.maxdisk || selectedVM.maxdisk || 0;
  const diskVal = diskMax > 0 ? (diskUsed / diskMax) * 100 : 0;
  const diskPercent = diskVal.toFixed(1);

  const isCpuHigh = isRunning && cpuVal >= 85;
  const isRamHigh = isRunning && !isKvmAllocated && ramVal >= 90;
  const isDiskHigh = isRunning && diskMax > 0 && diskVal >= 90;
  const hasResourceAlert = isCpuHigh || isRamHigh || isDiskHigh;
  const isResourceCritical = isRunning && (cpuVal >= 95 || (ramVal >= 96 && !isKvmAllocated) || (diskMax > 0 && diskVal >= 95));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50 dark:bg-[#18181B] text-zinc-800 dark:text-zinc-100 select-none">
      {/* High Resource Usage Warning Banner */}
      {hasResourceAlert && (
        <div
          className={`p-4 rounded-2xl border transition-all modal-animate flex items-start justify-between gap-4 ${
            isResourceCritical
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isResourceCritical
                  ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400'
                  : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isResourceCritical ? 'Критичне навантаження ресурсів ВМ!' : 'Підвищене споживання системних ресурсів'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isResourceCritical ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                  }`}
                >
                  {isResourceCritical ? 'Critical' : 'Warning'}
                </span>
              </div>
              <p className="text-xs mt-1 opacity-90 leading-relaxed">
                {isCpuHigh && `Процесор завантажено на ${cpuPercent}%. `}
                {isRamHigh && `Оперативну пам'ять вичерпано на ${ramPercent}% (${formatBytes(ramUsed)} з ${formatBytes(ramMax)}). `}
                {isDiskHigh && `Дисковий простір зайнято на ${diskPercent}%. `}
                Рекомендується перевірити запущені процеси або розширити виділені ресурси у Proxmox.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsDiagnosticsOpen(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 shadow-xs transition-colors flex items-center gap-1.5 ${
              isResourceCritical
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Діагностика</span>
          </button>
        </div>
      )}
      {/* Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#252528] p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">{selectedVM.name}</h1>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold border border-zinc-200 dark:border-zinc-700">
              VMID: {selectedVM.vmid}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isRunning
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                  : selectedVM.status === 'paused'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500' : 'bg-zinc-400'}`}
              />
              {isRunning ? 'Активна (Running)' : selectedVM.status === 'paused' ? 'Призупинена' : 'Зупинена (Stopped)'}
            </span>
            {vmAlerts[selectedVM.vmid]?.hasAlert && (
              <span
                title="Високе навантаження ресурсів"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                  vmAlerts[selectedVM.vmid].severity === 'critical'
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-amber-500 text-white'
                }`}
              >
                <Flame className="w-3 h-3" />
                <span>Навантаження</span>
              </span>
            )}
            {vmUpdates[selectedVM.vmid]?.hasCritical && (
              <span
                title="Критичні оновлення ОС потребують уваги!"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse shadow-xs"
              >
                !
                <span>Критичні оновлення</span>
              </span>
            )}
            {vmUpdates[selectedVM.vmid]?.hasDangerousOnly && !vmUpdates[selectedVM.vmid]?.hasCritical && (
              <span
                title="Є заблоковані оновлення високого ризику (ядро/GRUB). Потребують ручного оновлення зі снапшотом."
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 shadow-2xs"
              >
                <Lock className="w-3 h-3" />
                <span>Заблоковані оновлення</span>
              </span>
            )}
            {!vmUpdates[selectedVM.vmid]?.hasCritical && (vmUpdates[selectedVM.vmid]?.safeCount || 0) > 0 && (
              <span
                title={`Доступно ${vmUpdates[selectedVM.vmid].safeCount} дозволених оновлень`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-2xs"
              >
                <ArrowUpCircle className="w-3 h-3" />
                <span>Дозволені оновлення ({vmUpdates[selectedVM.vmid].safeCount})</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Вузол Proxmox: <strong className="text-zinc-700 dark:text-zinc-200">{selectedVM.node}</strong></span>
            <span>•</span>
            <span>
              IP адреса:{' '}
              <strong className="text-zinc-700 dark:text-zinc-200 font-mono">
                {primaryIp || 'Очікування Guest Agent...'}
              </strong>
            </span>
          </div>
        </div>

        {/* Quick Power Actions */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <button
                disabled={isActionLoading}
                onClick={() => handlePowerAction('shutdown')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors"
                title="М'яке вимкнення через ACPI"
              >
                <Square className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                <span>Shutdown</span>
              </button>
              <button
                disabled={isActionLoading}
                onClick={() => handlePowerAction('reboot')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors"
                title="Перезавантажити систему"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span>Reboot</span>
              </button>
              <button
                disabled={isActionLoading}
                onClick={() => handlePowerAction('stop')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 text-xs font-medium transition-colors"
                title="Примусове вимкнення"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Force Stop</span>
              </button>
            </>
          ) : (
            <button
              disabled={isActionLoading}
              onClick={() => handlePowerAction('start')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-md transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Запустити ВМ</span>
            </button>
          )}
        </div>
      </div>

      {/* Terminal & Productivity Quick Launch Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => openTerminalForVM(selectedVM, 'ssh')}
          disabled={!isRunning}
          className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all disabled:opacity-50 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-xs">Відкрити SSH Термінал</div>
              <div className="text-[11px] text-blue-100">
                {primaryIp ? `Підключитися до ${primaryIp}` : 'Пряме PTY з’єднання'}
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => openTerminalForVM(selectedVM, 'proxmox-console')}
          disabled={!isRunning}
          className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-xs transition-all disabled:opacity-50 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-300">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-xs">Proxmox Web Console</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Резервний доступ через API
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setIsSSHModalOpen(true)}
          className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-xs transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-950/60 rounded-lg text-amber-600 dark:text-amber-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-xs">
                {existingSSHProfile ? 'SSH профіль налаштовано' : 'Налаштувати SSH доступ'}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {existingSSHProfile ? `${existingSSHProfile.username}@${existingSSHProfile.host}` : 'Ключ чи пароль'}
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Live Resource Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isRunning && isMetricsLoading && !metrics ? (
          <>
            {[
              { title: 'Процесор (CPU)', icon: Cpu, iconColor: 'text-blue-500' },
              { title: "Оперативна пам'ять", icon: Activity, iconColor: 'text-emerald-500' },
              { title: 'Дисковий простір', icon: HardDrive, iconColor: 'text-amber-500' },
              { title: 'Мережевий трафік', icon: Network, iconColor: 'text-purple-500' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
                    <span>{item.title}</span>
                    <item.icon className={`w-4 h-4 ${item.iconColor} opacity-50`} />
                  </div>
                  <div className="mt-3 h-8 w-24 bg-zinc-200/80 dark:bg-zinc-700/60 rounded-md animate-pulse" />
                  <div className="mt-2 h-3.5 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="mt-4 w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full w-2/5 bg-zinc-300/80 dark:bg-zinc-700/80 rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* CPU */}
            <div className={`p-4 rounded-xl bg-white dark:bg-[#252528] border shadow-xs transition-all ${
              isCpuHigh ? 'border-rose-300 dark:border-rose-900/80 ring-1 ring-rose-500/20' : 'border-zinc-200 dark:border-zinc-700/80'
            }`}>
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Процесор (CPU)</span>
            <Cpu className={`w-4 h-4 ${isCpuHigh ? 'text-rose-500' : 'text-blue-500'}`} />
          </div>
          <div className={`mt-2 text-2xl font-bold ${isCpuHigh ? 'text-rose-600 dark:text-rose-400' : ''}`}>
            {cpuPercent}%
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            Виділено: {selectedVM.cpus || 1} vCPU
          </div>
          <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isCpuHigh ? 'bg-rose-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(Number(cpuPercent), 100)}%` }}
            />
          </div>
        </div>

        {/* RAM */}
        <div
          title={
            isKvmAllocated
              ? `Гіпервізор Proxmox показує ${formatBytes(ramUsed)} (${ramPercent}%). За відсутності QEMU Guest Agent гіпервізор утримує весь виділений буфер пам'яті.`
              : `Оперативна пам'ять: ${formatBytes(ramUsed)} з ${formatBytes(ramMax)}`
          }
          className={`p-4 rounded-xl bg-white dark:bg-[#252528] border shadow-xs transition-all flex flex-col justify-between ${
            isRamHigh ? 'border-rose-300 dark:border-rose-900/80 ring-1 ring-rose-500/20' : 'border-zinc-200 dark:border-zinc-700/80'
          }`}
        >
          <div>
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
              <span>Оперативна пам'ять</span>
              <Activity className={`w-4 h-4 ${isRamHigh ? 'text-rose-500' : 'text-emerald-500'}`} />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div className={`text-2xl font-bold ${isRamHigh ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                {ramPercent}%
              </div>
              {activeOSMem ? (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40"
                  title={`Реальні дані з ядра Linux гостьової ОС (free). Буфер гіпервізора KVM: ${formatBytes(rawRamUsed)}`}
                >
                  Дані ОС (Live)
                </span>
              ) : isAgentActive ? (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40"
                  title="Дані синхронізовано з ОС через QEMU Guest Agent"
                >
                  Guest Agent
                </span>
              ) : isKvmAllocated ? (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40"
                  title="Гіпервізор Proxmox утримує виділену пам'ять. Для отримання точних даних потрібен QEMU Guest Agent."
                >
                  Алокація KVM
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-zinc-400 truncate">
              {activeOSMem ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ОС: {activeOSMem.used} / {activeOSMem.total} {activeOSMem.available ? `(вільно: ${activeOSMem.available})` : ''}
                </span>
              ) : (
                <span>{formatBytes(ramUsed)} / {formatBytes(ramMax)}</span>
              )}
            </div>
            <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isRamHigh ? 'bg-rose-500' : isKvmAllocated ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(Number(ramPercent), 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-1.5">
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              className="w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              title="Переглянути процеси, споживання RAM та диски всередині ОС"
            >
              <Activity className="w-3 h-3" />
              <span>Діагностика процесів ОС</span>
            </button>
            {isRunning && (
              <button
                disabled={isClearingCache}
                onClick={handleDropCaches}
                className="w-full px-2 py-1 rounded-lg text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title="Звільнити пам'ять: скинути дисковий кеш Linux ядра (Page Cache / Buffers)"
              >
                <RotateCcw className={`w-3 h-3 ${isClearingCache ? 'animate-spin' : ''}`} />
                <span>{isClearingCache ? 'Очищення...' : 'Очистити кеш RAM'}</span>
              </button>
            )}
            {isRunning && isKvmAllocated && (
              <button
                disabled={isInstallingAgent}
                onClick={handleInstallGuestAgent}
                className="w-full px-2 py-1 rounded-lg text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                title="Встановити qemu-guest-agent для точної передачі реального стану пам'яті гостьової ОС в Proxmox"
              >
                <Download className={`w-3 h-3 ${isInstallingAgent ? 'animate-bounce' : ''}`} />
                <span>{isInstallingAgent ? 'Встановлення...' : 'Встановити Guest Agent'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Disk */}
        <div className={`p-4 rounded-xl bg-white dark:bg-[#252528] border shadow-xs transition-all ${
          isDiskHigh ? 'border-amber-300 dark:border-amber-900/80 ring-1 ring-amber-500/20' : 'border-zinc-200 dark:border-zinc-700/80'
        }`}>
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Дисковий простір</span>
            <HardDrive className={`w-4 h-4 ${isDiskHigh ? 'text-amber-500' : 'text-zinc-400'}`} />
          </div>
          <div className={`mt-2 text-2xl font-bold ${isDiskHigh ? 'text-amber-600 dark:text-amber-400' : ''}`}>
            {formatBytes(selectedVM.maxdisk || 0)}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {diskMax > 0 ? `Зайнято: ${diskPercent}% (${formatBytes(diskUsed)})` : "Виділений об'єм диску"}
          </div>
          {diskMax > 0 && (
            <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isDiskHigh ? 'bg-amber-500' : 'bg-zinc-400'}`}
                style={{ width: `${Math.min(diskVal, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Network */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Мережевий трафік</span>
            <Network className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-400">Вхідний:</span>
              <span className="font-semibold">{formatBytes(metrics?.netin || selectedVM.netin || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Вихідний:</span>
              <span className="font-semibold">{formatBytes(metrics?.netout || selectedVM.netout || 0)}</span>
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Snapshots Management Section */}
      <div className="rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold">Знімки стану (Снапшоти)</h2>
            <span className="text-xs text-zinc-400">({snapshots.length})</span>
          </div>
          <button
            onClick={() => setIsCreateSnapOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Створити снапшот</span>
          </button>
        </div>

        {isSnapshotLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-50/70 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800/60 animate-pulse"
              >
                <div className="space-y-1.5">
                  <div className="h-3.5 w-36 bg-zinc-200/80 dark:bg-zinc-700/70 rounded" />
                  <div className="h-2.5 w-52 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </div>
                <div className="h-3 w-24 bg-zinc-200/70 dark:bg-zinc-700/50 rounded" />
              </div>
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-400">
            Снапшотів для цієї ВМ ще не створено
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700/80">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Назва снапшота</th>
                  <th className="px-4 py-2.5 font-medium">Опис</th>
                  <th className="px-4 py-2.5 font-medium">Час створення</th>
                  <th className="px-4 py-2.5 font-medium">RAM стан</th>
                  <th className="px-4 py-2.5 font-medium text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {snapshots.map((snap) => (
                  <tr key={snap.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/30">
                    <td className="px-4 py-3 font-medium font-mono text-zinc-900 dark:text-zinc-100">
                      {snap.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                      {snap.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(snap.snaptime * 1000).toLocaleString('uk-UA')}
                    </td>
                    <td className="px-4 py-3">
                      {snap.vmstate ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-medium">
                          Збережено RAM
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                          Тільки диск
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleRollbackSnapshot(snap)}
                          title="Відкотити ВМ до цього стану"
                          className="p-1.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-950/50 text-amber-600 dark:text-amber-400 transition-colors"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSnapshot(snap)}
                          title="Видалити снапшот"
                          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* OS Critical Updates & Security Advisor */}
      {selectedVM && (
        <div className="bg-white dark:bg-[#252528] rounded-2xl border border-zinc-200 dark:border-zinc-700/80 p-5 shadow-xs transition-colors">
          {(() => {
            const installed = locallyInstalled[selectedVM.vmid] || [];
            const activeList = (vmUpdates[selectedVM.vmid]?.updates || []).filter(
              (u) => !installed.includes(u.packageName)
            );
            const safeCount = activeList.filter((u) => !u.isDangerous).length;
            const hasActionableCritical = activeList.some((u) => (u.isCritical || u.isSecurity) && !u.isDangerous);
            const onlyDangerousRemain = activeList.length > 0 && safeCount === 0;

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    {hasActionableCritical ? (
                      <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                    ) : onlyDangerousRemain ? (
                      <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                        <Lock className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          Оновлення компонентів операційної системи
                        </h3>
                        {hasActionableCritical && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                            Потрібна увага
                          </span>
                        )}
                        {!hasActionableCritical && onlyDangerousRemain && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Потребує ручного контролю
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {activeList.length
                          ? `Залишилось ${activeList.length} оновлень (дозволено для оновлення в 1 клік: ${safeCount})`
                          : existingSSHProfile
                          ? 'Усі системні компоненти мають актуальні версії'
                          : 'Налаштуйте SSH доступ для перевірки оновлень ОС'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {safeCount > 0 && (
                      <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/40 text-[11px] text-zinc-600 dark:text-zinc-300 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 select-none transition-colors">
                        <input
                          type="checkbox"
                          checked={autoCreateSnapshot}
                          onChange={(e) => setAutoCreateSnapshot(e.target.checked)}
                          disabled={batchProgress !== null}
                          className="rounded border-zinc-300 dark:border-zinc-600 text-emerald-600 focus:ring-0 cursor-pointer"
                        />
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Захисний снапшот</span>
                      </label>
                    )}

                    {safeCount > 0 && (
                      <button
                        onClick={handleInstallAllSafe}
                        disabled={batchProgress !== null || updatingPackage !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
                      >
                        {batchProgress ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>
                              {batchProgress.currentPackage.startsWith('Створення')
                                ? 'Створення снапшота...'
                                : `Оновлення ${batchProgress.current}/${batchProgress.total} (${batchProgress.percent}%)...`}
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                            <span>Оновити всі дозволені ({safeCount})</span>
                          </>
                        )}
                      </button>
                    )}

                    {lastPreUpdateSnapshot && (
                      <button
                        onClick={() => {
                          const existingSnap = snapshots.find((s) => s.name === lastPreUpdateSnapshot);
                          if (existingSnap) {
                            handleRollbackSnapshot(existingSnap);
                          } else {
                            handleRollbackSnapshot({ name: lastPreUpdateSnapshot } as VMSnapshot);
                          }
                        }}
                        disabled={isActionLoading}
                        title={`Відкотити систему до стану перед оновленням (${lastPreUpdateSnapshot})`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium border border-amber-300 dark:border-amber-800 transition-colors disabled:opacity-50"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Відкотити до {lastPreUpdateSnapshot}</span>
                      </button>
                    )}

                    <button
                      onClick={() => checkVMUpdates(selectedVM.vmid)}
                      disabled={!existingSSHProfile || vmUpdates[selectedVM.vmid]?.isLoading || batchProgress !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          vmUpdates[selectedVM.vmid]?.isLoading ? 'animate-spin text-blue-500' : 'text-zinc-500'
                        }`}
                      />
                      <span>
                        {vmUpdates[selectedVM.vmid]?.isLoading ? 'Сканування...' : 'Перевірити оновлення'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Batch updating live progress bar */}
                {batchProgress && (
                  <div className="mb-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        Встановлення {batchProgress.current} з {batchProgress.total}:{' '}
                        <code className="font-mono text-emerald-600 dark:text-emerald-400">{batchProgress.currentPackage}</code>
                      </span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 shrink-0 ml-2">
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

                {/* Critical explanation alert banner */}
                {hasActionableCritical && (
                  <div className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block mb-0.5">Чому це критично:</strong>
                      Виявлено компоненти з незакритими вразливостями безпеки (CVE) або застарілі системні служби. Своєчасне встановлення безпекових патчів захищає віртуальну машину від несанкціонованого проникнення та збоїв.
                    </div>
                  </div>
                )}

                {/* Notice when only locked/dangerous updates remain */}
                {!hasActionableCritical && onlyDangerousRemain && (
                  <div className="mb-4 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 max-w-2xl">
                      <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold block mb-0.5">Усі дозволені оновлення застосовано:</strong>
                        Залишилися лише системні компоненти підвищеного ризику (ядро ОС / завантажувач). Автоматичне оновлення заблоковано задля стабільності. Якщо оновлення необхідне, створіть знімок стану (снапшот) та виконайте оновлення вручну через SSH термінал.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setIsCreateSnapOpen(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Створити снапшот</span>
                      </button>
                      <button
                        onClick={() => openTerminalForVM(selectedVM, 'ssh')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-medium transition-colors"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Термінал</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Updates List */}
          {(() => {
            const installed = locallyInstalled[selectedVM.vmid] || [];
            const activeList = (vmUpdates[selectedVM.vmid]?.updates || []).filter(
              (u) => !installed.includes(u.packageName)
            );

            if (activeList.length === 0) {
              return (
                <div className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Всі компоненти успішно оновлено!
                </div>
              );
            }

            return (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border-t border-zinc-200 dark:border-zinc-800 -mx-5 -mb-5 px-5 py-2">
                {activeList.map((u) => (
                  <div
                    key={u.packageName}
                    className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs transition-all duration-200"
                  >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-zinc-900 dark:text-zinc-100">
                        {u.packageName}
                      </span>
                      {u.isSecurity && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
                          Security (CVE)
                        </span>
                      )}
                      {u.isDangerous ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          Високий ризик (блоковано)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                          Безпечне
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {u.description}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-400">
                      Версія: <span className="text-zinc-600 dark:text-zinc-300">{u.currentVersion}</span>{' '}
                      ➔ <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{u.newVersion}</span>
                    </div>

                    {/* Danger explanation */}
                    {u.isDangerous && u.dangerReason && (
                      <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-1.5 rounded border border-amber-200/60 dark:border-amber-900/40 leading-snug">
                        ⚠️ <strong>Захист системи:</strong> {u.dangerReason}
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div>
                    {u.isDangerous ? (
                      <button
                        disabled
                        title="Оновлення цього компонента наживо заблоковано для уникнення збою. Оновіть вручну через термінал зі снапшотом."
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700 cursor-not-allowed font-medium text-xs opacity-80"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Оновлення заблоковано</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstallSingleUpdate(u.packageName)}
                        disabled={updatingPackage === u.packageName}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-all disabled:opacity-50"
                      >
                        {updatingPackage === u.packageName ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Оновлення...</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                            <span>Оновити</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        </div>
      )}

      {/* Create Snapshot Modal */}
      {isCreateSnapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs backdrop-animate">
          <div className="w-full max-w-sm bg-white dark:bg-[#252528] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-zinc-800 dark:text-zinc-100 p-5 modal-animate">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-500" />
              <span>Створити снапшот ВМ</span>
            </h3>
            <form onSubmit={handleCreateSnapshot} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Назва снапшота *</label>
                <input
                  type="text"
                  required
                  value={snapName}
                  onChange={(e) => setSnapName(e.target.value)}
                  placeholder="snap_before_update"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Опис</label>
                <textarea
                  value={snapDesc}
                  onChange={(e) => setSnapDesc(e.target.value)}
                  placeholder="Стан перед оновленням сервісів"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 resize-none"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={snapIncludeRam}
                  onChange={(e) => setSnapIncludeRam(e.target.checked)}
                  className="rounded border-zinc-300 text-blue-600"
                />
                <span>Включити оперативну пам'ять (RAM state)</span>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setIsCreateSnapOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !snapName}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                >
                  {isActionLoading ? 'Створення...' : 'Створити'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs backdrop-animate">
          <div className="w-full max-w-sm bg-white dark:bg-[#252528] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-zinc-800 dark:text-zinc-100 p-5 modal-animate">
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-3 py-1.5 rounded-lg text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={async () => {
                  const act = confirmModal.action;
                  setConfirmModal({ ...confirmModal, isOpen: false });
                  await act();
                }}
                className="px-4 py-1.5 rounded-lg text-xs bg-red-600 hover:bg-red-700 text-white font-medium shadow-xs"
              >
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SSH Profile Configuration Modal */}
      <SSHProfileModal
        key={`ssh-modal-${selectedVM.vmid}-${existingSSHProfile?.id || 'new'}`}
        isOpen={isSSHModalOpen}
        onClose={() => setIsSSHModalOpen(false)}
        onSave={saveSSHProfile}
        initialProfile={existingSSHProfile}
        defaultVmid={selectedVM.vmid}
        defaultHost={primaryIp}
      />

      {/* Sudo Password Prompt Modal */}
      {sudoModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 modal-animate">
          <div className="bg-white dark:bg-[#202023] w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Потрібен пароль sudo</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Для оновлення системних пакетів на віртуальній машині
                </p>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!tempSudoInput) return;
                const cb = sudoModal.callback;
                setSudoModal({ isOpen: false, callback: async () => {} });
                await cb(tempSudoInput);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Пароль користувача ({existingSSHProfile?.username || 'користувач'})
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
                  onClick={() => setSudoModal({ isOpen: false, callback: async () => {} })}
                  className="px-3 py-1.5 rounded-lg text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors font-medium"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={!tempSudoInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50"
                >
                  Підтвердити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resource Diagnostics Modal */}
      {isDiagnosticsOpen && selectedVM && (
        <ResourceDiagnosticsModal
          isOpen={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
          vm={selectedVM}
          sshProfile={existingSSHProfile || null}
          onOpenTerminal={() => openTerminalForVM(selectedVM, 'ssh')}
          onConfigureSSH={() => setIsSSHModalOpen(true)}
        />
      )}

      {/* Floating Auto-Dismissing Toast with manual dismiss */}
      {updateStatusMsg && (
        <div className="fixed bottom-6 right-6 z-50 modal-animate max-w-md">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/95 dark:bg-[#252528]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 shadow-xl text-xs text-zinc-800 dark:text-zinc-100">
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                updateStatusMsg.type === 'success' ? 'bg-emerald-500' : 'bg-red-500 ring-2 ring-red-500/20'
              }`}
            />
            <div className="flex-1 pr-1 leading-relaxed break-words font-medium">
              {updateStatusMsg.text}
            </div>
            <button
              onClick={() => setUpdateStatusMsg(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded transition-colors shrink-0"
              title="Закрити"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
