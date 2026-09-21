import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  Plus,
  Edit2,
  Trash2,
  Check,
  AlertTriangle,
  FolderPlus,
  Box,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
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
  const { t } = useLanguage();
  const { activeServer, sshProfiles, refreshClusterData } = useApp();
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

  // CRUD Network Modals
  const [networkModal, setNetworkModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    iface: string;
    type: string;
    cidr: string;
    gateway: string;
    bridge_ports: string;
    autostart: boolean;
    comments: string;
  }>({
    isOpen: false,
    mode: 'create',
    iface: '',
    type: 'bridge',
    cidr: '',
    gateway: '',
    bridge_ports: '',
    autostart: true,
    comments: '',
  });
  const [networkPendingChanges, setNetworkPendingChanges] = useState(false);
  const [applyingNetwork, setApplyingNetwork] = useState(false);

  // CRUD Storage Modals
  const [storageModal, setStorageModal] = useState<{
    isOpen: boolean;
    storage: string;
    type: 'dir' | 'nfs' | 'lvmthin';
    content: string;
    path: string;
    server: string;
    export: string;
    thinpool: string;
    vgname: string;
  }>({
    isOpen: false,
    storage: '',
    type: 'dir',
    content: 'images,iso,backup',
    path: '/var/lib/vz',
    server: '',
    export: '',
    thinpool: '',
    vgname: '',
  });

  // High-Risk / Dangerous Action Confirmation Modal
  const [dangerModal, setDangerModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    targetName: string;
    expectedConfirmText: string;
    actionType: 'wipe-disk' | 'init-gpt' | 'delete-storage' | 'delete-network' | 'apply-network';
    targetPath?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [dangerInputText, setDangerInputText] = useState('');

  // Create VM Modal
  const [createVMModal, setCreateVMModal] = useState<{
    isOpen: boolean;
    vmid: number;
    name: string;
    cores: number;
    memory: number; // MB
    diskSize: number; // GB
    storage: string;
    bridge: string;
    startAfterCreate: boolean;
  }>({
    isOpen: false,
    vmid: 100,
    name: '',
    cores: 2,
    memory: 2048,
    diskSize: 32,
    storage: '',
    bridge: 'vmbr0',
    startAfterCreate: true,
  });

  // Create CT / Docker Container Modal
  const [createCTModal, setCreateCTModal] = useState<{
    isOpen: boolean;
    vmid: number;
    hostname: string;
    ostemplate: string;
    cores: number;
    memory: number; // MB
    swap: number; // MB
    diskSize: number; // GB
    storage: string;
    bridge: string;
    password: string;
    enableDocker: boolean; // nesting=1,keyctl=1
    unprivileged: boolean;
    startAfterCreate: boolean;
  }>({
    isOpen: false,
    vmid: 101,
    hostname: '',
    ostemplate: '',
    cores: 2,
    memory: 2048,
    swap: 512,
    diskSize: 8,
    storage: '',
    bridge: 'vmbr0',
    password: '',
    enableDocker: true,
    unprivileged: true,
    startAfterCreate: true,
  });
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ volid: string; format: string; size?: number }>>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Action status notification
  const [crudActionStatus, setCrudActionStatus] = useState<{
    type: 'success' | 'error';
    text: string;
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

  // CRUD Network Handlers
  const handleSaveNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServer || !nodeName) return;
    try {
      if (networkModal.mode === 'create') {
        await window.api.proxmox.createNodeNetwork(activeServer, nodeName, {
          iface: networkModal.iface.trim(),
          type: networkModal.type,
          cidr: networkModal.cidr.trim() || undefined,
          gateway: networkModal.gateway.trim() || undefined,
          bridge_ports: networkModal.bridge_ports.trim() || undefined,
          autostart: networkModal.autostart,
          comments: networkModal.comments.trim() || undefined,
        });
        setCrudActionStatus({ type: 'success', text: t('nodeAdmin.ifaceCreatedSuccess', { iface: networkModal.iface }) });
      } else {
        await window.api.proxmox.updateNodeNetwork(activeServer, nodeName, networkModal.iface, {
          cidr: networkModal.cidr.trim() || undefined,
          gateway: networkModal.gateway.trim() || undefined,
          bridge_ports: networkModal.bridge_ports.trim() || undefined,
          autostart: networkModal.autostart,
          comments: networkModal.comments.trim() || undefined,
        });
        setCrudActionStatus({ type: 'success', text: t('nodeAdmin.ifaceUpdatedSuccess', { iface: networkModal.iface }) });
      }
      setNetworkModal((prev) => ({ ...prev, isOpen: false }));
      setNetworkPendingChanges(true);
      await loadNetwork();
    } catch (err: any) {
      setCrudActionStatus({ type: 'error', text: err.message || t.nodeAdmin.ifaceSaveError });
    }
  };

  const handleDeleteNetwork = async (iface: string) => {
    if (!activeServer || !nodeName) return;
    if (iface === 'vmbr0') {
      setCrudActionStatus({ type: 'error', text: t.nodeAdmin.vmbr0DeleteBlocked });
      return;
    }
    setDangerModal({
      isOpen: true,
      title: t('nodeAdmin.deleteIfaceTitle', { iface }),
      description: t('nodeAdmin.deleteIfaceDesc', { iface }),
      targetName: iface,
      actionType: 'delete-network',
      expectedConfirmText: iface,
      onConfirm: async () => {
        try {
          await window.api.proxmox.deleteNodeNetwork(activeServer, nodeName, iface);
          setCrudActionStatus({ type: 'success', text: t('nodeAdmin.ifaceMarkedDeleted', { iface }) });
          setNetworkPendingChanges(true);
          await loadNetwork();
        } catch (err: any) {
          setCrudActionStatus({ type: 'error', text: err.message || t.nodeAdmin.ifaceDeleteError });
        }
      },
    });
  };

  const handleApplyNetwork = async () => {
    if (!activeServer || !nodeName) return;
    setDangerModal({
      isOpen: true,
      title: t.nodeAdmin.applyNetworkTitle,
      description: t('nodeAdmin.applyNetworkDesc', { node: nodeName }),
      targetName: nodeName,
      actionType: 'apply-network',
      expectedConfirmText: nodeName,
      onConfirm: async () => {
        setApplyingNetwork(true);
        try {
          const res = await window.api.proxmox.applyNodeNetworkChanges(activeServer, nodeName);
          if (res.success) {
            setCrudActionStatus({ type: 'success', text: t.nodeAdmin.networkAppliedSuccess });
            setNetworkPendingChanges(false);
            await loadNetwork();
          }
        } catch (err: any) {
          setCrudActionStatus({ type: 'error', text: err.message || t.nodeAdmin.networkApplyError });
        } finally {
          setApplyingNetwork(false);
        }
      },
    });
  };

  const handleRevertNetwork = async () => {
    if (!activeServer || !nodeName) return;
    try {
      await window.api.proxmox.revertNodeNetworkChanges(activeServer, nodeName);
      setCrudActionStatus({ type: 'success', text: t.nodeAdmin.networkRevertedSuccess });
      setNetworkPendingChanges(false);
      await loadNetwork();
    } catch (err: any) {
      setCrudActionStatus({ type: 'error', text: err.message || t.nodeAdmin.networkRevertError });
    }
  };

  // CRUD Storage Handlers
  const handleCreateStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServer) return;
    try {
      await window.api.proxmox.createStorage(activeServer, {
        storage: storageModal.storage.trim(),
        type: storageModal.type,
        content: storageModal.content.trim() || undefined,
        path: storageModal.type === 'dir' ? storageModal.path.trim() : undefined,
        server: storageModal.type === 'nfs' ? storageModal.server.trim() : undefined,
        export: storageModal.type === 'nfs' ? storageModal.export.trim() : undefined,
        thinpool: storageModal.type === 'lvmthin' ? storageModal.thinpool.trim() : undefined,
        vgname: storageModal.type === 'lvmthin' ? storageModal.vgname.trim() : undefined,
      });
      setCrudActionStatus({ type: 'success', text: t('nodeAdmin.storageConnectedSuccess', { name: storageModal.storage }) });
      setStorageModal((prev) => ({ ...prev, isOpen: false }));
      await loadStorageAndDisks();
    } catch (err: any) {
      setCrudActionStatus({ type: 'error', text: err.message || t('nodeAdmin.storageCreateError') });
    }
  };

  // Protected Danger Handlers
  const requestDeleteStorage = (storageId: string) => {
    if (!activeServer) return;
    // Protect core system storage pools
    if (storageId === 'local' || storageId === 'local-lvm') {
      setCrudActionStatus({
        type: 'error',
        text: t('nodeAdmin.storageDeleteBlocked', { name: storageId }),
      });
      return;
    }

    setDangerInputText('');
    setDangerModal({
      isOpen: true,
      title: t('nodeAdmin.deleteStorageTitle'),
      actionType: 'delete-storage',
      targetName: storageId,
      expectedConfirmText: storageId,
      description: t('nodeAdmin.deleteStorageDesc', { name: storageId }),
      onConfirm: async () => {
        try {
          await window.api.proxmox.deleteStorage(activeServer, storageId);
          setCrudActionStatus({ type: 'success', text: t('nodeAdmin.storageDeletedSuccess', { name: storageId }) });
          await loadStorageAndDisks();
        } catch (err: any) {
          setCrudActionStatus({ type: 'error', text: err.message || t('nodeAdmin.storageDeleteError') });
        }
      },
    });
  };

  const requestDiskAction = (devpath: string, action: 'initgpt' | 'wipe') => {
    if (!activeServer || !nodeName) return;
    const baseDevName = devpath.replace('/dev/', '');
    const isWipe = action === 'wipe';

    setDangerInputText('');
    setDangerModal({
      isOpen: true,
      title: isWipe ? t('nodeAdmin.wipeDiskTitle') : t('nodeAdmin.initGptTitle'),
      actionType: isWipe ? 'wipe-disk' : 'init-gpt',
      targetName: devpath,
      targetPath: devpath,
      expectedConfirmText: baseDevName,
      description: isWipe
        ? t('nodeAdmin.wipeDiskWarning', { dev: devpath })
        : t('nodeAdmin.initGptWarning', { dev: devpath }),
      onConfirm: async () => {
        try {
          if (isWipe) {
            const res = await window.api.proxmox.wipeDisk(activeServer, nodeName, devpath);
            setCrudActionStatus({ type: 'success', text: t('nodeAdmin.wipeDiskStarted', { dev: devpath, task: res.taskId || 'OK' }) });
          } else {
            const res = await window.api.proxmox.initGptDisk(activeServer, nodeName, devpath);
            setCrudActionStatus({ type: 'success', text: t('nodeAdmin.initGptStarted', { dev: devpath, task: res.taskId || 'OK' }) });
          }
          await loadStorageAndDisks();
        } catch (err: any) {
          setCrudActionStatus({ type: 'error', text: err.message || t('nodeAdmin.diskOpError') });
        }
      },
    });
  };

  // Create VM Handlers
  const handleOpenCreateVM = async () => {
    if (!activeServer) return;
    try {
      const nextId = await window.api.proxmox.getNextVMID(activeServer);
      const defaultStorage = storages.find((s) => s.content?.includes('images') || s.type === 'lvmthin' || s.type === 'dir')?.storage || 'local-lvm';
      setCreateVMModal({
        isOpen: true,
        vmid: nextId || 100,
        name: `vm-${nextId || 100}`,
        cores: 2,
        memory: 2048,
        diskSize: 32,
        storage: defaultStorage,
        bridge: networks.find((n) => n.iface.startsWith('vmbr'))?.iface || 'vmbr0',
        startAfterCreate: true,
      });
    } catch {
      setCreateVMModal((prev) => ({ ...prev, isOpen: true }));
    }
  };

  const handleCreateVM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServer || !nodeName) return;
    try {
      const res = await window.api.proxmox.createVM(activeServer, nodeName, {
        vmid: Number(createVMModal.vmid),
        name: createVMModal.name.trim() || `vm-${createVMModal.vmid}`,
        cores: Number(createVMModal.cores) || 2,
        memory: Number(createVMModal.memory) || 2048,
        diskSize: Number(createVMModal.diskSize) || 32,
        storage: createVMModal.storage || undefined,
        bridge: createVMModal.bridge || 'vmbr0',
        startAfterCreate: createVMModal.startAfterCreate,
      });
      setCrudActionStatus({
        type: 'success',
        text: t('nodeAdmin.vmCreatedSuccess', { vmid: createVMModal.vmid, node: nodeName, task: res.taskId || 'OK' }),
      });
      setCreateVMModal((prev) => ({ ...prev, isOpen: false }));
      await refreshClusterData();
    } catch (err: any) {
      setCrudActionStatus({ type: 'error', text: err.message || t('nodeAdmin.vmCreateError') });
    }
  };

  // Create CT Handlers
  const handleOpenCreateCT = async () => {
    if (!activeServer) return;
    setLoadingTemplates(true);
    try {
      const [nextId, tmpls] = await Promise.all([
        window.api.proxmox.getNextVMID(activeServer).catch(() => 101),
        window.api.proxmox.getNodeTemplates(activeServer, nodeName).catch(() => []),
      ]);
      setAvailableTemplates(tmpls);

      const defaultStorage =
        storages.find((s) => s.content?.includes('rootdir') || s.type === 'lvmthin' || s.type === 'dir')?.storage ||
        storages[0]?.storage ||
        'local-lvm';
      const defaultBridge = networks.find((n) => n.iface.startsWith('vmbr'))?.iface || 'vmbr0';
      const defaultTmpl = tmpls[0]?.volid || '';

      setCreateCTModal({
        isOpen: true,
        vmid: nextId || 101,
        hostname: `ct-${nextId || 101}`,
        ostemplate: defaultTmpl,
        cores: 2,
        memory: 2048,
        swap: 512,
        diskSize: 8,
        storage: defaultStorage,
        bridge: defaultBridge,
        password: '',
        enableDocker: true,
        unprivileged: true,
        startAfterCreate: true,
      });
    } catch {
      setCreateCTModal((prev) => ({ ...prev, isOpen: true }));
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleCreateCT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServer || !nodeName) return;
    try {
      const res = await window.api.proxmox.createCT(activeServer, nodeName, {
        vmid: Number(createCTModal.vmid),
        hostname: createCTModal.hostname.trim() || `ct-${createCTModal.vmid}`,
        ostemplate: createCTModal.ostemplate.trim() || undefined,
        cores: Number(createCTModal.cores) || 2,
        memory: Number(createCTModal.memory) || 2048,
        swap: Number(createCTModal.swap) !== undefined ? Number(createCTModal.swap) : 512,
        diskSize: Number(createCTModal.diskSize) || 8,
        storage: createCTModal.storage || undefined,
        bridge: createCTModal.bridge || 'vmbr0',
        password: createCTModal.password || undefined,
        enableDocker: createCTModal.enableDocker,
        unprivileged: createCTModal.unprivileged,
        startAfterCreate: createCTModal.startAfterCreate,
      });
      setCrudActionStatus({
        type: 'success',
        text: t('nodeAdmin.ctCreatedSuccess', { vmid: createCTModal.vmid, node: nodeName, task: res.taskId || 'OK' }),
      });
      setCreateCTModal((prev) => ({ ...prev, isOpen: false }));
      await refreshClusterData();
    } catch (err: any) {
      setCrudActionStatus({ type: 'error', text: err.message || t('nodeAdmin.ctCreateError') });
    }
  };

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
        setTaskLog([t('nodeAdmin.taskLogLoadError')]);
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
        text: err.message || t('nodeAdmin.pveUpdatesError'),
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
            text: t('nodeAdmin.aptUpdateStarted'),
          });
          setTimeout(loadUpdates, 3000);
        } else {
          setUpdateStatusMsg({
            type: 'error',
            text: res.error || t('nodeAdmin.aptUpdateFailed'),
          });
        }
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || t('nodeAdmin.aptUpdateError'),
      });
    } finally {
      setRefreshingRepo(false);
    }
  };

  const handleInstallSingle = async (pkgName: string) => {
    if (!effectiveProfile) {
      setUpdateStatusMsg({
        type: 'error',
        text: t('nodeAdmin.hostSshInfoMissing'),
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
            text: t('nodeAdmin.pkgUpdatedSuccess', { pkg: pkgName }),
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
            text: res.error || t('nodeAdmin.pkgUpdateFailed', { pkg: pkgName }),
          });
        }
      }
    } catch (err: any) {
      setUpdateStatusMsg({
        type: 'error',
        text: err.message || t('nodeAdmin.pkgUpdateError'),
      });
    } finally {
      setInstallingPkg(null);
    }
  };

  const handleInstallAllSafe = async () => {
    if (!effectiveProfile) {
      setUpdateStatusMsg({
        type: 'error',
        text: t('nodeAdmin.hostSshInfoMissing'),
      });
      return;
    }

    const safePkgs = updates.filter((u) => !isKernelOrReboot(u.package)).map((u) => u.package);
    if (safePkgs.length === 0) {
      setUpdateStatusMsg({
        type: 'error',
        text: t('nodeAdmin.noSafeUpdatesRemaining'),
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
            errors.push(`${pkg}: ${res.error || 'error'}`);
          }
        }
      } catch (err: any) {
        errors.push(`${pkg}: ${err.message || 'error'}`);
      }
    }

    setInstallingAllSafe(false);
    setBatchProgress(null);

    if (errors.length === 0) {
      setUpdateStatusMsg({
        type: 'success',
        text: t('nodeAdmin.safePackagesUpdatedAll', { count: successCount }),
      });
    } else {
      setUpdateStatusMsg({
        type: 'error',
        text: t('nodeAdmin.updatedCountWithErrors', { count: successCount, errors: errors.join(', ') }),
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate">
      <div className="bg-white dark:bg-[#1E1E20] w-full max-w-6xl xl:max-w-7xl h-[88vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden modal-animate">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-[#18181A]/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {t('nodeAdmin.title', { node: nodeName })}
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
            <button
              onClick={handleOpenCreateVM}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
              title={t('nodeAdmin.createVmTitleTooltip')}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('nodeAdmin.createVm')}</span>
            </button>
            <button
              onClick={handleOpenCreateCT}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
              title={t('nodeAdmin.createCtTitleTooltip')}
            >
              <Box className="w-3.5 h-3.5" />
              <span>{t('nodeAdmin.createCt')}</span>
            </button>
            {onOpenTerminal && (
              <button
                onClick={onOpenTerminal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                title={t('nodeAdmin.openShellTooltip')}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{t('nodeAdmin.hostShell')}</span>
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
        <div className="flex items-center gap-1 px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1E1E20] overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{t('nodeAdmin.statusAndKernel')}</span>
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
            <span>{t('nodeAdmin.storageAndDisksCount', { count: storages.length + disks.length })}</span>
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
            <span>{t('nodeAdmin.networkBridgesCount', { count: networks.length })}</span>
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
              <span>{t('nodeAdmin.updatesApt')}</span>
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
            <span>{t('nodeAdmin.clusterTasksCount', { count: tasks.length })}</span>
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
            <span>{t('nodeAdmin.syslog')}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/50 dark:bg-[#161618]">
          {/* CRUD Status Alert */}
          {crudActionStatus && (
            <div
              className={`mb-4 px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                crudActionStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {crudActionStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                <span>{crudActionStatus.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setCrudActionStatus(null)}
                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW & HARDWARE STATUS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {loadingStatus ? (
                <div className="py-20 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>{t('nodeAdmin.loadingNodeStatus')}</span>
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
                            <span>{t('nodeAdmin.cpuLoadTitle')}</span>
                            <Cpu className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className={`text-2xl font-bold tracking-tight ${textColor}`}>{cpuPct}%</span>
                            {loadAvgStr && (
                              <span className="text-[11px] text-zinc-400 font-mono">LA: {loadAvgStr}</span>
                            )}
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${cpuColor}`}
                              style={{ width: `${Math.min(cpuVal, 100)}%` }}
                            />
                          </div>
                          <p className="mt-2.5 text-[11px] text-zinc-500 truncate" title={nodeStatus?.cpuinfo?.model || t('nodeAdmin.hostCpu')}>
                            {nodeStatus?.cpuinfo?.cpus ? `${nodeStatus.cpuinfo.cpus} CPU cores • ` : ''}
                            {nodeStatus?.cpuinfo?.model || t('nodeAdmin.loadingCores')}
                          </p>
                        </div>
                      );
                    })()}

                    {/* RAM Utilization */}
                    {(() => {
                      const memUsed = nodeStatus?.memory?.used || 0;
                      const memTotal = nodeStatus?.memory?.total || 1;
                      const memPct = Math.round((memUsed / memTotal) * 100);

                      return (
                        <div className="p-4 rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs">
                          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>{t('nodeAdmin.ram')}</span>
                            <Activity className="w-4 h-4 text-emerald-500" />
                          </div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                              {formatBytes(memUsed)} / {formatBytes(memTotal)}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                memPct > 85 ? 'bg-rose-500' : memPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(memPct, 100)}%` }}
                            />
                          </div>
                          <p className="mt-2.5 text-[11px] text-zinc-500">
                            {t('nodeAdmin.ramUsedPct', { pct: memPct })}
                          </p>
                        </div>
                      );
                    })()}

                    {/* SWAP Utilization */}
                    {(() => {
                      const swapUsed = nodeStatus?.swap?.used || 0;
                      const swapTotal = nodeStatus?.swap?.total || 0;
                      const swapPct = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;

                      return (
                        <div className="p-4 rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 shadow-xs">
                          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>{t('nodeAdmin.swap')}</span>
                            <Layers className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                              {formatBytes(swapUsed)} / {formatBytes(swapTotal)}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                swapPct > 80 ? 'bg-rose-500' : swapPct > 40 ? 'bg-amber-500' : 'bg-indigo-500'
                              }`}
                              style={{ width: `${Math.min(swapPct, 100)}%` }}
                            />
                          </div>
                          <p className="mt-2.5 text-[11px] text-zinc-500">
                            {swapTotal > 0 ? t('nodeAdmin.swapUsedPct', { pct: swapPct }) : t('nodeAdmin.swapNotConfigured')}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* System & Kernel Detailed Table */}
                  <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
                    <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-xs text-zinc-700 dark:text-zinc-200 flex items-center justify-between">
                      <span>{t('nodeAdmin.systemDetails')}</span>
                      <button
                        onClick={loadOverview}
                        className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-xs font-mono">
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">{t('nodeAdmin.pveManagerVersion')}</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{nodeStatus?.pveversion || 'Proxmox VE'}</span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">{t('nodeAdmin.kernelVersionLabel')}</span>
                        <span className="text-zinc-800 dark:text-zinc-200">{nodeStatus?.kversion || '—'}</span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">{t('nodeAdmin.nodeUptime')}</span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {nodeStatus?.uptime ? `${Math.floor(nodeStatus.uptime / 86400)}${t('common.daysShort')} ${Math.floor((nodeStatus.uptime % 86400) / 3600)}${t('common.hoursShort')}` : '—'}
                        </span>
                      </div>
                      <div className="px-5 py-2.5 flex justify-between">
                        <span className="text-zinc-500">{t('nodeAdmin.loadAverage')}</span>
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
                      {t('nodeAdmin.clusterStoragePools')}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStorageModal({
                        isOpen: true,
                        storage: '',
                        type: 'dir',
                        content: 'images,iso,backup',
                        path: '/var/lib/vz',
                        server: '',
                        export: '',
                        thinpool: '',
                        vgname: '',
                      })}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>{t('nodeAdmin.addStorageBtn')}</span>
                    </button>
                    <button
                      onClick={loadStorageAndDisks}
                      className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingStorage ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableStorageStatus')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableStorageName')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableStorageType')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableStorageContent')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableStorageUsage')}</th>
                        <th className="px-4 py-2.5 font-medium text-right">{t('nodeAdmin.tableStorageFree')}</th>
                        <th className="px-4 py-2.5 text-right font-medium">{t('nodeAdmin.tableStorageActions')}</th>
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
                                {s.active ? t('nodeAdmin.storageActive') : t('nodeAdmin.storageDisabled')}
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
                            <td className="px-4 py-2.5 text-right font-sans">
                              {s.storage === 'local' || s.storage === 'local-lvm' ? (
                                <span
                                  className="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 cursor-default"
                                  title={t('nodeAdmin.storageSystemTooltip')}
                                >
                                  {t('nodeAdmin.storageSystem')}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => requestDeleteStorage(s.storage)}
                                  title={t('nodeAdmin.storageDeleteTooltip')}
                                  className="p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
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
                      {t('nodeAdmin.disksTitle', { count: disks.length })}
                    </h4>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.health')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableDiskDev')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableDiskModel')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableDiskSerial')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableDiskType')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableDiskSize')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableDiskHealth')}</th>
                        <th className="px-4 py-2.5 text-right font-medium">{t('nodeAdmin.tableDiskManage')}</th>
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
                            <td className="px-4 py-2.5 font-sans">
                              {d.wearout !== undefined ? t('nodeAdmin.diskWearout', { wearout: d.wearout }) : ''}
                              {d.temperature !== undefined ? ` ${d.temperature}°C` : ''}
                              {d.wearout === undefined && d.temperature === undefined ? '—' : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right font-sans">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => requestDiskAction(d.devpath, 'initgpt')}
                                  title={t('nodeAdmin.initGptTooltip')}
                                  className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] transition-colors cursor-pointer"
                                >
                                  Init GPT
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDiskAction(d.devpath, 'wipe')}
                                  title={t('nodeAdmin.wipeDiskTooltip')}
                                  className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-[11px] transition-colors cursor-pointer"
                                >
                                  Wipe
                                </button>
                              </div>
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
                    {t('nodeAdmin.networkTitle')}
                  </h4>
                  {networkPendingChanges && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                      {t('nodeAdmin.hasPendingChanges')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {networkPendingChanges && (
                    <>
                      <button
                        onClick={handleApplyNetwork}
                        disabled={applyingNetwork}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        title={t('nodeAdmin.applyNetworkTooltip')}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{applyingNetwork ? t('nodeAdmin.applying') : t('nodeAdmin.applyChanges')}</span>
                      </button>
                      <button
                        onClick={handleRevertNetwork}
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                        title={t('nodeAdmin.revertChangesTooltip')}
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      const nextIfaceNum = networks.filter((n) => n.iface.startsWith('vmbr')).length;
                      setNetworkModal({
                        isOpen: true,
                        mode: 'create',
                        iface: `vmbr${nextIfaceNum}`,
                        type: 'bridge',
                        cidr: '',
                        gateway: '',
                        bridge_ports: '',
                        autostart: true,
                        comments: '',
                      });
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('nodeAdmin.createBridgeBtn')}</span>
                  </button>
                  <button
                    onClick={loadNetwork}
                    className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingNetwork ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetState')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetIface')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetType')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetIp')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetGateway')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetPorts')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableNetComment')}</th>
                      <th className="px-4 py-2.5 text-right font-medium">{t('nodeAdmin.tableNetActions')}</th>
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
                        <td className="px-4 py-2.5 text-zinc-400 font-sans">{net.comments || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-sans">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setNetworkModal({
                                isOpen: true,
                                mode: 'edit',
                                iface: net.iface,
                                type: net.type,
                                cidr: net.cidr || net.address || '',
                                gateway: net.gateway || '',
                                bridge_ports: net.bridge_ports || net.slaves || '',
                                autostart: net.autostart !== false,
                                comments: net.comments || '',
                              })}
                              title={t('nodeAdmin.editIfaceTooltip')}
                              className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={net.iface === 'vmbr0'}
                              onClick={() => handleDeleteNetwork(net.iface)}
                              title={net.iface === 'vmbr0' ? t('nodeAdmin.vmbr0ProtectTooltip') : t('nodeAdmin.deleteIfaceTooltip')}
                              className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400"
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
                    placeholder={t('nodeAdmin.searchTasksPlaceholder')}
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1E1E20] text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={loadTasks}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTasks ? 'animate-spin' : ''}`} />
                  <span>{t('nodeAdmin.refreshTasksBtn')}</span>
                </button>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#1E1E20] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableTaskStatus')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableTaskType')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableTaskId')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableTaskUser')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('nodeAdmin.tableTaskStart')}</th>
                        <th className="px-4 py-2.5 text-right font-medium">{t('nodeAdmin.tableTaskLog')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                      {filteredTasks.map((taskItem) => {
                        const isOk = !taskItem.status || taskItem.status === 'OK';
                        return (
                          <tr key={taskItem.upid} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isOk
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {taskItem.status || 'OK'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold text-zinc-900 dark:text-zinc-100">{taskItem.type}</td>
                            <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400">{taskItem.id || '—'}</td>
                            <td className="px-4 py-2.5 text-zinc-500 font-sans">{taskItem.user}</td>
                            <td className="px-4 py-2.5 text-zinc-400 text-[11px]">
                              {new Date(taskItem.starttime * 1000).toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => loadSingleTaskLog(taskItem.upid)}
                                className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-zinc-700 dark:text-zinc-300 hover:text-blue-600 text-[11px] font-sans transition-colors cursor-pointer"
                              >
                                {t('nodeAdmin.viewLogBtn')}
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
                    <span className="text-[11px] text-zinc-400 truncate max-w-lg">{t('nodeAdmin.logUpid', { upid: selectedTaskUpid })}</span>
                    <button onClick={() => setSelectedTaskUpid(null)} className="text-zinc-400 hover:text-zinc-200">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {loadingTaskLog ? (
                    <div className="py-6 text-center text-zinc-500">{t('nodeAdmin.loadingTaskLog')}</div>
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
                      placeholder={t('nodeAdmin.filterLogsPlaceholder')}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1E1E20] text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
                    />
                  </div>
                  <select
                    value={syslogFilter}
                    onChange={(e: any) => setSyslogFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#1E1E20] text-xs text-zinc-700 dark:text-zinc-300"
                  >
                    <option value="all">{t('nodeAdmin.logsAll')}</option>
                    <option value="warn">{t('nodeAdmin.logsWarn')}</option>
                    <option value="error">{t('nodeAdmin.logsError')}</option>
                  </select>
                </div>

                <button
                  onClick={loadSyslog}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSyslog ? 'animate-spin' : ''}`} />
                  <span>{t('nodeAdmin.refreshSyslogBtn')}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 text-zinc-200 font-mono text-[11px] border border-zinc-800 shadow-inner max-h-[520px] overflow-y-auto leading-relaxed select-text">
                {filteredSyslog.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500">{t('nodeAdmin.noSyslogEntries')}</div>
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
                      placeholder={t('nodeAdmin.searchPkgsPlaceholder')}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-[#161618] border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
                    />
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{t('nodeAdmin.safePkgsCount', { count: safeCount })}</span>
                  </span>

                  {rebootCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>{t('nodeAdmin.rebootPkgsCount', { count: rebootCount })}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshRepo}
                    disabled={refreshingRepo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                    title={t('nodeAdmin.aptUpdateTooltip')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingRepo ? 'animate-spin text-amber-500' : ''}`} />
                    <span>{refreshingRepo ? t('nodeAdmin.refreshingRepoIndex') : 'apt update'}</span>
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
                            {t('vmDetail.installingPkgProgress', { current: batchProgress.current, total: batchProgress.total, name: batchProgress.currentPackage })} ({batchProgress.percent}%)...
                          </span>
                        </>
                      ) : (
                        <>
                          <Download className={`w-3.5 h-3.5 ${installingAllSafe ? 'animate-bounce' : ''}`} />
                          <span>{installingAllSafe ? t('nodeAdmin.installingCount') : t('nodeAdmin.installSafeCount', { count: safeCount })}</span>
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
                      {t('vmDetail.installingPkgProgress', { current: batchProgress.current, total: batchProgress.total, name: '' })}{' '}
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
                    <span className="text-xs">{t('nodeAdmin.checkingUpdates')}</span>
                  </div>
                ) : filteredUpdates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-zinc-400 text-xs gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {t('nodeAdmin.allPackagesUpToDate')}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {t('nodeAdmin.pressAptUpdate')}
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
                                  {t('nodeAdmin.kernelRestart')}
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
                          title={t('nodeAdmin.installThisUpdate')}
                        >
                          <Download className={`w-3.5 h-3.5 ${isInstallingThis ? 'animate-bounce text-amber-500' : ''}`} />
                          <span>{isInstallingThis ? t('nodeAdmin.installingCount') : t('vmDetail.updatePkg')}</span>
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
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('nodeAdmin.hostPasswordTitle')}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t('nodeAdmin.hostPasswordDesc')}
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
                  {t('nodeAdmin.hostPasswordLabel', { user: effectiveProfile?.username || 'root', host: effectiveProfile?.host || activeServer?.host || '' })}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    autoFocus
                    placeholder={t('nodeAdmin.hostPasswordPlaceholder')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!tempPasswordInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create VM */}
      {createVMModal.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#202023] w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 flex flex-col gap-4 modal-animate">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 pb-3">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold text-sm">
                <Plus className="w-4 h-4 text-blue-500" />
                <span>{t('nodeAdmin.createVmModalTitle', { node: nodeName })}</span>
              </div>
              <button
                onClick={() => setCreateVMModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateVM} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">VM ID *</label>
                  <input
                    type="number"
                    required
                    value={createVMModal.vmid}
                    onChange={(e) => setCreateVMModal((prev) => ({ ...prev, vmid: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.vmNameLabel')}</label>
                  <input
                    type="text"
                    required
                    value={createVMModal.name}
                    onChange={(e) => setCreateVMModal((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="my-ubuntu-server"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.coresLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={128}
                    value={createVMModal.cores}
                    onChange={(e) => setCreateVMModal((prev) => ({ ...prev, cores: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.ramMbLabel')}</label>
                  <input
                    type="number"
                    min={512}
                    step={512}
                    value={createVMModal.memory}
                    onChange={(e) => setCreateVMModal((prev) => ({ ...prev, memory: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.diskStorageLabel')}</label>
                  <select
                    value={createVMModal.storage}
                    onChange={(e) => setCreateVMModal((prev) => ({ ...prev, storage: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  >
                    {storages.map((s) => (
                      <option key={s.storage} value={s.storage}>
                        {s.storage} ({s.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.diskSizeLabel')}</label>
                  <input
                    type="number"
                    min={4}
                    value={createVMModal.diskSize}
                    onChange={(e) => setCreateVMModal((prev) => ({ ...prev, diskSize: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.bridgeLabel')}</label>
                <select
                  value={createVMModal.bridge}
                  onChange={(e) => setCreateVMModal((prev) => ({ ...prev, bridge: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                >
                  {networks.filter((n) => n.type === 'bridge' || n.iface.startsWith('vmbr')).map((n) => (
                    <option key={n.iface} value={n.iface}>
                      {n.iface} {n.comments ? `(${n.comments})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="startVmAfterCreate"
                  checked={createVMModal.startAfterCreate}
                  onChange={(e) => setCreateVMModal((prev) => ({ ...prev, startAfterCreate: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="startVmAfterCreate" className="text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  {t('nodeAdmin.startVmAfterCreate')}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setCreateVMModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                >
                  {t('nodeAdmin.createVm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Container (LXC / Docker) */}
      {createCTModal.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#202023] w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 flex flex-col gap-4 modal-animate my-8">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 pb-3">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold text-sm">
                <Box className="w-4 h-4 text-indigo-500" />
                <span>{t('nodeAdmin.createCtModal.title', { node: nodeName })}</span>
              </div>
              <button
                onClick={() => setCreateCTModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCT} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.ctId')} *</label>
                  <input
                    type="number"
                    required
                    value={createCTModal.vmid}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, vmid: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.hostname')} *</label>
                  <input
                    type="text"
                    required
                    value={createCTModal.hostname}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, hostname: e.target.value }))}
                    placeholder="docker-app"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Template selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-zinc-700 dark:text-zinc-300">{t('nodeAdmin.createCtModal.template')}</label>
                  {loadingTemplates && <span className="text-[10px] text-zinc-400">{t('common.loading')}</span>}
                </div>
                {availableTemplates.length > 0 ? (
                  <select
                    value={createCTModal.ostemplate}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, ostemplate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono text-[11px]"
                  >
                    {availableTemplates.map((t) => (
                      <option key={t.volid} value={t.volid}>
                        {t.volid} {t.size ? `(${(t.size / 1024 / 1024).toFixed(0)} MB)` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={createCTModal.ostemplate}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, ostemplate: e.target.value }))}
                    placeholder="local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono text-[11px]"
                  />
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.rootPassword')}</label>
                <input
                  type="password"
                  value={createCTModal.password}
                  onChange={(e) => setCreateCTModal((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder={t('nodeAdmin.createCtModal.rootPassword')}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              {/* Resources: CPU, RAM, Swap */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.cores')}</label>
                  <input
                    type="number"
                    min={1}
                    max={128}
                    value={createCTModal.cores}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, cores: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.memory')}</label>
                  <input
                    type="number"
                    min={256}
                    step={256}
                    value={createCTModal.memory}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, memory: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.swap')}</label>
                  <input
                    type="number"
                    min={0}
                    step={256}
                    value={createCTModal.swap}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, swap: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Storage & Disk */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.storage')}</label>
                  <select
                    value={createCTModal.storage}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, storage: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  >
                    {storages.map((s) => (
                      <option key={s.storage} value={s.storage}>
                        {s.storage} ({s.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.diskSize')}</label>
                  <input
                    type="number"
                    min={2}
                    value={createCTModal.diskSize}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, diskSize: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Bridge */}
              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.createCtModal.bridge')}</label>
                <select
                  value={createCTModal.bridge}
                  onChange={(e) => setCreateCTModal((prev) => ({ ...prev, bridge: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                >
                  {networks.filter((n) => n.type === 'bridge' || n.iface.startsWith('vmbr')).map((n) => (
                    <option key={n.iface} value={n.iface}>
                      {n.iface} {n.comments ? `(${n.comments})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Docker / Nesting Feature Card */}
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enableDockerInCt"
                    checked={createCTModal.enableDocker}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, enableDocker: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="enableDockerInCt" className="text-zinc-900 dark:text-zinc-100 font-semibold cursor-pointer text-xs">
                    {t('nodeAdmin.createCtModal.dockerSupport')}
                  </label>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pl-5 leading-relaxed">
                  {t('nodeAdmin.createCtModal.dockerSupportDesc')}
                </p>
              </div>

              {/* Other checkboxes */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="unprivilegedCt"
                    checked={createCTModal.unprivileged}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, unprivileged: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="unprivilegedCt" className="text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    {t('nodeAdmin.createCtModal.unprivileged')}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="startCtAfterCreate"
                    checked={createCTModal.startAfterCreate}
                    onChange={(e) => setCreateCTModal((prev) => ({ ...prev, startAfterCreate: e.target.checked }))}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="startCtAfterCreate" className="text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    {t('nodeAdmin.createCtModal.startAfterCreate')}
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setCreateCTModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs cursor-pointer"
                >
                  {t('nodeAdmin.createCtModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Network Bridge Form (Create/Edit) */}
      {networkModal.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#202023] w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 flex flex-col gap-4 modal-animate">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 pb-3">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold text-sm">
                <Network className="w-4 h-4 text-blue-500" />
                <span>{networkModal.mode === 'create' ? t('nodeAdmin.createBridgeTitle') : t('nodeAdmin.editIfaceTitle', { iface: networkModal.iface })}</span>
              </div>
              <button
                onClick={() => setNetworkModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNetwork} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.ifaceNameLabel')}</label>
                <input
                  type="text"
                  required
                  disabled={networkModal.mode === 'edit'}
                  value={networkModal.iface}
                  onChange={(e) => setNetworkModal((prev) => ({ ...prev, iface: e.target.value }))}
                  placeholder="vmbr0"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">IPv4/CIDR</label>
                  <input
                    type="text"
                    value={networkModal.cidr}
                    onChange={(e) => setNetworkModal((prev) => ({ ...prev, cidr: e.target.value }))}
                    placeholder="192.168.1.10/24"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.tableNetGateway')}</label>
                  <input
                    type="text"
                    value={networkModal.gateway}
                    onChange={(e) => setNetworkModal((prev) => ({ ...prev, gateway: e.target.value }))}
                    placeholder="192.168.1.1"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.bridgePortsLabel')}</label>
                <input
                  type="text"
                  value={networkModal.bridge_ports}
                  onChange={(e) => setNetworkModal((prev) => ({ ...prev, bridge_ports: e.target.value }))}
                  placeholder={t('nodeAdmin.bridgePortsPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.commentLabel')}</label>
                <input
                  type="text"
                  value={networkModal.comments}
                  onChange={(e) => setNetworkModal((prev) => ({ ...prev, comments: e.target.value }))}
                  placeholder={t('nodeAdmin.commentPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="netAutostart"
                  checked={networkModal.autostart}
                  onChange={(e) => setNetworkModal((prev) => ({ ...prev, autostart: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="netAutostart" className="text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  {t('nodeAdmin.autostartLabel')}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setNetworkModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                >
                  {t('nodeAdmin.saveIfaceBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Storage */}
      {storageModal.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#202023] w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 flex flex-col gap-4 modal-animate">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 pb-3">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold text-sm">
                <FolderPlus className="w-4 h-4 text-blue-500" />
                <span>{t('nodeAdmin.connectStorageTitle')}</span>
              </div>
              <button
                onClick={() => setStorageModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStorage} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.storageIdLabel')}</label>
                <input
                  type="text"
                  required
                  value={storageModal.storage}
                  onChange={(e) => setStorageModal((prev) => ({ ...prev, storage: e.target.value }))}
                  placeholder={t('nodeAdmin.storageIdPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.storageTypeLabel')}</label>
                <select
                  value={storageModal.type}
                  onChange={(e: any) => setStorageModal((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                >
                  <option value="dir">Directory</option>
                  <option value="nfs">NFS</option>
                  <option value="lvmthin">LVM-Thin Pool</option>
                </select>
              </div>

              {storageModal.type === 'dir' && (
                <div>
                  <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.dirPathLabel')}</label>
                  <input
                    type="text"
                    required
                    value={storageModal.path}
                    onChange={(e) => setStorageModal((prev) => ({ ...prev, path: e.target.value }))}
                    placeholder="/mnt/storage"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                  />
                </div>
              )}

              {storageModal.type === 'nfs' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.nfsServerLabel')}</label>
                    <input
                      type="text"
                      required
                      value={storageModal.server}
                      onChange={(e) => setStorageModal((prev) => ({ ...prev, server: e.target.value }))}
                      placeholder="192.168.1.50"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">Export Path *</label>
                    <input
                      type="text"
                      required
                      value={storageModal.export}
                      onChange={(e) => setStorageModal((prev) => ({ ...prev, export: e.target.value }))}
                      placeholder="/export/data"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                    />
                  </div>
                </div>
              )}

              {storageModal.type === 'lvmthin' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">Volume Group (vgname) *</label>
                    <input
                      type="text"
                      required
                      value={storageModal.vgname}
                      onChange={(e) => setStorageModal((prev) => ({ ...prev, vgname: e.target.value }))}
                      placeholder="pve"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">Thin Pool *</label>
                    <input
                      type="text"
                      required
                      value={storageModal.thinpool}
                      onChange={(e) => setStorageModal((prev) => ({ ...prev, thinpool: e.target.value }))}
                      placeholder="data"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('nodeAdmin.contentLabel')}</label>
                <input
                  type="text"
                  value={storageModal.content}
                  onChange={(e) => setStorageModal((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="images,iso,backup,snippets"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-1">{t('nodeAdmin.contentTypesHint')}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setStorageModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                >
                  {t('nodeAdmin.connectStorageBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Protected Dangerous Action Confirmation (Storage / Disks) */}
      {dangerModal && dangerModal.isOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1E1E22] w-full max-w-md rounded-2xl border-2 border-rose-500/60 dark:border-rose-500/50 shadow-2xl p-6 flex flex-col gap-4 modal-animate">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {dangerModal.title}
                </h3>
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                  {t('nodeAdmin.criticalOpBanner')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDangerModal(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
              {dangerModal.description}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-zinc-700 dark:text-zinc-300">
                {t('nodeAdmin.typeToUnlockConfirm')}{' '}
                <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-rose-600 dark:text-rose-400 font-mono font-bold">
                  {dangerModal.expectedConfirmText}
                </code>
                :
              </label>
              <input
                type="text"
                autoFocus
                value={dangerInputText}
                onChange={(e) => setDangerInputText(e.target.value)}
                placeholder={dangerModal.expectedConfirmText}
                className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono focus:outline-hidden focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setDangerModal(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={dangerInputText.trim() !== dangerModal.expectedConfirmText}
                onClick={async () => {
                  const onConf = dangerModal.onConfirm;
                  setDangerModal(null);
                  await onConf();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors disabled:opacity-30 disabled:hover:bg-rose-600 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('nodeAdmin.confirmDestruction')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};