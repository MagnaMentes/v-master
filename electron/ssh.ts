import { Client, ClientChannel } from 'ssh2';
import SftpClient from 'ssh2-sftp-client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { BrowserWindow } from 'electron';
import type { SSHProfile, SFTPItem } from '../src/types';

interface SSHSession {
  id: string;
  client: Client;
  stream: ClientChannel;
}

export class SSHService {
  private sessions: Map<string, SSHSession> = new Map();

  public resolveKeyPath(keyPath?: string): string | undefined {
    if (!keyPath) return undefined;
    if (keyPath.startsWith('~')) {
      return path.join(os.homedir(), keyPath.slice(1));
    }
    return keyPath;
  }

  public getSshAuthSock(): string | undefined {
    if (process.env.SSH_AUTH_SOCK && fs.existsSync(process.env.SSH_AUTH_SOCK)) {
      return process.env.SSH_AUTH_SOCK;
    }
    if (process.platform === 'darwin') {
      try {
        const sock = execSync('launchctl getenv SSH_AUTH_SOCK', { encoding: 'utf8', timeout: 1000 }).trim();
        if (sock && fs.existsSync(sock)) {
          return sock;
        }
      } catch {
        // Fallback or ignore
      }
    }
    return undefined;
  }

  public getSshConfigUser(host?: string): string | undefined {
    try {
      const configPath = path.join(os.homedir(), '.ssh', 'config');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        let currentHostMatches = false;
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line.startsWith('#') || !line) continue;
          const [key, ...rest] = line.split(/\s+/);
          const val = rest.join(' ');
          if (key && key.toLowerCase() === 'host') {
            currentHostMatches = Boolean(host && val.split(/\s+/).some((h) => h === host || h === '*'));
          } else if (currentHostMatches && key && key.toLowerCase() === 'user') {
            return val;
          }
        }
      }
    } catch {
      // Ignored
    }
    return undefined;
  }

  public getDefaultPrivateKey(): string | undefined {
    const candidates = ['id_ed25519', 'id_rsa', 'id_ecdsa'];
    for (const name of candidates) {
      const p = path.join(os.homedir(), '.ssh', name);
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  }

  public getSystemDefaults(host?: string): { username: string; privateKeyPath?: string } {
    const configUser = this.getSshConfigUser(host);
    const systemUser = os.userInfo().username;
    const defaultKey = this.getDefaultPrivateKey();
    return {
      username: configUser || systemUser || 'ubuntu',
      privateKeyPath: defaultKey ? `~/.ssh/${path.basename(defaultKey)}` : undefined,
    };
  }

  public connect(
    sessionId: string,
    profile: SSHProfile,
    rows: number,
    cols: number,
    window: BrowserWindow
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect(sessionId);

      const client = new Client();

      client.on('ready', () => {
        client.shell(
          {
            term: 'xterm-256color',
            rows: rows || 24,
            cols: cols || 80,
          },
          (err, stream) => {
            if (err) {
              client.end();
              reject(err);
              return;
            }

            this.sessions.set(sessionId, { id: sessionId, client, stream });

            stream.on('data', (data: Buffer) => {
              if (!window.isDestroyed()) {
                window.webContents.send('ssh:data', sessionId, data.toString('utf8'));
              }
            });

            stream.stderr?.on('data', (data: Buffer) => {
              if (!window.isDestroyed()) {
                window.webContents.send('ssh:data', sessionId, data.toString('utf8'));
              }
            });

            stream.on('close', () => {
              if (!window.isDestroyed()) {
                window.webContents.send('ssh:closed', sessionId);
              }
              this.disconnect(sessionId);
            });

            resolve();
          }
        );
      });

      client.on('error', (err) => {
        if (!window.isDestroyed()) {
          window.webContents.send('ssh:error', sessionId, err.message);
        }
        reject(err);
      });

      try {
        // Resolve username: explicit profile user > ~/.ssh/config > current OS user > root
        const configUser = this.getSshConfigUser(profile.host);
        let username = profile.username;
        if (!username || username === 'ubuntu') {
          username = configUser || os.userInfo().username || 'root';
        }

        const connectConfig: any = {
          host: profile.host,
          port: profile.port || 22,
          username,
          readyTimeout: 15000,
          keepaliveInterval: 10000,
        };

        // 1. Support macOS ssh-agent (used by standard terminal)
        const agentSock = this.getSshAuthSock();
        if (agentSock) {
          connectConfig.agent = agentSock;
        }

        // 2. Private Key & Passphrase
        if (profile.authType === 'privateKey' || !profile.password) {
          const resolvedPath = this.resolveKeyPath(profile.privateKeyPath) || this.getDefaultPrivateKey();
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            connectConfig.privateKey = fs.readFileSync(resolvedPath);
            if (profile.privateKeyPassphrase) {
              connectConfig.passphrase = profile.privateKeyPassphrase;
            }
          }
        } else if (profile.password) {
          connectConfig.password = profile.password;
        }

        client.connect(connectConfig);
      } catch (e) {
        reject(e);
      }
    });
  }

  public write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.stream && session.stream.writable) {
      session.stream.write(data);
    }
  }

  public resize(sessionId: string, rows: number, cols: number): void {
    const session = this.sessions.get(sessionId);
    if (session && session.stream) {
      session.stream.setWindow(rows, cols, 0, 0);
    }
  }

  public disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.stream?.removeAllListeners();
        session.stream?.destroy();
      } catch {
        // Ignored
      }
      try {
        session.client?.removeAllListeners();
        session.client?.end();
        session.client?.destroy();
      } catch {
        // Ignored
      }
      this.sessions.delete(sessionId);
    }
  }

  public disconnectAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.disconnect(sessionId);
    }
  }

  // SFTP Operations
  private async getSftpClient(profile: SSHProfile): Promise<SftpClient> {
    const sftp = new SftpClient();
    const configUser = this.getSshConfigUser(profile.host);
    let username = profile.username;
    if (!username || username === 'ubuntu') {
      username = configUser || os.userInfo().username || 'root';
    }

    const connectConfig: any = {
      host: profile.host,
      port: profile.port || 22,
      username,
      readyTimeout: 15000,
    };

    const agentSock = this.getSshAuthSock();
    if (agentSock) {
      connectConfig.agent = agentSock;
    }

    if (profile.authType === 'privateKey' || !profile.password) {
      const resolvedPath = this.resolveKeyPath(profile.privateKeyPath) || this.getDefaultPrivateKey();
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        connectConfig.privateKey = fs.readFileSync(resolvedPath);
        if (profile.privateKeyPassphrase) {
          connectConfig.passphrase = profile.privateKeyPassphrase;
        }
      }
    } else if (profile.password) {
      connectConfig.password = profile.password;
    }

    await sftp.connect(connectConfig);
    return sftp;
  }

  public async sftpList(profile: SSHProfile, remotePath: string): Promise<SFTPItem[]> {
    const sftp = await this.getSftpClient(profile);
    try {
      const targetPath = remotePath && remotePath.trim() !== '' ? remotePath : '.';
      let list;
      try {
        list = await sftp.list(targetPath);
      } catch (err) {
        if (targetPath !== '.' && targetPath !== '/') {
          try {
            list = await sftp.list('.');
          } catch {
            list = await sftp.list('/');
          }
        } else {
          throw err;
        }
      }
      return (list || []).map((item) => ({
        name: item.name,
        type: item.type === 'd' ? 'directory' : item.type === 'l' ? 'link' : 'file',
        size: item.size,
        modifyTime: item.modifyTime,
        permissions: item.rights ? `${item.rights.user}${item.rights.group}${item.rights.other}` : '',
      }));
    } finally {
      await sftp.end();
    }
  }

  public async sftpDownload(
    profile: SSHProfile,
    remotePath: string,
    localPath: string
  ): Promise<{ success: boolean; error?: string }> {
    const sftp = await this.getSftpClient(profile);
    try {
      await sftp.fastGet(remotePath, localPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await sftp.end();
    }
  }

  public async sftpUpload(
    profile: SSHProfile,
    localPath: string,
    remotePath: string
  ): Promise<{ success: boolean; error?: string }> {
    const sftp = await this.getSftpClient(profile);
    try {
      await sftp.fastPut(localPath, remotePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await sftp.end();
    }
  }

  public async sftpDelete(
    profile: SSHProfile,
    remotePath: string,
    isDir: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const sftp = await this.getSftpClient(profile);
    try {
      if (isDir) {
        await sftp.rmdir(remotePath, true);
      } else {
        await sftp.delete(remotePath);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await sftp.end();
    }
  }

  public async sftpMkdir(
    profile: SSHProfile,
    remotePath: string
  ): Promise<{ success: boolean; error?: string }> {
    const sftp = await this.getSftpClient(profile);
    try {
      await sftp.mkdir(remotePath, true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await sftp.end();
    }
  }

  public async sftpReadFile(
    profile: SSHProfile,
    remotePath: string
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    const sftp = await this.getSftpClient(profile);
    try {
      const buffer = await sftp.get(remotePath);
      return {
        success: true,
        content: Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : String(buffer),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await sftp.end();
    }
  }

  public async sftpWriteFile(
    profile: SSHProfile,
    remotePath: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    const sftp = await this.getSftpClient(profile);
    try {
      const buffer = Buffer.from(content, 'utf-8');
      await sftp.put(buffer, remotePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await sftp.end();
    }
  }

  private lastConnectTimes: Map<string, number> = new Map();

  private async throttleHost(host: string, minIntervalMs = 1200): Promise<void> {
    const last = this.lastConnectTimes.get(host) || 0;
    const now = Date.now();
    const diff = now - last;
    if (diff < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - diff));
    }
    this.lastConnectTimes.set(host, Date.now());
  }

  private formatSshError(err: any, host: string, port: number): string {
    const msg = err?.message || String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused')) {
      return `Сервер ${host}:${port} тимчасово відхилив підключення (можливе блокування Fail2ban через часті запити). Зачекайте 1–2 хвилини.`;
    }
    if (msg.includes('ETIMEDOUT')) {
      return `Час очікування підключення до ${host}:${port} вичерпано. Перевірте доступність мережі.`;
    }
    if (
      msg.includes('All configured authentication methods failed') ||
      msg.includes('authentication failed')
    ) {
      return `Помилка SSH-автентифікації на ${host}:${port}: не вдалося авторизуватися. Перевірте логін, пароль або SSH-ключ у налаштуваннях профілю цієї ВМ.`;
    }
    if (msg.includes('Permission denied')) {
      return `Доступ заборонено (Permission denied) для ${host}:${port}. Перевірте права облікового запису або коректність пароля sudo.`;
    }
    if (msg.includes('Timeout executing command') || msg.includes('timed out')) {
      return `Час очікування операції на ${host}:${port} вичерпано. Операція скидання буферів на диск зайняла більше часу ніж очікувалося.`;
    }
    return msg;
  }

  private async execCommandSingle(
    profile: SSHProfile,
    command: string,
    timeoutMs = 60000
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    await this.throttleHost(profile.host, 1200);
    return new Promise((resolve, reject) => {
      const client = new Client();
      let stdout = '';
      let stderr = '';
      let timer: NodeJS.Timeout;

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            client.end();
            clearTimeout(timer);
            return reject(err);
          }

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on('close', (code: number) => {
            client.end();
            clearTimeout(timer);
            resolve({ stdout, stderr, code: code ?? 0 });
          });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      timer = setTimeout(() => {
        try {
          client.end();
        } catch {
          // Ignored
        }
        reject(new Error(`Timeout executing command after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const configUser = this.getSshConfigUser(profile.host);
        let username = profile.username;
        if (!username || username === 'ubuntu') {
          username = configUser || os.userInfo().username || 'root';
        }

        const connectConfig: any = {
          host: profile.host,
          port: profile.port || 22,
          username,
          readyTimeout: 15000,
        };

        const agentSock = this.getSshAuthSock();
        if (agentSock) {
          connectConfig.agent = agentSock;
        }

        if (profile.authType === 'privateKey' || !profile.password) {
          const resolvedPath = this.resolveKeyPath(profile.privateKeyPath) || this.getDefaultPrivateKey();
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            connectConfig.privateKey = fs.readFileSync(resolvedPath);
            if (profile.privateKeyPassphrase) {
              connectConfig.passphrase = profile.privateKeyPassphrase;
            }
          }
        } else if (profile.password) {
          connectConfig.password = profile.password;
        }

        client.connect(connectConfig);
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  public async execCommand(
    profile: SSHProfile,
    command: string,
    timeoutMs = 60000
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    let lastErr: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.execCommandSingle(profile, command, timeoutMs);
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || '';
        const isTransient =
          msg.includes('ECONNREFUSED') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('ECONNRESET') ||
          msg.includes('Connection refused');

        if (isTransient && attempt < 3) {
          await new Promise((res) => setTimeout(res, 2000 * attempt));
          continue;
        }
        break;
      }
    }

    const port = profile.port || 22;
    const formatted = this.formatSshError(lastErr, profile.host, port);
    throw new Error(formatted);
  }

  public async testConnection(
    profile: SSHProfile
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.execCommand(profile, 'echo ok', 10000);
      if (res.code === 0) {
        return { success: true };
      }
      return {
        success: false,
        error: res.stderr || res.stdout || `Команда перевірки повернула код ${res.code}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Не вдалося підключитися через SSH',
      };
    }
  }
}
