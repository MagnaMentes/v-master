import type { SSHProfile, SystemUpdate } from '../src/types';
import type { SSHService } from './ssh';

export class UpdateService {
  constructor(private ssh: SSHService) {}

  public isPackageDangerous(pkgName: string): { isDangerous: boolean; reason?: string } {
    const name = pkgName.toLowerCase();

    // 1. Linux Kernel & modules (reboot required, risk of boot failure)
    if (
      name.startsWith('linux-image') ||
      name.startsWith('linux-modules') ||
      name.startsWith('linux-headers') ||
      name.startsWith('linux-generic')
    ) {
      return {
        isDangerous: true,
        reason: 'Оновлення ядра Linux наживо вимагає обовʼязкового перезавантаження та може призвести до збою завантаження без попереднього знімка системи.',
      };
    }

    // 2. Core C library & init system (libc, systemd, grub)
    if (name === 'libc6' || name.startsWith('glibc') || name === 'locales') {
      return {
        isDangerous: true,
        reason: 'Базова системна бібліотека C (glibc). Оновлення наживо може викликати критичний збій активних процесів.',
      };
    }

    if (name.startsWith('systemd') || name === 'udev' || name.startsWith('grub')) {
      return {
        isDangerous: true,
        reason: 'Критичний системний менеджер ініціалізації або завантажувач (GRUB/systemd). Рекомендується ручне оновлення через термінал зі знімком.',
      };
    }

    // 3. Database servers (risk of data corruption or immediate service termination)
    if (
      name.startsWith('mysql') ||
      name.startsWith('mariadb') ||
      name.startsWith('postgresql') ||
      name.startsWith('redis-server') ||
      name.startsWith('etcd')
    ) {
      return {
        isDangerous: true,
        reason: 'Сервер баз даних. Автоматичне оновлення без резервної копії та міграцій може призвести до втрати даних або зупинки сервісів.',
      };
    }

    // 4. Low-level package managers
    if (name === 'dpkg' || name === 'apt') {
      return {
        isDangerous: true,
        reason: 'Менеджер пакунків системи. Оновлення під час виконання може перервати поточну транзакцію.',
      };
    }

    return { isDangerous: false };
  }

  private buildSudoCommand(profile: SSHProfile, innerCommand: string, sudoPassword?: string): string {
    const isRoot = profile.username === 'root';
    if (isRoot) {
      return innerCommand;
    }

    const pass = sudoPassword || profile.password;
    if (pass && pass.trim().length > 0) {
      // Escape single quotes for bash
      const escapedPass = pass.replace(/'/g, "'\\''");
      return `echo '${escapedPass}' | sudo -S -p '' ${innerCommand}`;
    }

    // Default fallback to non-interactive sudo
    return `sudo -n ${innerCommand}`;
  }

  public async checkUpdates(
    profile: SSHProfile
  ): Promise<{ success: boolean; updates: SystemUpdate[]; error?: string }> {
    try {
      // Run dry-run dist-upgrade with apt simulation
      const cmd = `LANG=C apt-get -s dist-upgrade 2>/dev/null`;
      const res = await this.ssh.execCommand(profile, cmd, 30000);

      const updates: SystemUpdate[] = [];
      const lines = res.stdout.split('\n');

      // Example Inst line:
      // Inst curl [7.81.0-1ubuntu1.16] (7.81.0-1ubuntu1.17 Ubuntu:22.04/jammy-updates, Ubuntu:22.04/jammy-security [amd64])
      for (const line of lines) {
        if (!line.startsWith('Inst ')) continue;

        const parts = line.split(/\s+/);
        const packageName = parts[1];
        if (!packageName) continue;

        // Current version in brackets: [7.81.0-...]
        const curMatch = line.match(/\[([^\]]+)\]/);
        const currentVersion = curMatch ? curMatch[1] : 'installed';

        // New version in parenthesis: (7.81.0-... ...)
        const newMatch = line.match(/\(([^\s\)]+)/);
        const newVersion = newMatch ? newMatch[1] : 'latest';

        const isSecurity = line.toLowerCase().includes('security');
        const { isDangerous, reason } = this.isPackageDangerous(packageName);

        const isCritical =
          isSecurity ||
          packageName.includes('openssh') ||
          packageName.includes('ssl') ||
          packageName.includes('sudo') ||
          packageName.includes('bash') ||
          packageName.includes('nginx') ||
          packageName.includes('docker') ||
          isDangerous;

        updates.push({
          packageName,
          currentVersion,
          newVersion,
          isSecurity,
          isCritical,
          isDangerous,
          dangerReason: reason,
          description: isSecurity
            ? 'Містить виправлення вразливостей безпеки (CVE)'
            : 'Системне оновлення стабільності та компонентів',
        });
      }

      // Sort: critical and security first, then dangerous
      updates.sort((a, b) => {
        if (a.isCritical && !b.isCritical) return -1;
        if (!a.isCritical && b.isCritical) return 1;
        if (a.isSecurity && !b.isSecurity) return -1;
        if (!a.isSecurity && b.isSecurity) return 1;
        return a.packageName.localeCompare(b.packageName);
      });

      return { success: true, updates };
    } catch (err: any) {
      return { success: false, updates: [], error: err.message };
    }
  }

  private isConnectionDropError(errStr?: string): boolean {
    if (!errStr) return false;
    return (
      errStr.includes('ECONNREFUSED') ||
      errStr.includes('ETIMEDOUT') ||
      errStr.includes('ECONNRESET') ||
      errStr.includes('Connection refused')
    );
  }

  private async isPackageInstalled(profile: SSHProfile, packageName: string): Promise<boolean> {
    try {
      const res = await this.ssh.execCommand(profile, `dpkg -s ${packageName} 2>/dev/null | grep "Status: install ok installed"`, 10000);
      return res.code === 0 && res.stdout.includes('Status: install ok installed');
    } catch {
      return false;
    }
  }

  public async installUpdate(
    profile: SSHProfile,
    packageName: string,
    sudoPassword?: string
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const dangerCheck = this.isPackageDangerous(packageName);
    if (dangerCheck.isDangerous) {
      return {
        success: false,
        error: `Оновлення заблоковано системою безпеки: ${dangerCheck.reason}`,
      };
    }

    const aptCmd = `DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove ${packageName}`;
    const cmd = `${this.buildSudoCommand(profile, aptCmd, sudoPassword)} 2>&1`;

    let lastError = '';
    let lastStdout = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await this.ssh.execCommand(profile, cmd, 180000);
        lastStdout = res.stdout;

        if (res.code !== 0) {
          const outputLines = (res.stdout || '').split('\n').filter((l) => l.trim().length > 0);
          const aptErrors = outputLines.filter((l) => l.startsWith('E:') || l.includes('dpkg:') || l.includes('error'));
          const detailedError =
            aptErrors.length > 0
              ? aptErrors.slice(-2).join('; ')
              : res.stderr || outputLines.slice(-2).join('; ') || `Код завершення ${res.code}`;

          return {
            success: false,
            output: res.stdout,
            error: detailedError,
          };
        }

        return {
          success: true,
          output: res.stdout,
        };
      } catch (err: any) {
        lastError = err.message || 'Помилка виконання команди';
        if (this.isConnectionDropError(lastError) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          // Check if package finished installing despite connection drop
          const isInstalled = await this.isPackageInstalled(profile, packageName);
          if (isInstalled) {
            return { success: true, output: 'Встановлено успішно (перевірено через dpkg)' };
          }
          continue;
        }
        // Final attempt check
        if (this.isConnectionDropError(lastError)) {
          const isInstalled = await this.isPackageInstalled(profile, packageName);
          if (isInstalled) {
            return { success: true, output: 'Встановлено успішно (перевірено через dpkg)' };
          }
        }
        return { success: false, error: lastError };
      }
    }

    return { success: false, error: lastError || 'Перевищено ліміт спроб', output: lastStdout };
  }

  public async installAllSafeUpdates(
    profile: SSHProfile,
    packageNames: string[],
    sudoPassword?: string
  ): Promise<{ success: boolean; installed: string[]; output?: string; error?: string }> {
    const safePackages = packageNames.filter((pkg) => !this.isPackageDangerous(pkg).isDangerous);
    if (safePackages.length === 0) {
      return {
        success: false,
        installed: [],
        error: 'Не знайдено дозволених для автоматичного оновлення компонентів.',
      };
    }

    const pkgsArg = safePackages.join(' ');
    const aptCmd = `DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove ${pkgsArg}`;
    const cmd = `${this.buildSudoCommand(profile, aptCmd, sudoPassword)} 2>&1`;

    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await this.ssh.execCommand(profile, cmd, 300000);

        if (res.code !== 0) {
          return {
            success: false,
            installed: [],
            output: res.stdout,
            error: res.stderr || `Помилка масового оновлення (код ${res.code}).`,
          };
        }

        return {
          success: true,
          installed: safePackages,
          output: res.stdout,
        };
      } catch (err: any) {
        lastError = err.message || 'Помилка масового оновлення';
        if (this.isConnectionDropError(lastError) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        return { success: false, installed: [], error: lastError };
      }
    }

    return { success: false, installed: [], error: lastError };
  }
}

