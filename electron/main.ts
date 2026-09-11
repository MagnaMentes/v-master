import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
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
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

const store = new AppStore();
const proxmox = new ProxmoxService();
const ssh = new SSHService();
const updates = new UpdateService(ssh);
const diagnostics = new DiagnosticsService(ssh);

function createWindow() {
  win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
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
  registerIpcHandlers();
  createWindow();

  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      if (win && !win.isDestroyed()) {
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Доступне оновлення',
          message: `Знайдено нову версію V-Master v${info.version}! Вона завантажується у фоні.`,
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (win && !win.isDestroyed()) {
        dialog
          .showMessageBox(win, {
            type: 'info',
            title: 'Оновлення готове до встановлення',
            message: `Версію v${info.version} успішно завантажено. Перезапустити V-Master для оновлення?`,
            buttons: ['Перезапустити зараз', 'Оновити при закритті'],
            defaultId: 0,
          })
          .then((choice) => {
            if (choice.response === 0) {
              autoUpdater.quitAndInstall();
            }
          });
      }
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('Auto-updater check failed:', err?.message || err);
    });
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
  ipcMain.handle('proxmox:getVMMetrics', (_e, config: ProxmoxServerConfig, node: string, vmid: number) =>
    proxmox.getVMMetrics(config, node, vmid)
  );
  ipcMain.handle(
    'proxmox:executeVMAction',
    (_e, config: ProxmoxServerConfig, node: string, vmid: number, action: any) =>
      proxmox.executeVMAction(config, node, vmid, action)
  );
  ipcMain.handle('proxmox:getSnapshots', (_e, config: ProxmoxServerConfig, node: string, vmid: number) =>
    proxmox.getSnapshots(config, node, vmid)
  );
  ipcMain.handle(
    'proxmox:createSnapshot',
    (_e, config: ProxmoxServerConfig, node: string, vmid: number, name: string, desc?: string, vmstate?: boolean) =>
      proxmox.createSnapshot(config, node, vmid, name, desc, vmstate)
  );
  ipcMain.handle('proxmox:rollbackSnapshot', (_e, config: ProxmoxServerConfig, node: string, vmid: number, name: string) =>
    proxmox.rollbackSnapshot(config, node, vmid, name)
  );
  ipcMain.handle('proxmox:deleteSnapshot', (_e, config: ProxmoxServerConfig, node: string, vmid: number, name: string) =>
    proxmox.deleteSnapshot(config, node, vmid, name)
  );
  ipcMain.handle('proxmox:getTermproxyTicket', (_e, config: ProxmoxServerConfig, node: string, vmid?: number) =>
    proxmox.getTermproxyTicket(config, node, vmid)
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
}
