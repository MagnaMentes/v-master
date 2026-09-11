import type { SSHProfile, VMDiagnosticsData, VMProcessInfo, VMDiskUsageInfo } from '../src/types';
import type { SSHService } from './ssh';

export class DiagnosticsService {
  constructor(private ssh: SSHService) {}

  private buildSudoCommand(profile: SSHProfile, innerCommand: string, sudoPassword?: string): string {
    const isRoot = profile.username === 'root';
    if (isRoot) {
      return innerCommand;
    }

    const pass = sudoPassword || profile.password;
    if (pass && pass.trim().length > 0) {
      const escapedPass = pass.replace(/'/g, "'\\''");
      return `echo '${escapedPass}' | sudo -S -p '' ${innerCommand}`;
    }

    return `sudo -n ${innerCommand}`;
  }

  private isTransientNetworkError(errStr?: string): boolean {
    if (!errStr) return false;
    return (
      errStr.includes('ECONNREFUSED') ||
      errStr.includes('ETIMEDOUT') ||
      errStr.includes('ECONNRESET') ||
      errStr.includes('Connection refused')
    );
  }

  public async getDiagnostics(
    profile: SSHProfile
  ): Promise<{ success: boolean; data?: VMDiagnosticsData; error?: string }> {
    const script = `
echo "===MEM==="
free -h 2>/dev/null || free -m 2>/dev/null
echo "===MEM_BYTES==="
free -b 2>/dev/null
echo "===DISK==="
df -h -P -x tmpfs -x devtmpfs -x squashfs 2>/dev/null
echo "===PS==="
ps aux --sort=-%mem | head -n 35
`;

    let lastError = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.ssh.execCommand(profile, script, 15000);
        const stdout = res.stdout || '';

        const memPart = stdout.split('===MEM===')[1]?.split('===MEM_BYTES===')[0]?.trim() || '';
        const memBytesPart = stdout.split('===MEM_BYTES===')[1]?.split('===DISK===')[0]?.trim() || '';
        const diskPart = stdout.split('===DISK===')[1]?.split('===PS===')[0]?.trim() || '';
        const psPart = stdout.split('===PS===')[1]?.trim() || '';

        // Parse memory
        let memTotal = '';
        let memUsed = '';
        let memFree = '';
        let memAvailable = '';
        let swapTotal = '';
        let swapUsed = '';

        const memLines = memPart.split('\n');
        for (const line of memLines) {
          const parts = line.trim().split(/\s+/);
          if (parts[0]?.toLowerCase().startsWith('mem:')) {
            memTotal = parts[1] || '';
            memUsed = parts[2] || '';
            memFree = parts[3] || '';
            memAvailable = parts[6] || parts[3] || '';
          } else if (parts[0]?.toLowerCase().startsWith('swap:')) {
            swapTotal = parts[1] || '';
            swapUsed = parts[2] || '';
          }
        }

        // Parse exact bytes
        let memTotalBytes: number | undefined;
        let memUsedBytes: number | undefined;
        let memAvailableBytes: number | undefined;

        const bytesLines = memBytesPart.split('\n');
        for (const line of bytesLines) {
          const parts = line.trim().split(/\s+/);
          if (parts[0]?.toLowerCase().startsWith('mem:')) {
            const tot = parseInt(parts[1], 10);
            const usd = parseInt(parts[2], 10);
            const avl = parseInt(parts[6] || parts[3], 10);
            if (!isNaN(tot)) memTotalBytes = tot;
            if (!isNaN(usd)) memUsedBytes = usd;
            if (!isNaN(avl)) memAvailableBytes = avl;
          }
        }

        // Parse Disks
        const disks: VMDiskUsageInfo[] = [];
        const diskLines = diskPart.split('\n');
        for (let i = 1; i < diskLines.length; i++) {
          const line = diskLines[i].trim();
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 6) {
            disks.push({
              filesystem: parts[0],
              size: parts[1],
              used: parts[2],
              avail: parts[3],
              usePercent: parts[4],
              mountedOn: parts.slice(5).join(' '),
            });
          }
        }

        // Parse Processes
        const processes: VMProcessInfo[] = [];
        const psLines = psPart.split('\n');
        for (let i = 1; i < psLines.length; i++) {
          const line = psLines[i].trim();
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 11) {
            const user = parts[0];
            const pid = parseInt(parts[1], 10);
            const cpu = parseFloat(parts[2]) || 0;
            const mem = parseFloat(parts[3]) || 0;
            const vsz = parseInt(parts[4], 10) || 0;
            const rss = parseInt(parts[5], 10) || 0;
            const command = parts.slice(10).join(' ');

            if (!isNaN(pid)) {
              processes.push({
                pid,
                user,
                cpu,
                mem,
                vsz,
                rss,
                command,
              });
            }
          }
        }

        return {
          success: true,
          data: {
            processes,
            disks,
            memTotal,
            memUsed,
            memFree,
            memAvailable,
            swapTotal,
            swapUsed,
            memTotalBytes,
            memUsedBytes,
            memAvailableBytes,
          },
        };
      } catch (err: any) {
        lastError = err.message || 'Не вдалося отримати діагностичні дані';
        if (this.isTransientNetworkError(lastError) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        return { success: false, error: lastError };
      }
    }

    return { success: false, error: lastError || 'Не вдалося підключитися для діагностики' };
  }

  public async manageProcess(
    profile: SSHProfile,
    action: 'kill' | 'kill-9' | 'restart-service' | 'drop-caches',
    target: string,
    sudoPassword?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let rawCmd = '';
      if (action === 'kill') {
        const pid = parseInt(target, 10);
        if (isNaN(pid)) return { success: false, error: 'Некоректний PID' };
        rawCmd = `kill ${pid}`;
      } else if (action === 'kill-9') {
        const pid = parseInt(target, 10);
        if (isNaN(pid)) return { success: false, error: 'Некоректний PID' };
        rawCmd = `kill -9 ${pid}`;
      } else if (action === 'restart-service') {
        // Sanitize service name
        const cleanName = target.replace(/[^a-zA-Z0-9_.-]/g, '');
        if (!cleanName) return { success: false, error: 'Некоректне імʼя служби' };
        rawCmd = `systemctl restart ${cleanName}`;
      } else if (action === 'drop-caches') {
        rawCmd = `sh -c 'sync 2>/dev/null; echo 3 > /proc/sys/vm/drop_caches'`;
      } else {
        return { success: false, error: 'Невідома дія' };
      }

      const cmd = `${this.buildSudoCommand(profile, rawCmd, sudoPassword)} 2>&1`;
      const timeoutMs = action === 'drop-caches' ? 45000 : 25000;
      const res = await this.ssh.execCommand(profile, cmd, timeoutMs);

      if (res.code !== 0) {
        return {
          success: false,
          error: res.stdout || res.stderr || `Команда завершилась з кодом ${res.code}`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Помилка виконання дії' };
    }
  }
}
