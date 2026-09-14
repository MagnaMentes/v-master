// @ts-ignore
const { contextBridge, ipcRenderer } = require('electron');
import type { IpcRendererEvent } from 'electron';
import type {
  ProxmoxServerConfig,
  SSHProfile,
  Snippet,
  AppSettings,
  ProxmoxNode,
  ProxmoxVM,
  VMMetrics,
  VMSnapshot,
  SFTPItem,
  ProxmoxRRDPoint,
  ProxmoxBackup,
} from '../src/types';

const api = {
  // Store
  store: {
    getServers: (): Promise<ProxmoxServerConfig[]> => ipcRenderer.invoke('store:getServers'),
    saveServer: (server: ProxmoxServerConfig): Promise<void> => ipcRenderer.invoke('store:saveServer', server),
    deleteServer: (id: string): Promise<void> => ipcRenderer.invoke('store:deleteServer', id),
    getSSHProfiles: (): Promise<SSHProfile[]> => ipcRenderer.invoke('store:getSSHProfiles'),
    saveSSHProfile: (profile: SSHProfile): Promise<void> => ipcRenderer.invoke('store:saveSSHProfile', profile),
    deleteSSHProfile: (id: string): Promise<void> => ipcRenderer.invoke('store:deleteSSHProfile', id),
    getSnippets: (): Promise<Snippet[]> => ipcRenderer.invoke('store:getSnippets'),
    saveSnippet: (snippet: Snippet): Promise<void> => ipcRenderer.invoke('store:saveSnippet', snippet),
    deleteSnippet: (id: string): Promise<void> => ipcRenderer.invoke('store:deleteSnippet', id),
    getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('store:getSettings'),
    saveSettings: (settings: Partial<AppSettings>): Promise<void> => ipcRenderer.invoke('store:saveSettings', settings),
  },

  // Proxmox API
  proxmox: {
    testConnection: (config: ProxmoxServerConfig): Promise<{ success: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke('proxmox:testConnection', config),
    getNodes: (config: ProxmoxServerConfig): Promise<ProxmoxNode[]> =>
      ipcRenderer.invoke('proxmox:getNodes', config),
    getVMs: (config: ProxmoxServerConfig, node: string): Promise<ProxmoxVM[]> =>
      ipcRenderer.invoke('proxmox:getVMs', config, node),
    getVMMetrics: (config: ProxmoxServerConfig, node: string, vmid: number, vmType?: 'qemu' | 'lxc'): Promise<VMMetrics> =>
      ipcRenderer.invoke('proxmox:getVMMetrics', config, node, vmid, vmType),
    getRRDData: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year',
      vmType?: 'qemu' | 'lxc'
    ): Promise<ProxmoxRRDPoint[]> =>
      ipcRenderer.invoke('proxmox:getRRDData', config, node, vmid, timeframe, vmType),
    executeVMAction: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'suspend' | 'resume',
      vmType?: 'qemu' | 'lxc'
    ): Promise<{ success: boolean; taskId?: string }> =>
      ipcRenderer.invoke('proxmox:executeVMAction', config, node, vmid, action, vmType),
    getSnapshots: (config: ProxmoxServerConfig, node: string, vmid: number, vmType?: 'qemu' | 'lxc'): Promise<VMSnapshot[]> =>
      ipcRenderer.invoke('proxmox:getSnapshots', config, node, vmid, vmType),
    getBackups: (config: ProxmoxServerConfig, node: string, vmid: number): Promise<ProxmoxBackup[]> =>
      ipcRenderer.invoke('proxmox:getBackups', config, node, vmid),
    createBackup: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      mode?: 'snapshot' | 'suspend' | 'stop',
      compress?: 'zstd' | 'gzip' | 'lzo' | 'none'
    ): Promise<{ success: boolean; taskId?: string }> =>
      ipcRenderer.invoke('proxmox:createBackup', config, node, vmid, mode, compress),
    createSnapshot: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      snapname: string,
      description?: string,
      vmstate?: boolean,
      vmType?: 'qemu' | 'lxc'
    ): Promise<{ success: boolean; taskId?: string }> =>
      ipcRenderer.invoke('proxmox:createSnapshot', config, node, vmid, snapname, description, vmstate, vmType),
    rollbackSnapshot: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      snapname: string,
      vmType?: 'qemu' | 'lxc'
    ): Promise<{ success: boolean; taskId?: string }> =>
      ipcRenderer.invoke('proxmox:rollbackSnapshot', config, node, vmid, snapname, vmType),
    deleteSnapshot: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      snapname: string,
      vmType?: 'qemu' | 'lxc'
    ): Promise<{ success: boolean; taskId?: string }> =>
      ipcRenderer.invoke('proxmox:deleteSnapshot', config, node, vmid, snapname, vmType),
    getTermproxyTicket: (
      config: ProxmoxServerConfig,
      node: string,
      vmid?: number,
      vmType?: 'qemu' | 'lxc'
    ): Promise<{ ticket: string; port: number; user: string }> =>
      ipcRenderer.invoke('proxmox:getTermproxyTicket', config, node, vmid, vmType),
    getNodeStatus: (config: ProxmoxServerConfig, node: string): Promise<any> =>
      ipcRenderer.invoke('proxmox:getNodeStatus', config, node),
    getNodeServices: (config: ProxmoxServerConfig, node: string): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeServices', config, node),
    restartNodeService: (config: ProxmoxServerConfig, node: string, service: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:restartNodeService', config, node, service),
    executeNodeAction: (config: ProxmoxServerConfig, node: string, action: 'reboot' | 'shutdown'): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:executeNodeAction', config, node, action),
    getNodeUpdates: (config: ProxmoxServerConfig, node: string): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeUpdates', config, node),
    refreshNodeUpdates: (config: ProxmoxServerConfig, node: string): Promise<{ success: boolean; taskId?: string; error?: string }> =>
      ipcRenderer.invoke('proxmox:refreshNodeUpdates', config, node),
    getNodeStorage: (config: ProxmoxServerConfig, node: string): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeStorage', config, node),
    getNodeDisks: (config: ProxmoxServerConfig, node: string): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeDisks', config, node),
    getNodeTasks: (config: ProxmoxServerConfig, node: string, limit?: number): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeTasks', config, node, limit),
    getNodeTaskLog: (config: ProxmoxServerConfig, node: string, upid: string): Promise<string[]> =>
      ipcRenderer.invoke('proxmox:getNodeTaskLog', config, node, upid),
    getNodeNetworks: (config: ProxmoxServerConfig, node: string): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeNetworks', config, node),
    createNodeNetwork: (config: ProxmoxServerConfig, node: string, params: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:createNodeNetwork', config, node, params),
    updateNodeNetwork: (config: ProxmoxServerConfig, node: string, iface: string, params: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:updateNodeNetwork', config, node, iface, params),
    deleteNodeNetwork: (config: ProxmoxServerConfig, node: string, iface: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:deleteNodeNetwork', config, node, iface),
    applyNodeNetworkChanges: (config: ProxmoxServerConfig, node: string): Promise<{ success: boolean; taskId?: string; error?: string }> =>
      ipcRenderer.invoke('proxmox:applyNodeNetworkChanges', config, node),
    revertNodeNetworkChanges: (config: ProxmoxServerConfig, node: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:revertNodeNetworkChanges', config, node),
    createStorage: (config: ProxmoxServerConfig, params: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:createStorage', config, params),
    deleteStorage: (config: ProxmoxServerConfig, storageId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('proxmox:deleteStorage', config, storageId),
    initGptDisk: (config: ProxmoxServerConfig, node: string, disk: string): Promise<{ success: boolean; taskId?: string; error?: string }> =>
      ipcRenderer.invoke('proxmox:initGptDisk', config, node, disk),
    wipeDisk: (config: ProxmoxServerConfig, node: string, disk: string): Promise<{ success: boolean; taskId?: string; error?: string }> =>
      ipcRenderer.invoke('proxmox:wipeDisk', config, node, disk),
    getNextVMID: (config: ProxmoxServerConfig): Promise<number> =>
      ipcRenderer.invoke('proxmox:getNextVMID', config),
    createVM: (config: ProxmoxServerConfig, node: string, params: any): Promise<{ success: boolean; taskId?: string; error?: string }> =>
      ipcRenderer.invoke('proxmox:createVM', config, node, params),
    getNodeSyslog: (config: ProxmoxServerConfig, node: string, limit?: number): Promise<any[]> =>
      ipcRenderer.invoke('proxmox:getNodeSyslog', config, node, limit),
  },

  // SSH Terminal
  ssh: {
    connect: (sessionId: string, profile: SSHProfile, rows: number, cols: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ssh:connect', sessionId, profile, rows, cols),
    write: (sessionId: string, data: string): void => {
      ipcRenderer.send('ssh:write', sessionId, data);
    },
    resize: (sessionId: string, rows: number, cols: number): void => {
      ipcRenderer.send('ssh:resize', sessionId, rows, cols);
    },
    disconnect: (sessionId: string): void => {
      ipcRenderer.send('ssh:disconnect', sessionId);
    },
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_event: IpcRendererEvent, sId: string, data: string) => callback(sId, data);
      ipcRenderer.on('ssh:data', handler);
      return () => ipcRenderer.removeListener('ssh:data', handler);
    },
    onClosed: (callback: (sessionId: string) => void) => {
      const handler = (_event: IpcRendererEvent, sId: string) => callback(sId);
      ipcRenderer.on('ssh:closed', handler);
      return () => ipcRenderer.removeListener('ssh:closed', handler);
    },
    onError: (callback: (sessionId: string, error: string) => void) => {
      const handler = (_event: IpcRendererEvent, sId: string, error: string) => callback(sId, error);
      ipcRenderer.on('ssh:error', handler);
      return () => ipcRenderer.removeListener('ssh:error', handler);
    },
    getSystemDefaults: (host?: string): Promise<{ username: string; privateKeyPath?: string }> =>
      ipcRenderer.invoke('ssh:getSystemDefaults', host),
    testConnection: (profile: SSHProfile): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ssh:testConnection', profile),
  },

  // System Updates
  updates: {
    checkUpdates: (profile: SSHProfile): Promise<{ success: boolean; updates: any[]; error?: string }> =>
      ipcRenderer.invoke('updates:checkUpdates', profile),
    installUpdate: (
      profile: SSHProfile,
      packageName: string,
      sudoPassword?: string
    ): Promise<{ success: boolean; output?: string; error?: string }> =>
      ipcRenderer.invoke('updates:installUpdate', profile, packageName, sudoPassword),
    installAllSafeUpdates: (
      profile: SSHProfile,
      packageNames: string[],
      sudoPassword?: string
    ): Promise<{ success: boolean; installed: string[]; output?: string; error?: string }> =>
      ipcRenderer.invoke('updates:installAllSafeUpdates', profile, packageNames, sudoPassword),
  },

  // SFTP Browser
  sftp: {
    list: (profile: SSHProfile, remotePath: string): Promise<SFTPItem[]> =>
      ipcRenderer.invoke('sftp:list', profile, remotePath),
    download: (profile: SSHProfile, remotePath: string, localPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sftp:download', profile, remotePath, localPath),
    upload: (profile: SSHProfile, localPath: string, remotePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sftp:upload', profile, localPath, remotePath),
    delete: (profile: SSHProfile, remotePath: string, isDir: boolean): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sftp:delete', profile, remotePath, isDir),
    mkdir: (profile: SSHProfile, remotePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sftp:mkdir', profile, remotePath),
    readFile: (profile: SSHProfile, remotePath: string): Promise<{ success: boolean; content?: string; error?: string }> =>
      ipcRenderer.invoke('sftp:readFile', profile, remotePath),
    writeFile: (profile: SSHProfile, remotePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sftp:writeFile', profile, remotePath, content),
    selectLocalFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectLocalFile'),
    selectLocalSavePath: (defaultFilename: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectLocalSavePath', defaultFilename),
  },

  // Resource Diagnostics
  diagnostics: {
    getDiagnostics: (profile: SSHProfile): Promise<{ success: boolean; data?: any; error?: string }> =>
      ipcRenderer.invoke('diagnostics:getDiagnostics', profile),
    manageProcess: (
      profile: SSHProfile,
      action: 'kill' | 'kill-9' | 'restart-service',
      target: string,
      sudoPassword?: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('diagnostics:manageProcess', profile, action, target, sudoPassword),
    getSystemLogs: (
      profile: SSHProfile,
      filter?: 'all' | 'errors' | 'warnings',
      lines?: number,
      unit?: string
    ): Promise<{ success: boolean; logs?: string; error?: string }> =>
      ipcRenderer.invoke('diagnostics:getSystemLogs', profile, filter, lines, unit),
    getDockerContainers: (profile: SSHProfile): Promise<{ success: boolean; containers?: any[]; isInstalled: boolean; error?: string }> =>
      ipcRenderer.invoke('diagnostics:getDockerContainers', profile),
    restartDockerContainer: (profile: SSHProfile, containerId: string, sudoPassword?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('diagnostics:restartDockerContainer', profile, containerId, sudoPassword),
    getDockerLogs: (profile: SSHProfile, containerId: string, lines?: number): Promise<{ success: boolean; logs?: string; error?: string }> =>
      ipcRenderer.invoke('diagnostics:getDockerLogs', profile, containerId, lines),
  },

  // App & Theme
  system: {
    getTheme: (): Promise<'dark' | 'light'> => ipcRenderer.invoke('system:getTheme'),
    setThemeSource: (mode: 'system' | 'light' | 'dark'): Promise<void> =>
      ipcRenderer.invoke('system:setThemeSource', mode),
    onThemeChange: (callback: (isDark: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, isDark: boolean) => callback(isDark);
      ipcRenderer.on('system:themeChanged', handler);
      return () => ipcRenderer.removeListener('system:themeChanged', handler);
    },
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url),
    showNotification: (title: string, body: string, type?: 'info' | 'warning' | 'error'): Promise<boolean> =>
      ipcRenderer.invoke('system:showNotification', title, body, type),
  },

  // App Update (In-App)
  appUpdate: {
    onAvailable: (callback: (info: any) => void) => {
      const handler = (_event: IpcRendererEvent, info: any) => callback(info);
      ipcRenderer.on('app-update:available', handler);
      return () => ipcRenderer.removeListener('app-update:available', handler);
    },
    onProgress: (callback: (progress: any) => void) => {
      const handler = (_event: IpcRendererEvent, progress: any) => callback(progress);
      ipcRenderer.on('app-update:progress', handler);
      return () => ipcRenderer.removeListener('app-update:progress', handler);
    },
    onDownloaded: (callback: (info: any) => void) => {
      const handler = (_event: IpcRendererEvent, info: any) => callback(info);
      ipcRenderer.on('app-update:downloaded', handler);
      return () => ipcRenderer.removeListener('app-update:downloaded', handler);
    },
    installNow: (): Promise<void> => ipcRenderer.invoke('app-update:installNow'),
    getReleaseNotes: (version: string): Promise<string | null> =>
      ipcRenderer.invoke('app-update:getReleaseNotes', version),
  }
};

contextBridge.exposeInMainWorld('api', api);
