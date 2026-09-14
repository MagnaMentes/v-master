import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { AppStore } from './store';
import { ProxmoxService } from './proxmox';
import { SSHService } from './ssh';
import { UpdateService } from './updates';
import { DiagnosticsService } from './diagnostics';
import type { ProxmoxServerConfig, SSHProfile, Snippet, AppSettings } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built directory structure
const distDir = path.join(__dirname, '../dist');
process.env.DIST = distDir;
process.env.VITE_PUBLIC = app.isPackaged ? distDir : path.join(distDir, '../public');

let win: BrowserWindow | null = null;
let downloadedZipPath: string | null = null;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

const store = new AppStore();
const proxmox = new ProxmoxService();
const ssh = new SSHService();
const updates = new UpdateService(ssh);
const diagnostics = new DiagnosticsService(ssh);

function createWindow() {
  const isMac = process.platform === 'darwin';

  win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    icon: path.join(__dirname, '../public/icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1E1E1E' : '#F6F6F6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('PRELOAD ERROR:', preloadPath, error);
  });

  // Track system theme changes
  nativeTheme.on('updated', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('system:themeChanged', nativeTheme.shouldUseDarkColors);
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(distDir, 'index.html'));
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  ssh.disconnectAll();
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'V-Master',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: 'Copyright © 2026 magna_mentes',
    });
  }

  registerIpcHandlers();
  createWindow();

  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('app-update:available', info);
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('app-update:progress', progress);
      }
    });

    autoUpdater.on('update-downloaded', (info: any) => {
      const cacheDir = path.join(app.getPath('home'), 'Library/Caches', 'v-master-updater');
      const pendingZip = path.join(cacheDir, 'pending', `V-Master-${info.version}-arm64-mac.zip`);
      const directZip = path.join(cacheDir, 'update.zip');

      if (info.downloadedFile && fs.existsSync(info.downloadedFile)) {
        downloadedZipPath = info.downloadedFile;
      } else if (fs.existsSync(pendingZip)) {
        downloadedZipPath = pendingZip;
      } else if (fs.existsSync(directZip)) {
        downloadedZipPath = directZip;
      }

      if (win && !win.isDestroyed()) {
        win.webContents.send('app-update:downloaded', info);
      }
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('Auto-updater initial check failed:', err?.message || err);
    });

    // Periodically check for updates during runtime (test interval: 1 minute)
    const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('Auto-updater periodic check failed:', err?.message || err);
      });
    }, UPDATE_CHECK_INTERVAL_MS);
  }
});

function registerIpcHandlers() {
  // Store handlers
  ipcMain.handle('store:getServers', () => store.getServers());
  ipcMain.handle('store:saveServer', (_e, server: ProxmoxServerConfig) => {
    proxmox.clearClient(server.id);
    store.saveServer(server);
  });
  ipcMain.handle('store:deleteServer', (_e, id: string) => {
    proxmox.clearClient(id);
    store.deleteServer(id);
  });

  ipcMain.handle('store:getSSHProfiles', () => store.getSSHProfiles());
  ipcMain.handle('store:saveSSHProfile', (_e, profile: SSHProfile) => store.saveSSHProfile(profile));
  ipcMain.handle('store:deleteSSHProfile', (_e, id: string) => store.deleteSSHProfile(id));

  ipcMain.handle('store:getSnippets', () => store.getSnippets());
  ipcMain.handle('store:saveSnippet', (_e, snippet: Snippet) => store.saveSnippet(snippet));
  ipcMain.handle('store:deleteSnippet', (_e, id: string) => store.deleteSnippet(id));

  ipcMain.handle('store:getSettings', () => store.getSettings());
  ipcMain.handle('store:saveSettings', (_e, settings: Partial<AppSettings>) => {
    store.saveSettings(settings);
    if (settings.theme) {
      nativeTheme.themeSource = settings.theme;
    }
  });

  // Proxmox handlers
  ipcMain.handle('proxmox:testConnection', (_e, config: ProxmoxServerConfig) => proxmox.testConnection(config));
  ipcMain.handle('proxmox:getNodes', (_e, config: ProxmoxServerConfig) => proxmox.getNodes(config));
  ipcMain.handle('proxmox:getVMs', (_e, config: ProxmoxServerConfig, node: string) => proxmox.getVMs(config, node));
  ipcMain.handle('proxmox:getVMMetrics', (_e, config: ProxmoxServerConfig, node: string, vmid: number, vmType?: 'qemu' | 'lxc') =>
    proxmox.getVMMetrics(config, node, vmid, vmType)
  );
  ipcMain.handle(
    'proxmox:getRRDData',
    (_e, config: ProxmoxServerConfig, node: string, vmid: number, timeframe?: any, vmType?: 'qemu' | 'lxc') =>
      proxmox.getRRDData(config, node, vmid, timeframe, vmType)
  );
  ipcMain.handle(
    'proxmox:executeVMAction',
    (_e, config: ProxmoxServerConfig, node: string, vmid: number, action: any, vmType?: 'qemu' | 'lxc') =>
      proxmox.executeVMAction(config, node, vmid, action, vmType)
  );
  ipcMain.handle('proxmox:getSnapshots', (_e, config: ProxmoxServerConfig, node: string, vmid: number, vmType?: 'qemu' | 'lxc') =>
    proxmox.getSnapshots(config, node, vmid, vmType)
  );
  ipcMain.handle('proxmox:getBackups', (_e, config: ProxmoxServerConfig, node: string, vmid: number) =>
    proxmox.getBackups(config, node, vmid)
  );
  ipcMain.handle(
    'proxmox:createBackup',
    (_e, config: ProxmoxServerConfig, node: string, vmid: number, mode?: any, compress?: any) =>
      proxmox.createBackup(config, node, vmid, mode, compress)
  );
  ipcMain.handle(
    'proxmox:createSnapshot',
    (_e, config: ProxmoxServerConfig, node: string, vmid: number, name: string, desc?: string, vmstate?: boolean, vmType?: 'qemu' | 'lxc') =>
      proxmox.createSnapshot(config, node, vmid, name, desc, vmstate, vmType)
  );
  ipcMain.handle('proxmox:rollbackSnapshot', (_e, config: ProxmoxServerConfig, node: string, vmid: number, name: string, vmType?: 'qemu' | 'lxc') =>
    proxmox.rollbackSnapshot(config, node, vmid, name, vmType)
  );
  ipcMain.handle('proxmox:deleteSnapshot', (_e, config: ProxmoxServerConfig, node: string, vmid: number, name: string, vmType?: 'qemu' | 'lxc') =>
    proxmox.deleteSnapshot(config, node, vmid, name, vmType)
  );
  ipcMain.handle('proxmox:getTermproxyTicket', (_e, config: ProxmoxServerConfig, node: string, vmid?: number, vmType?: 'qemu' | 'lxc') =>
    proxmox.getTermproxyTicket(config, node, vmid, vmType)
  );
  ipcMain.handle('proxmox:getNodeStatus', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.getNodeStatus(config, node)
  );
  ipcMain.handle('proxmox:getNodeServices', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.getNodeServices(config, node)
  );
  ipcMain.handle('proxmox:restartNodeService', (_e, config: ProxmoxServerConfig, node: string, service: string) =>
    proxmox.restartNodeService(config, node, service)
  );
  ipcMain.handle('proxmox:executeNodeAction', (_e, config: ProxmoxServerConfig, node: string, action: 'reboot' | 'shutdown') =>
    proxmox.executeNodeAction(config, node, action)
  );
  ipcMain.handle('proxmox:getNodeUpdates', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.getNodeUpdates(config, node)
  );
  ipcMain.handle('proxmox:refreshNodeUpdates', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.refreshNodeUpdates(config, node)
  );
  ipcMain.handle('proxmox:getNodeStorage', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.getNodeStorage(config, node)
  );
  ipcMain.handle('proxmox:getNodeDisks', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.getNodeDisks(config, node)
  );
  ipcMain.handle('proxmox:getNodeTasks', (_e, config: ProxmoxServerConfig, node: string, limit?: number) =>
    proxmox.getNodeTasks(config, node, limit)
  );
  ipcMain.handle('proxmox:getNodeTaskLog', (_e, config: ProxmoxServerConfig, node: string, upid: string) =>
    proxmox.getNodeTaskLog(config, node, upid)
  );
  ipcMain.handle('proxmox:getNodeNetworks', (_e, config: ProxmoxServerConfig, node: string) =>
    proxmox.getNodeNetworks(config, node)
  );
  ipcMain.handle('proxmox:getNodeSyslog', (_e, config: ProxmoxServerConfig, node: string, limit?: number) =>
    proxmox.getNodeSyslog(config, node, limit)
  );

  // SSH Terminal handlers
  ipcMain.handle('ssh:connect', async (_e, sessionId: string, profile: SSHProfile, rows: number, cols: number) => {
    if (!win) return { success: false, error: 'Вікно застосунку не знайдено' };
    try {
      await ssh.connect(sessionId, profile, rows, cols, win);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Помилка підключення до SSH' };
    }
  });

  ipcMain.on('ssh:write', (_e, sessionId: string, data: string) => {
    ssh.write(sessionId, data);
  });

  ipcMain.on('ssh:resize', (_e, sessionId: string, rows: number, cols: number) => {
    ssh.resize(sessionId, rows, cols);
  });

  ipcMain.on('ssh:disconnect', (_e, sessionId: string) => {
    ssh.disconnect(sessionId);
  });

  ipcMain.handle('ssh:getSystemDefaults', (_e, host?: string) => {
    return ssh.getSystemDefaults(host);
  });

  ipcMain.handle('ssh:testConnection', (_e, profile: SSHProfile) => {
    return ssh.testConnection(profile);
  });

  // SFTP handlers
  ipcMain.handle('sftp:list', (_e, profile: SSHProfile, remotePath: string) => ssh.sftpList(profile, remotePath));
  ipcMain.handle('sftp:download', (_e, profile: SSHProfile, remotePath: string, localPath: string) =>
    ssh.sftpDownload(profile, remotePath, localPath)
  );
  ipcMain.handle('sftp:upload', (_e, profile: SSHProfile, localPath: string, remotePath: string) =>
    ssh.sftpUpload(profile, localPath, remotePath)
  );
  ipcMain.handle('sftp:delete', (_e, profile: SSHProfile, remotePath: string, isDir: boolean) =>
    ssh.sftpDelete(profile, remotePath, isDir)
  );
  ipcMain.handle('sftp:mkdir', (_e, profile: SSHProfile, remotePath: string) => ssh.sftpMkdir(profile, remotePath));
  ipcMain.handle('sftp:readFile', (_e, profile: SSHProfile, remotePath: string) =>
    ssh.sftpReadFile(profile, remotePath)
  );
  ipcMain.handle('sftp:writeFile', (_e, profile: SSHProfile, remotePath: string, content: string) =>
    ssh.sftpWriteFile(profile, remotePath, content)
  );

  // System Updates
  ipcMain.handle('updates:checkUpdates', (_e, profile: SSHProfile) => updates.checkUpdates(profile));
  ipcMain.handle('updates:installUpdate', (_e, profile: SSHProfile, packageName: string, sudoPassword?: string) =>
    updates.installUpdate(profile, packageName, sudoPassword)
  );
  ipcMain.handle(
    'updates:installAllSafeUpdates',
    (_e, profile: SSHProfile, packageNames: string[], sudoPassword?: string) =>
      updates.installAllSafeUpdates(profile, packageNames, sudoPassword)
  );

  // Diagnostics & Resource Management
  ipcMain.handle('diagnostics:getDiagnostics', (_e, profile: SSHProfile) =>
    diagnostics.getDiagnostics(profile)
  );
  ipcMain.handle(
    'diagnostics:manageProcess',
    (
      _e,
      profile: SSHProfile,
      action: 'kill' | 'kill-9' | 'restart-service',
      target: string,
      sudoPassword?: string
    ) => diagnostics.manageProcess(profile, action, target, sudoPassword)
  );
  ipcMain.handle(
    'diagnostics:getSystemLogs',
    (
      _e,
      profile: SSHProfile,
      filter?: 'all' | 'errors' | 'warnings',
      lines?: number,
      unit?: string
    ) => diagnostics.getSystemLogs(profile, filter, lines, unit)
  );
  ipcMain.handle('diagnostics:getDockerContainers', (_e, profile: SSHProfile) =>
    diagnostics.getDockerContainers(profile)
  );
  ipcMain.handle(
    'diagnostics:restartDockerContainer',
    (_e, profile: SSHProfile, containerId: string, sudoPassword?: string) =>
      diagnostics.restartDockerContainer(profile, containerId, sudoPassword)
  );
  ipcMain.handle(
    'diagnostics:getDockerLogs',
    (_e, profile: SSHProfile, containerId: string, lines?: number) =>
      diagnostics.getDockerLogs(profile, containerId, lines)
  );

  // Dialogs
  ipcMain.handle('dialog:selectLocalFile', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      buttonLabel: 'Вибрати файл для завантаження',
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:selectLocalSavePath', async (_e, defaultFilename: string) => {
    if (!win) return null;
    const res = await dialog.showSaveDialog(win, {
      defaultPath: defaultFilename,
      buttonLabel: 'Зберегти файл',
    });
    return res.canceled ? null : res.filePath;
  });

  // System Theme
  ipcMain.handle('system:getTheme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
  ipcMain.handle('system:setThemeSource', (_e, mode: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = mode;
  });
  ipcMain.handle('system:openExternal', (_e, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });
  ipcMain.handle(
    'system:showNotification',
    (_e, title: string, body: string, _type?: 'info' | 'warning' | 'error') => {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: title || 'V-Master',
          body: body || '',
          silent: false,
        });
        notif.show();
        return true;
      }
      return false;
    }
  );

  ipcMain.handle('app-update:getReleaseNotes', async (_e, version: string) => {
    try {
      const tag = version.startsWith('v') ? version : `v${version}`;
      const res = await fetch(`https://api.github.com/repos/MagnaMentes/v-master/releases/tags/${tag}`, {
        headers: { 'User-Agent': 'V-Master-App' },
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.body || null;
    } catch {
      return null;
    }
  });

  // App Update Actions
  ipcMain.handle('app-update:installNow', () => {
    try {
      ssh.disconnectAll();
    } catch {
      // ignore
    }

    // On macOS without Apple Developer ID signing, Squirrel.Mac fails silently to replace running .app.
    // We provide a guaranteed in-place replacement and restart script.
    if (process.platform === 'darwin' && downloadedZipPath && fs.existsSync(downloadedZipPath)) {
      try {
        const appBundlePath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '');
        const currentPid = process.pid;
        const zipFile = downloadedZipPath;

        const script = `
          while kill -0 ${currentPid} 2>/dev/null; do
            sleep 0.1
          done
          TMP_EXTRACT=$(mktemp -d)
          unzip -q -o "${zipFile}" -d "$TMP_EXTRACT"
          NEW_APP=$(find "$TMP_EXTRACT" -maxdepth 2 -name "*.app" | head -n 1)
          if [ -n "$NEW_APP" ] && [ -d "$NEW_APP" ]; then
            xattr -rd com.apple.quarantine "$NEW_APP" 2>/dev/null || true
            rm -rf "${appBundlePath}"
            ditto "$NEW_APP" "${appBundlePath}"
            rm -rf "$TMP_EXTRACT"
            open -n "${appBundlePath}"
          fi
        `;

        const helper = spawn('/bin/sh', ['-c', script], {
          detached: true,
          stdio: 'ignore',
        });
        helper.unref();

        app.exit(0);
        return;
      } catch (err) {
        console.error('Custom macOS installer failed:', err);
      }
    }

    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      console.warn('quitAndInstall failed:', err);
    }

    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 1000);
  });
}
