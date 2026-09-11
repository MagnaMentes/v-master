import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type {
  ProxmoxServerConfig,
  ProxmoxNode,
  ProxmoxVM,
  SSHProfile,
  Snippet,
  TerminalTab,
  TerminalPane,
  SystemUpdate,
  VMResourceAlert,
  VMOSMetrics,
} from '../types';

export interface VMUpdateState {
  updates: SystemUpdate[];
  hasCritical: boolean;
  hasDangerousOnly: boolean;
  safeCount: number;
  isLoading: boolean;
  error?: string;
}

interface AppContextType {
  servers: ProxmoxServerConfig[];
  activeServer: ProxmoxServerConfig | null;
  nodes: ProxmoxNode[];
  vms: ProxmoxVM[];
  selectedVM: ProxmoxVM | null;
  sshProfiles: SSHProfile[];
  snippets: Snippet[];
  tabs: TerminalTab[];
  activeTabId: string | null;
  activeView: 'dashboard' | 'vm-detail' | 'terminal' | 'sftp' | 'snippets' | 'settings';
  isLoading: boolean;
  error: string | null;
  vmUpdates: Record<number, VMUpdateState>;
  vmAlerts: Record<number, VMResourceAlert>;
  vmOSMetrics: Record<number, VMOSMetrics>;

  // Actions
  updateVMOSMetrics: (vmid: number, metrics: Omit<VMOSMetrics, 'updatedAt'>) => void;
  fetchVMOSMetrics: (vmid: number) => Promise<void>;
  setActiveView: (view: 'dashboard' | 'vm-detail' | 'terminal' | 'sftp' | 'snippets' | 'settings') => void;
  selectServer: (server: ProxmoxServerConfig) => void;
  selectVM: (vm: ProxmoxVM | null) => void;
  loadServers: () => Promise<void>;
  saveServer: (server: ProxmoxServerConfig) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  refreshClusterData: (isSilent?: boolean) => Promise<void>;
  
  // SSH & Terminal Actions
  loadSSHProfiles: () => Promise<void>;
  saveSSHProfile: (profile: SSHProfile) => Promise<void>;
  deleteSSHProfile: (id: string) => Promise<void>;
  openTerminalForVM: (vm: ProxmoxVM, connectionType?: 'ssh' | 'proxmox-console') => void;
  openTerminalForNode: (nodeName: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTabId: (tabId: string) => void;
  setActivePaneId: (tabId: string, paneId: string) => void;
  splitPane: (tabId: string, direction: 'split-horizontal' | 'split-vertical') => void;
  closePane: (tabId: string, paneId: string) => void;
  
  // Snippets
  loadSnippets: () => Promise<void>;
  saveSnippet: (snippet: Snippet) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  sendSnippetToTerminal: (command: string) => void;

  // OS Updates
  checkVMUpdates: (vmid: number) => Promise<void>;
  checkAllVMUpdates: () => Promise<void>;
  installVMUpdate: (vmid: number, packageName: string, sudoPassword?: string) => Promise<{ success: boolean; error?: string }>;
  installAllSafeVMUpdates: (
    vmid: number,
    packageNames: string[],
    sudoPassword?: string
  ) => Promise<{ success: boolean; installedCount?: number; error?: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [servers, setServers] = useState<ProxmoxServerConfig[]>([]);
  const [activeServer, setActiveServer] = useState<ProxmoxServerConfig | null>(null);
  const [nodes, setNodes] = useState<ProxmoxNode[]>([]);
  const [vms, setVms] = useState<ProxmoxVM[]>([]);
  const [selectedVM, setSelectedVM] = useState<ProxmoxVM | null>(null);
  const [sshProfiles, setSshProfiles] = useState<SSHProfile[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'vm-detail' | 'terminal' | 'sftp' | 'snippets' | 'settings'>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [vmUpdates, setVmUpdates] = useState<Record<number, VMUpdateState>>({});
  const [vmAlerts, setVmAlerts] = useState<Record<number, VMResourceAlert>>({});
  const [vmOSMetrics, setVmOSMetrics] = useState<Record<number, VMOSMetrics>>({});
  const vmOSMetricsRef = useRef(vmOSMetrics);
  vmOSMetricsRef.current = vmOSMetrics;

  // Load initial data
  const loadServers = useCallback(async () => {
    try {
      if (window.api?.store?.getServers) {
        const list = await window.api.store.getServers();
        setServers(list);
        if (list.length > 0 && !activeServer) {
          setActiveServer(list[0]);
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [activeServer]);

  const loadSSHProfiles = useCallback(async () => {
    try {
      if (window.api?.store?.getSSHProfiles) {
        const list = await window.api.store.getSSHProfiles();
        setSshProfiles(list);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const loadSnippets = useCallback(async () => {
    try {
      if (window.api?.store?.getSnippets) {
        const list = await window.api.store.getSnippets();
        setSnippets(list);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const isRefreshingRef = useRef(false);

  // Refresh Cluster Data
  const refreshClusterData = useCallback(async (isSilent: boolean = false) => {
    if (!activeServer || isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    if (!isSilent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const fetchedNodes = await window.api.proxmox.getNodes(activeServer);
      setNodes(fetchedNodes);

      // Fetch VMs across all online nodes
      const allVMs: ProxmoxVM[] = [];
      for (const node of fetchedNodes) {
        if (node.status === 'online') {
          try {
            const nodeVMs = await window.api.proxmox.getVMs(activeServer, node.node);
            allVMs.push(...nodeVMs);
          } catch (err) {
            console.error(`Error loading VMs for node ${node.node}:`, err);
          }
        }
      }
      allVMs.sort((a, b) => a.vmid - b.vmid);
      setVms(allVMs);

      // Compute resource usage alerts
      const alerts: Record<number, VMResourceAlert> = {};
      for (const vm of allVMs) {
        if (vm.status === 'running') {
          const cpuPct = vm.cpu ? Math.round(vm.cpu * 1000) / 10 : 0;
          const osMetric = vmOSMetricsRef.current[vm.vmid];
          let ramPct = 0;
          let ramOverload = false;

          if (osMetric) {
            ramPct = osMetric.percent;
            ramOverload = ramPct >= 90;
          } else if (vm.freemem !== undefined && vm.freemem > 0 && vm.maxmem && vm.freemem <= vm.maxmem) {
            const actualMemUsed = vm.maxmem - vm.freemem;
            ramPct = Math.round((actualMemUsed / vm.maxmem) * 1000) / 10;
            ramOverload = ramPct >= 90;
          } else {
            // Raw KVM host RSS allocation: does not represent internal guest OS memory.
            ramPct = vm.maxmem ? Math.round(((vm.mem || 0) / vm.maxmem) * 1000) / 10 : 0;
            ramOverload = false;
          }

          const diskPct = vm.disk && vm.maxdisk ? Math.round((vm.disk / vm.maxdisk) * 1000) / 10 : 0;

          // Thresholds: CPU > 85%, RAM > 90%, Disk > 90%
          const cpuOverload = cpuPct >= 85;
          const diskOverload = diskPct >= 90;

          const hasAlert = cpuOverload || ramOverload || diskOverload;
          const isCritical = cpuPct >= 95 || ramPct >= 96 || diskPct >= 95;

          if (hasAlert) {
            alerts[vm.vmid] = {
              vmid: vm.vmid,
              cpuOverload,
              cpuPercent: cpuPct,
              ramOverload,
              ramPercent: ramPct,
              diskOverload,
              diskPercent: diskPct,
              hasAlert: true,
              severity: isCritical ? 'critical' : 'warning',
            };
          }
        }
      }
      setVmAlerts(alerts);

      // Update selected VM reference if active
      setSelectedVM((prev) => {
        if (!prev) return null;
        const updated = allVMs.find((v) => v.vmid === prev.vmid);
        if (!updated) return prev;
        // Avoid updating reference if critical fields haven't changed to prevent unnecessary re-renders
        if (
          updated.status === prev.status &&
          updated.cpu === prev.cpu &&
          updated.mem === prev.mem &&
          updated.maxmem === prev.maxmem &&
          updated.disk === prev.disk &&
          updated.maxdisk === prev.maxdisk &&
          updated.uptime === prev.uptime
        ) {
          return prev;
        }
        return updated;
      });
    } catch (e: any) {
      if (!isSilent) {
        setError(e.message || 'Помилка підключення до Proxmox');
      }
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }, [activeServer]);

  useEffect(() => {
    loadServers();
    loadSSHProfiles();
    loadSnippets();
  }, [loadServers, loadSSHProfiles, loadSnippets]);

  useEffect(() => {
    if (activeServer) {
      refreshClusterData(false);

      // Background safe polling every 6 seconds when window is visible
      const interval = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        refreshClusterData(true);
      }, 6000);

      return () => clearInterval(interval);
    } else {
      setNodes([]);
      setVms([]);
      setSelectedVM(null);
    }
  }, [activeServer, refreshClusterData]);

  const selectServer = (server: ProxmoxServerConfig) => {
    setActiveServer(server);
    setSelectedVM(null);
  };

  const selectVM = (vm: ProxmoxVM | null) => {
    setSelectedVM(vm);
    if (vm) {
      setActiveView('vm-detail');
    }
  };

  const saveServer = async (server: ProxmoxServerConfig) => {
    await window.api.store.saveServer(server);
    await loadServers();
    if (!activeServer || activeServer.id === server.id) {
      setActiveServer(server);
    }
  };

  const deleteServer = async (id: string) => {
    await window.api.store.deleteServer(id);
    if (activeServer?.id === id) {
      setActiveServer(null);
    }
    await loadServers();
  };

  const saveSSHProfile = async (profile: SSHProfile) => {
    await window.api.store.saveSSHProfile(profile);
    await loadSSHProfiles();
  };

  const deleteSSHProfile = async (id: string) => {
    await window.api.store.deleteSSHProfile(id);
    await loadSSHProfiles();
  };

  const saveSnippet = async (snippet: Snippet) => {
    await window.api.store.saveSnippet(snippet);
    await loadSnippets();
  };

  const deleteSnippet = async (id: string) => {
    await window.api.store.deleteSnippet(id);
    await loadSnippets();
  };

  const openTerminalForVM = (vm: ProxmoxVM, connectionType: 'ssh' | 'proxmox-console' = 'ssh') => {
    const tabId = `tab-${vm.vmid}-${Date.now()}`;
    const paneId = `pane-${Date.now()}`;
    const sessionId = `session-${vm.vmid}-${Date.now()}`;

    // Look for matching SSH profile
    const profile = sshProfiles.find((p) => p.vmid === vm.vmid) || {
      id: `temp-${vm.vmid}`,
      name: `${vm.name} (Auto)`,
      host: vm.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : '',
      port: 22,
      username: '',
      authType: 'privateKey',
      privateKeyPath: '~/.ssh/id_ed25519',
      vmid: vm.vmid,
      node: vm.node,
    };

    const initialPane: TerminalPane = {
      id: paneId,
      sessionId,
      title: `${vm.name} (#1)`,
      connected: false,
      sshProfileId: profile.id,
      host: profile.host,
      vmid: vm.vmid,
    };

    const newTab: TerminalTab = {
      id: tabId,
      title: `${vm.name} (${vm.vmid})`,
      vmid: vm.vmid,
      node: vm.node,
      serverId: activeServer?.id,
      connectionType,
      activePaneId: paneId,
      panes: [initialPane],
      layout: 'single',
    };

    setSelectedVM(vm);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setActiveView('terminal');
  };

  const openTerminalForNode = (nodeName: string) => {
    const tabId = `tab-node-${nodeName}-${Date.now()}`;
    const paneId = `pane-${Date.now()}`;
    const sessionId = `session-node-${nodeName}-${Date.now()}`;

    const profile = sshProfiles.find(
      (p) =>
        p.name.toLowerCase().includes(nodeName.toLowerCase()) ||
        (activeServer?.host && p.host === activeServer.host)
    ) || {
      id: `temp-node-${nodeName}`,
      name: `${nodeName} (Proxmox)`,
      host: activeServer?.host || '',
      port: 22,
      username: 'root',
      authType: 'privateKey' as const,
      privateKeyPath: '~/.ssh/id_ed25519',
      node: nodeName,
    };

    const initialPane: TerminalPane = {
      id: paneId,
      sessionId,
      title: `${nodeName} (Shell)`,
      connected: false,
      sshProfileId: profile.id,
      host: profile.host,
    };

    const newTab: TerminalTab = {
      id: tabId,
      title: `Вузол: ${nodeName}`,
      node: nodeName,
      serverId: activeServer?.id,
      connectionType: 'ssh',
      activePaneId: paneId,
      panes: [initialPane],
      layout: 'single',
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setActiveView('terminal');
  };

  const closeTab = (tabId: string) => {
    const tabToClose = tabs.find((t) => t.id === tabId);
    const targetVM = tabToClose?.vmid
      ? vms.find((v) => v.vmid === tabToClose.vmid) || (selectedVM?.vmid === tabToClose.vmid ? selectedVM : null)
      : selectedVM;

    const isCurrentActive = activeTabId === tabId;
    const remaining = tabs.filter((t) => t.id !== tabId);

    setTabs(remaining);

    if (isCurrentActive) {
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      } else {
        setActiveTabId(null);
      }

      if (targetVM) {
        setSelectedVM(targetVM);
        setActiveView('vm-detail');
      } else if (remaining.length === 0) {
        setActiveView('dashboard');
      }
    } else if (remaining.length === 0) {
      setActiveTabId(null);
      if (targetVM) {
        setSelectedVM(targetVM);
        setActiveView('vm-detail');
      } else {
        setActiveView('dashboard');
      }
    }
  };

  const setActivePaneId = (tabId: string, paneId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t))
    );
  };

  const splitPane = (tabId: string, layout: 'split-horizontal' | 'split-vertical') => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        if (t.panes.length >= 4) return t; // Max 4 panes

        const newPaneId = `pane-${Date.now()}`;
        const newSessionId = `session-${t.vmid}-${Date.now()}`;
        const newPane: TerminalPane = {
          id: newPaneId,
          sessionId: newSessionId,
          title: `${t.title} (#${t.panes.length + 1})`,
          connected: false,
          vmid: t.vmid,
        };

        return {
          ...t,
          panes: [...t.panes, newPane],
          layout,
          activePaneId: newPaneId,
        };
      })
    );
  };

  const closePane = (tabId: string, paneId: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const newPanes = t.panes.filter((p) => p.id !== paneId);
        if (newPanes.length === 0) return t;
        return {
          ...t,
          panes: newPanes,
          activePaneId: newPanes[0].id,
          layout: newPanes.length === 1 ? 'single' : t.layout,
        };
      })
    );
  };

  const sendSnippetToTerminal = (command: string) => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const pane = tab.panes.find((p) => p.id === tab.activePaneId) || tab.panes[0];
    if (pane && window.api?.ssh?.write) {
      window.api.ssh.write(pane.sessionId, command + '\n');
    }
  };

  const updateVMOSMetrics = useCallback(
    (vmid: number, metrics: Omit<VMOSMetrics, 'updatedAt'>) => {
      setVmOSMetrics((prev) => ({
        ...prev,
        [vmid]: {
          ...metrics,
          updatedAt: Date.now(),
        },
      }));

      setVmAlerts((prev) => {
        const vm = vms.find((v) => v.vmid === vmid) || (selectedVM?.vmid === vmid ? selectedVM : null);
        if (!vm || vm.status !== 'running') {
          if (!prev[vmid]) return prev;
          const next = { ...prev };
          delete next[vmid];
          return next;
        }

        const cpuPct = vm.cpu ? Math.round(vm.cpu * 1000) / 10 : 0;
        const ramPct = metrics.percent;
        const diskPct = vm.disk && vm.maxdisk ? Math.round((vm.disk / vm.maxdisk) * 1000) / 10 : 0;

        const cpuOverload = cpuPct >= 85;
        const ramOverload = ramPct >= 90;
        const diskOverload = diskPct >= 90;

        const hasAlert = cpuOverload || ramOverload || diskOverload;
        const isCritical = cpuPct >= 95 || ramPct >= 96 || diskPct >= 95;

        if (hasAlert) {
          return {
            ...prev,
            [vmid]: {
              vmid,
              cpuOverload,
              cpuPercent: cpuPct,
              ramOverload,
              ramPercent: ramPct,
              diskOverload,
              diskPercent: diskPct,
              hasAlert: true,
              severity: isCritical ? 'critical' : 'warning',
            },
          };
        } else {
          if (!prev[vmid]) return prev;
          const next = { ...prev };
          delete next[vmid];
          return next;
        }
      });
    },
    [vms, selectedVM]
  );

  const fetchVMOSMetrics = useCallback(
    async (vmid: number) => {
      const vm = vms.find((v) => v.vmid === vmid) || (selectedVM?.vmid === vmid ? selectedVM : null);
      if (!vm || vm.status !== 'running') return;

      const rawProfile = sshProfiles.find((p) => p.vmid === vmid);
      const primaryIp = vm.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : undefined;
      const profile = rawProfile && rawProfile.username
        ? { ...rawProfile, host: rawProfile.host || primaryIp || '' }
        : null;

      if (!profile || !profile.host) return;

      try {
        if (window.api?.diagnostics?.getDiagnostics) {
          const res = await window.api.diagnostics.getDiagnostics(profile);
          if (res.success && res.data) {
            if (res.data.memUsedBytes && res.data.memTotalBytes && res.data.memTotalBytes > 0) {
              const percent = Math.round((res.data.memUsedBytes / res.data.memTotalBytes) * 1000) / 10;
              updateVMOSMetrics(vmid, {
                usedBytes: res.data.memUsedBytes,
                totalBytes: res.data.memTotalBytes,
                availableBytes: res.data.memAvailableBytes,
                percent,
              });
            }
          }
        }
      } catch {
        // Ignored in background
      }
    },
    [vms, selectedVM, sshProfiles, updateVMOSMetrics]
  );

  const [installedPackages, setInstalledPackages] = useState<Record<number, string[]>>({});

  const checkVMUpdates = useCallback(async (vmid: number) => {
    const rawProfile = sshProfiles.find((p) => p.vmid === vmid);
    const vm = vms.find((v) => v.vmid === vmid) || (selectedVM?.vmid === vmid ? selectedVM : null);
    const primaryIp = vm?.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : undefined;
    const profile = rawProfile
      ? { ...rawProfile, host: rawProfile.host || primaryIp || '' }
      : primaryIp
      ? {
          id: `temp-${vmid}`,
          name: `${vm?.name || 'VM'} (Auto)`,
          host: primaryIp,
          port: 22,
          username: '',
          authType: 'privateKey' as const,
          privateKeyPath: '~/.ssh/id_ed25519',
          vmid,
          node: vm?.node,
        }
      : null;

    if (!profile || !profile.host) return;

    setVmUpdates((prev) => ({
      ...prev,
      [vmid]: {
        updates: prev[vmid]?.updates || [],
        hasCritical: prev[vmid]?.hasCritical || false,
        hasDangerousOnly: prev[vmid]?.hasDangerousOnly || false,
        safeCount: prev[vmid]?.safeCount || 0,
        isLoading: true,
      },
    }));

    try {
      if (window.api?.updates?.checkUpdates) {
        let res = await window.api.updates.checkUpdates(profile);
        // Fallback to primary IP if original host connection refused or failed
        if (!res.success && primaryIp && primaryIp !== profile.host) {
          res = await window.api.updates.checkUpdates({ ...profile, host: primaryIp });
        }
        if (res.success) {
          // Reset local cache since APT returned fresh server-side status
          setInstalledPackages((prev) => ({ ...prev, [vmid]: [] }));
          const activeUpdates = res.updates;
          const safeCount = activeUpdates.filter((u) => !u.isDangerous).length;
          const hasCrit = activeUpdates.some((u) => (u.isCritical || u.isSecurity) && !u.isDangerous);
          const hasDangerOnly = activeUpdates.length > 0 && safeCount === 0;
          setVmUpdates((prev) => ({
            ...prev,
            [vmid]: {
              updates: activeUpdates,
              hasCritical: hasCrit,
              hasDangerousOnly: hasDangerOnly,
              safeCount,
              isLoading: false,
            },
          }));
        } else {
          setVmUpdates((prev) => ({
            ...prev,
            [vmid]: {
              updates: [],
              hasCritical: false,
              hasDangerousOnly: false,
              safeCount: 0,
              isLoading: false,
              error: res.error,
            },
          }));
        }
      }
    } catch (err: any) {
      setVmUpdates((prev) => ({
        ...prev,
        [vmid]: {
          updates: [],
          hasCritical: false,
          hasDangerousOnly: false,
          safeCount: 0,
          isLoading: false,
          error: err.message,
        },
      }));
    }
  }, [sshProfiles, installedPackages]);

  const isCheckingAllUpdatesRef = useRef(false);

  const checkAllVMUpdates = useCallback(async () => {
    if (isCheckingAllUpdatesRef.current) return;
    isCheckingAllUpdatesRef.current = true;

    try {
      const runningVMs = vms.filter((v) => v.status === 'running');
      const batchSize = 2;
      for (let i = 0; i < runningVMs.length; i += batchSize) {
        const batch = runningVMs.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (vm) => {
            try {
              await checkVMUpdates(vm.vmid);
            } catch {
              // Ignore individual check errors
            }
          })
        );
      }
    } finally {
      isCheckingAllUpdatesRef.current = false;
    }
  }, [vms, checkVMUpdates]);

  const autoCheckedServersRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeServer || vms.length === 0) return;
    const serverKey = activeServer.id || activeServer.host;
    if (autoCheckedServersRef.current[serverKey]) return;

    const timer = setTimeout(() => {
      autoCheckedServersRef.current[serverKey] = true;
      checkAllVMUpdates();
    }, 1200);

    return () => clearTimeout(timer);
  }, [activeServer, vms.length, checkAllVMUpdates]);

  const installVMUpdate = useCallback(async (vmid: number, packageName: string, sudoPassword?: string) => {
    const rawProfile = sshProfiles.find((p) => p.vmid === vmid);
    const vm = vms.find((v) => v.vmid === vmid) || (selectedVM?.vmid === vmid ? selectedVM : null);
    const primaryIp = vm?.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : undefined;
    const profile = rawProfile
      ? { ...rawProfile, host: rawProfile.host || primaryIp || '' }
      : primaryIp
      ? {
          id: `temp-${vmid}`,
          name: `${vm?.name || 'VM'} (Auto)`,
          host: primaryIp,
          port: 22,
          username: '',
          authType: 'privateKey' as const,
          privateKeyPath: '~/.ssh/id_ed25519',
          vmid,
          node: vm?.node,
        }
      : null;

    if (!profile || !profile.host) return { success: false, error: 'Не знайдено SSH доступ для цієї ВМ' };

    try {
      if (window.api?.updates?.installUpdate) {
        let res = await window.api.updates.installUpdate(profile, packageName, sudoPassword);
        // If connection failed and we have an alternate primary IP, retry with primary IP
        if (!res.success && primaryIp && primaryIp !== profile.host && (res.error?.includes('ECONNREFUSED') || res.error?.includes('ETIMEDOUT'))) {
          res = await window.api.updates.installUpdate({ ...profile, host: primaryIp }, packageName, sudoPassword);
        }
        if (res.success) {
          // Record package as installed
          setInstalledPackages((prev) => ({
            ...prev,
            [vmid]: [...(prev[vmid] || []), packageName],
          }));

          // Immediately remove the installed package from the active list
          setVmUpdates((prev) => {
            const current = prev[vmid];
            if (!current) return prev;
            const remaining = current.updates.filter((u) => u.packageName !== packageName);
            const safeCount = remaining.filter((u) => !u.isDangerous).length;
            const hasCrit = remaining.some((u) => (u.isCritical || u.isSecurity) && !u.isDangerous);
            const hasDangerOnly = remaining.length > 0 && safeCount === 0;
            return {
              ...prev,
              [vmid]: {
                ...current,
                updates: remaining,
                hasCritical: hasCrit,
                hasDangerousOnly: hasDangerOnly,
                safeCount,
              },
            };
          });

          return { success: true };
        }
        return { success: false, error: res.error };
      }
      return { success: false, error: 'API оновлень недоступне' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [sshProfiles, vms, selectedVM]);

  const installAllSafeVMUpdates = useCallback(
    async (vmid: number, packageNames: string[], sudoPassword?: string) => {
      const rawProfile = sshProfiles.find((p) => p.vmid === vmid);
      const vm = vms.find((v) => v.vmid === vmid) || (selectedVM?.vmid === vmid ? selectedVM : null);
      const primaryIp = vm?.ipAddresses && vm.ipAddresses.length > 0 ? vm.ipAddresses[0] : undefined;
      const profile = rawProfile
        ? { ...rawProfile, host: rawProfile.host || primaryIp || '' }
        : primaryIp
        ? {
            id: `temp-${vmid}`,
            name: `${vm?.name || 'VM'} (Auto)`,
            host: primaryIp,
            port: 22,
            username: '',
            authType: 'privateKey' as const,
            privateKeyPath: '~/.ssh/id_ed25519',
            vmid,
            node: vm?.node,
          }
        : null;

      if (!profile || !profile.host) return { success: false, error: 'Не знайдено SSH профіль для цієї ВМ' };

      try {
        if (window.api?.updates?.installAllSafeUpdates) {
          let res = await window.api.updates.installAllSafeUpdates(profile, packageNames, sudoPassword);
          if (!res.success && primaryIp && primaryIp !== profile.host && (res.error?.includes('ECONNREFUSED') || res.error?.includes('ETIMEDOUT'))) {
            res = await window.api.updates.installAllSafeUpdates({ ...profile, host: primaryIp }, packageNames, sudoPassword);
          }
          if (res.success && res.installed.length > 0) {
            const newlyInstalled = res.installed;
            setInstalledPackages((prev) => ({
              ...prev,
              [vmid]: [...(prev[vmid] || []), ...newlyInstalled],
            }));

            setVmUpdates((prev) => {
              const current = prev[vmid];
              if (!current) return prev;
              const remaining = current.updates.filter((u) => !newlyInstalled.includes(u.packageName));
              const safeCount = remaining.filter((u) => !u.isDangerous).length;
              const hasCrit = remaining.some((u) => (u.isCritical || u.isSecurity) && !u.isDangerous);
              const hasDangerOnly = remaining.length > 0 && safeCount === 0;
              return {
                ...prev,
                [vmid]: {
                  ...current,
                  updates: remaining,
                  hasCritical: hasCrit,
                  hasDangerousOnly: hasDangerOnly,
                  safeCount,
                },
              };
            });

            return { success: true, installedCount: newlyInstalled.length };
          }
          return { success: false, error: res.error || 'Не вдалося встановити оновлення' };
        }
        return { success: false, error: 'API оновлень недоступне' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [sshProfiles]
  );



  return (
    <AppContext.Provider
      value={{
        servers,
        activeServer,
        nodes,
        vms,
        selectedVM,
        sshProfiles,
        snippets,
        tabs,
        activeTabId,
        activeView,
        isLoading,
        error,
        vmUpdates,
        vmAlerts,
        vmOSMetrics,
        updateVMOSMetrics,
        fetchVMOSMetrics,
        setActiveView,
        selectServer,
        selectVM,
        loadServers,
        saveServer,
        deleteServer,
        refreshClusterData,
        loadSSHProfiles,
        saveSSHProfile,
        deleteSSHProfile,
        openTerminalForVM,
        openTerminalForNode,
        closeTab,
        setActiveTabId,
        setActivePaneId,
        splitPane,
        closePane,
        loadSnippets,
        saveSnippet,
        deleteSnippet,
        sendSnippetToTerminal,
        checkVMUpdates,
        checkAllVMUpdates,
        installVMUpdate,
        installAllSafeVMUpdates,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
