export type ThemeMode = 'system' | 'light' | 'dark';
export type TerminalTheme = 'dark' | 'light' | 'dracula' | 'monokai';

export interface ProxmoxServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  authType: 'token' | 'ticket';
  // For Token
  tokenId?: string;
  tokenSecret?: string;
  // For Ticket
  username?: string;
  password?: string;
  realm?: string;
  verifySsl: boolean;
}

export interface ProxmoxNode {
  node: string;
  status: 'online' | 'offline';
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
}

export interface ProxmoxNodeService {
  service: string;
  name: string;
  state: string;
  desc?: string;
}

export interface ProxmoxAPTUpdate {
  package: string;
  title?: string;
  version: string;
  oldVersion?: string;
  description?: string;
  priority?: string;
  section?: string;
  arch?: string;
}

export interface ProxmoxVM {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  node: string;
  type: 'qemu' | 'lxc';
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  netin?: number;
  netout?: number;
  ipAddresses?: string[];
  freemem?: number;
  ballooninfo?: any;
}

export interface VMMetrics {
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  netin: number;
  netout: number;
  timestamp: number;
  freemem?: number;
  ballooninfo?: any;
}

export interface ProxmoxRRDPoint {
  time: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  netin?: number;
  netout?: number;
}

export interface VMSnapshot {
  name: string;
  snaptime: number;
  description?: string;
  parent?: string;
  vmstate?: boolean;
}

export interface ProxmoxBackup {
  volid: string;
  size: number;
  ctime: number;
  format?: string;
  notes?: string;
}

export interface SSHProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  sudoPassword?: string;
  vmid?: number;
  node?: string;
  serverId?: string;
  jumpHostProfileId?: string;
}

export interface TerminalTab {
  id: string;
  title: string;
  vmid?: number;
  node?: string;
  serverId?: string;
  connectionType: 'ssh' | 'proxmox-console';
  activePaneId: string;
  panes: TerminalPane[];
  layout: 'single' | 'split-horizontal' | 'split-vertical' | 'grid-2x2';
}

export interface TerminalPane {
  id: string;
  sessionId: string;
  title: string;
  connected: boolean;
  sshProfileId?: string;
  host?: string;
  vmid?: number;
}

export interface Snippet {
  id: string;
  title: string;
  description: string;
  command: string;
  category: 'system' | 'docker' | 'network' | 'package' | 'custom';
}

export interface SFTPItem {
  name: string;
  type: 'file' | 'directory' | 'link';
  size: number;
  modifyTime: number;
  permissions: string;
}

export interface AppSettings {
  theme: ThemeMode;
  terminalTheme: TerminalTheme;
  terminalFontSize: number;
  terminalFontFamily: string;
  refreshInterval: number; // in seconds
  autoConnectTerminal: boolean;
}

export interface SystemUpdate {
  packageName: string;
  currentVersion: string;
  newVersion: string;
  isSecurity: boolean;
  isCritical: boolean;
  isDangerous: boolean;
  dangerReason?: string;
  description?: string;
}

export interface VMProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  command: string;
}

export interface VMDiskUsageInfo {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  usePercent: string;
  mountedOn: string;
}

export interface DockerContainer {
  id: string;
  image: string;
  command: string;
  created: string;
  status: string;
  ports: string;
  names: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'other';
}

export interface VMDiagnosticsData {
  processes: VMProcessInfo[];
  disks: VMDiskUsageInfo[];
  memTotal: string;
  memUsed: string;
  memFree: string;
  memAvailable: string;
  swapTotal: string;
  swapUsed: string;
  memTotalBytes?: number;
  memUsedBytes?: number;
  memAvailableBytes?: number;
}

export interface VMOSMetrics {
  usedBytes: number;
  totalBytes: number;
  availableBytes?: number;
  percent: number;
  updatedAt: number;
}

export interface VMResourceAlert {
  vmid: number;
  cpuOverload: boolean;
  cpuPercent: number;
  ramOverload: boolean;
  ramPercent: number;
  diskOverload: boolean;
  diskPercent: number;
  hasAlert: boolean;
  severity: 'warning' | 'critical';
}

export interface AppUpdateInfo {
  version: string;
  files?: any[];
  path?: string;
  sha512?: string;
  releaseDate?: string;
  releaseName?: string;
  releaseNotes?: string | any[];
}

export interface AppUpdateProgress {
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

export interface WindowApi {
  store: {
    getServers: () => Promise<ProxmoxServerConfig[]>;
    saveServer: (server: ProxmoxServerConfig) => Promise<void>;
    deleteServer: (id: string) => Promise<void>;
    getSSHProfiles: () => Promise<SSHProfile[]>;
    saveSSHProfile: (profile: SSHProfile) => Promise<void>;
    deleteSSHProfile: (id: string) => Promise<void>;
    getSnippets: () => Promise<Snippet[]>;
    saveSnippet: (snippet: Snippet) => Promise<void>;
    deleteSnippet: (id: string) => Promise<void>;
    getSettings: () => Promise<AppSettings>;
    saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  };
  proxmox: {
    testConnection: (config: ProxmoxServerConfig) => Promise<{ success: boolean; version?: string; error?: string }>;
    getNodes: (config: ProxmoxServerConfig) => Promise<ProxmoxNode[]>;
    getVMs: (config: ProxmoxServerConfig, node: string) => Promise<ProxmoxVM[]>;
    getVMMetrics: (config: ProxmoxServerConfig, node: string, vmid: number, vmType?: 'qemu' | 'lxc') => Promise<VMMetrics>;
    getRRDData: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year',
      vmType?: 'qemu' | 'lxc'
    ) => Promise<ProxmoxRRDPoint[]>;
    executeVMAction: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'suspend' | 'resume',
      vmType?: 'qemu' | 'lxc'
    ) => Promise<{ success: boolean; taskId?: string }>;
    getSnapshots: (config: ProxmoxServerConfig, node: string, vmid: number, vmType?: 'qemu' | 'lxc') => Promise<VMSnapshot[]>;
    getBackups: (config: ProxmoxServerConfig, node: string, vmid: number) => Promise<ProxmoxBackup[]>;
    createBackup: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      mode?: 'snapshot' | 'suspend' | 'stop',
      compress?: 'zstd' | 'gzip' | 'lzo' | 'none'
    ) => Promise<{ success: boolean; taskId?: string }>;
    createSnapshot: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      snapname: string,
      description?: string,
      vmstate?: boolean,
      vmType?: 'qemu' | 'lxc'
    ) => Promise<{ success: boolean; taskId?: string }>;
    rollbackSnapshot: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      snapname: string,
      vmType?: 'qemu' | 'lxc'
    ) => Promise<{ success: boolean; taskId?: string }>;
    deleteSnapshot: (
      config: ProxmoxServerConfig,
      node: string,
      vmid: number,
      snapname: string,
      vmType?: 'qemu' | 'lxc'
    ) => Promise<{ success: boolean; taskId?: string }>;
    getTermproxyTicket: (
      config: ProxmoxServerConfig,
      node: string,
      vmid?: number,
      vmType?: 'qemu' | 'lxc'
    ) => Promise<{ ticket: string; port: number; user: string }>;
    getNodeStatus: (config: ProxmoxServerConfig, node: string) => Promise<any>;
    getNodeServices: (config: ProxmoxServerConfig, node: string) => Promise<ProxmoxNodeService[]>;
    restartNodeService: (config: ProxmoxServerConfig, node: string, service: string) => Promise<{ success: boolean; error?: string }>;
    executeNodeAction: (config: ProxmoxServerConfig, node: string, action: 'reboot' | 'shutdown') => Promise<{ success: boolean; error?: string }>;
    getNodeUpdates: (config: ProxmoxServerConfig, node: string) => Promise<ProxmoxAPTUpdate[]>;
    refreshNodeUpdates: (config: ProxmoxServerConfig, node: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  };
  ssh: {
    connect: (sessionId: string, profile: SSHProfile, rows: number, cols: number) => Promise<{ success: boolean; error?: string }>;
    write: (sessionId: string, data: string) => void;
    resize: (sessionId: string, rows: number, cols: number) => void;
    disconnect: (sessionId: string) => void;
    onData: (callback: (sessionId: string, data: string) => void) => () => void;
    onClosed: (callback: (sessionId: string) => void) => () => void;
    onError: (callback: (sessionId: string, error: string) => void) => () => void;
    getSystemDefaults: (host?: string) => Promise<{ username: string; privateKeyPath?: string }>;
    testConnection: (profile: SSHProfile) => Promise<{ success: boolean; error?: string }>;
  };
  updates: {
    checkUpdates: (profile: SSHProfile) => Promise<{ success: boolean; updates: SystemUpdate[]; error?: string }>;
    installUpdate: (
      profile: SSHProfile,
      packageName: string,
      sudoPassword?: string
    ) => Promise<{ success: boolean; output?: string; error?: string }>;
    installAllSafeUpdates: (
      profile: SSHProfile,
      packageNames: string[],
      sudoPassword?: string
    ) => Promise<{ success: boolean; installed: string[]; output?: string; error?: string }>;
  };
  sftp: {
    list: (profile: SSHProfile, remotePath: string) => Promise<SFTPItem[]>;
    download: (profile: SSHProfile, remotePath: string, localPath: string) => Promise<{ success: boolean; error?: string }>;
    upload: (profile: SSHProfile, localPath: string, remotePath: string) => Promise<{ success: boolean; error?: string }>;
    delete: (profile: SSHProfile, remotePath: string, isDir: boolean) => Promise<{ success: boolean; error?: string }>;
    mkdir: (profile: SSHProfile, remotePath: string) => Promise<{ success: boolean; error?: string }>;
    readFile: (profile: SSHProfile, remotePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    writeFile: (profile: SSHProfile, remotePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
    selectLocalFile: () => Promise<string | null>;
    selectLocalSavePath: (defaultFilename: string) => Promise<string | null>;
  };
  diagnostics: {
    getDiagnostics: (profile: SSHProfile) => Promise<{ success: boolean; data?: VMDiagnosticsData; error?: string }>;
    manageProcess: (
      profile: SSHProfile,
      action: 'kill' | 'kill-9' | 'restart-service' | 'drop-caches',
      target: string, // PID for kill, service name for restart-service, or empty for drop-caches
      sudoPassword?: string
    ) => Promise<{ success: boolean; error?: string }>;
    getSystemLogs: (
      profile: SSHProfile,
      filter?: 'all' | 'errors' | 'warnings',
      lines?: number,
      unit?: string
    ) => Promise<{ success: boolean; logs?: string; error?: string }>;
    getDockerContainers: (profile: SSHProfile) => Promise<{ success: boolean; containers?: DockerContainer[]; isInstalled: boolean; error?: string }>;
    restartDockerContainer: (profile: SSHProfile, containerId: string, sudoPassword?: string) => Promise<{ success: boolean; error?: string }>;
    getDockerLogs: (profile: SSHProfile, containerId: string, lines?: number) => Promise<{ success: boolean; logs?: string; error?: string }>;
  };
  system: {
    getTheme: () => Promise<'dark' | 'light'>;
    setThemeSource: (mode: 'system' | 'light' | 'dark') => Promise<void>;
    onThemeChange: (callback: (isDark: boolean) => void) => () => void;
    openExternal: (url: string) => Promise<void>;
    showNotification: (
      title: string,
      body: string,
      type?: 'info' | 'warning' | 'error'
    ) => Promise<boolean>;
  };
  appUpdate: {
    onAvailable: (callback: (info: AppUpdateInfo) => void) => () => void;
    onProgress: (callback: (progress: AppUpdateProgress) => void) => () => void;
    onDownloaded: (callback: (info: AppUpdateInfo) => void) => () => void;
    installNow: () => Promise<void>;
    getReleaseNotes: (version: string) => Promise<string | null>;
  };
}

declare global {
  const __APP_VERSION__: string;
  interface Window {
    api: WindowApi;
  }
}
