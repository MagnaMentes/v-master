import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ProxmoxServerConfig, SSHProfile, Snippet, AppSettings } from '../src/types';

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

interface StoreData {
  servers: ProxmoxServerConfig[];
  sshProfiles: SSHProfile[];
  snippets: Snippet[];
  settings: AppSettings;
  windowBounds?: WindowBounds;
}

const defaultSnippets: Snippet[] = [
  {
    id: 'snip-1',
    title: 'Оновлення системи (APT)',
    description: 'Оновлення індексу та встановлення оновлень безпеки',
    command: 'sudo apt update && sudo apt upgrade -y',
    category: 'package',
  },
  {
    id: 'snip-2',
    title: 'Очищення пакетів APT',
    description: 'Видалення непотрібних залежностей та кешу',
    command: 'sudo apt autoremove -y && sudo apt clean',
    category: 'package',
  },
  {
    id: 'snip-3',
    title: 'Статус системних ресурсів',
    description: 'Перегляд дискового простору та оперативної пам’яті',
    command: 'df -h && echo "--- RAM ---" && free -m',
    category: 'system',
  },
  {
    id: 'snip-4',
    title: 'Мережеві підключення',
    description: 'Перегляд відкритих портів та слухачів',
    command: 'sudo ss -tulpn',
    category: 'network',
  },
  {
    id: 'snip-5',
    title: 'Статус служб systemd (Failed)',
    description: 'Перевірка збійних служб у системі',
    command: 'systemctl --failed',
    category: 'system',
  },
  {
    id: 'snip-6',
    title: 'Docker: статус контейнерів',
    description: 'Список активних та зупинених контейнерів',
    command: 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
    category: 'docker',
  },
  {
    id: 'snip-7',
    title: 'Docker: використання ресурсів (stats)',
    description: 'Моніторинг споживання CPU та пам’яті контейнерами',
    command: 'docker stats --no-stream',
    category: 'docker',
  },
  {
    id: 'snip-8',
    title: 'Журнал помилок системи (journalctl)',
    description: 'Останні 50 повідомлень рівня err',
    command: 'sudo journalctl -p 3 -xb -n 50 --no-pager',
    category: 'system',
  }
];

const defaultSettings: AppSettings = {
  theme: 'system',
  terminalTheme: 'dark',
  terminalFontSize: 14,
  terminalFontFamily: 'Menlo, Monaco, "Courier New", monospace',
  refreshInterval: 3,
  autoConnectTerminal: true,
};

export class AppStore {
  private filePath: string;
  private _data: StoreData | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'v-master-store.json');
  }

  private get data(): StoreData {
    if (!this._data) {
      this._data = this.load();
    }
    return this._data;
  }

  private encrypt(value?: string): string | undefined {
    if (!value) return undefined;
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = safeStorage.encryptString(value);
        return `enc:${buffer.toString('base64')}`;
      } catch (e) {
        console.error('Failed to encrypt:', e);
        return value;
      }
    }
    return value;
  }

  private decrypt(value?: string): string | undefined {
    if (!value) return undefined;
    if (value.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
      try {
        const base64Str = value.slice(4);
        const buffer = Buffer.from(base64Str, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (e) {
        console.error('Failed to decrypt:', e);
        return value;
      }
    }
    return value;
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);

        // Decrypt servers secrets
        const servers = (parsed.servers || []).map((s: ProxmoxServerConfig) => ({
          ...s,
          tokenSecret: this.decrypt(s.tokenSecret),
          password: this.decrypt(s.password),
        }));

        // Decrypt SSH passwords
        const sshProfiles = (parsed.sshProfiles || []).map((p: SSHProfile) => ({
          ...p,
          password: this.decrypt(p.password),
          privateKeyPassphrase: this.decrypt(p.privateKeyPassphrase),
          sudoPassword: this.decrypt(p.sudoPassword),
        }));

        return {
          servers,
          sshProfiles,
          snippets: parsed.snippets?.length ? parsed.snippets : defaultSnippets,
          settings: { ...defaultSettings, ...parsed.settings },
        };
      }
    } catch (e) {
      console.error('Failed to load store, initializing defaults:', e);
    }

    return {
      servers: [],
      sshProfiles: [],
      snippets: defaultSnippets,
      settings: defaultSettings,
    };
  }

  public save(): void {
    try {
      const dataToSave: StoreData = {
        ...this.data,
        servers: this.data.servers.map((s) => ({
          ...s,
          tokenSecret: this.encrypt(s.tokenSecret),
          password: this.encrypt(s.password),
        })),
        sshProfiles: this.data.sshProfiles.map((p) => ({
          ...p,
          password: this.encrypt(p.password),
          privateKeyPassphrase: this.encrypt(p.privateKeyPassphrase),
          sudoPassword: this.encrypt(p.sudoPassword),
        })),
      };

      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save store:', e);
    }
  }

  // Getters & Setters
  public getServers(): ProxmoxServerConfig[] {
    return this.data.servers;
  }

  public saveServer(server: ProxmoxServerConfig): void {
    const idx = this.data.servers.findIndex((s) => s.id === server.id);
    if (idx >= 0) {
      this.data.servers[idx] = server;
    } else {
      this.data.servers.push(server);
    }
    this.save();
  }

  public deleteServer(id: string): void {
    this.data.servers = this.data.servers.filter((s) => s.id !== id);
    this.save();
  }

  public getSSHProfiles(): SSHProfile[] {
    return this.data.sshProfiles;
  }

  public saveSSHProfile(profile: SSHProfile): void {
    const idx = this.data.sshProfiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      this.data.sshProfiles[idx] = profile;
    } else {
      this.data.sshProfiles.push(profile);
    }
    this.save();
  }

  public deleteSSHProfile(id: string): void {
    this.data.sshProfiles = this.data.sshProfiles.filter((p) => p.id !== id);
    this.save();
  }

  public getSnippets(): Snippet[] {
    return this.data.snippets;
  }

  public saveSnippet(snippet: Snippet): void {
    const idx = this.data.snippets.findIndex((s) => s.id === snippet.id);
    if (idx >= 0) {
      this.data.snippets[idx] = snippet;
    } else {
      this.data.snippets.push(snippet);
    }
    this.save();
  }

  public deleteSnippet(id: string): void {
    this.data.snippets = this.data.snippets.filter((s) => s.id !== id);
    this.save();
  }

  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public saveSettings(settings: Partial<AppSettings>): void {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }

  public getWindowBounds(): WindowBounds | undefined {
    return this.data.windowBounds;
  }

  public saveWindowBounds(bounds: WindowBounds): void {
    this.data.windowBounds = bounds;
    this.save();
  }
}
